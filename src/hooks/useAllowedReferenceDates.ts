import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchDistinctReferenceDates } from '@/services/fpdService'
import {
  fetchReferenceDatePermissions,
  filterReferenceDatesForRole,
  isReferenceDateAllowedForRole,
  sortReferenceDatesDesc,
} from '@/services/referenceDatePermissionService'
import { useRealtime } from '@/hooks/use-realtime'
import type { ReferenceDatePermissionRecord } from '@/types/fpd'

export interface UseAllowedReferenceDatesResult {
  /**
   * Todas as datas de referência do sistema (sem filtro de permissão, útil para ADM ou depuração)
   */
  allReferenceDates: string[]
  /**
   * Datas de referência permitidas para o perfil do usuário logado
   */
  allowedReferenceDates: string[]
  /**
   * Indica se há mais de uma data de referência permitida para o perfil (>= 2)
   */
  hasMultipleReferences: boolean
  /**
   * Data de referência padrão/inicial recomendada para o perfil:
   * - ADM: 'all' (se 2+ referências) ou a única disponível, ou 'none' se 0.
   * - Gerente, Supervisão e Coordenação: a referência habilitada mais recente (se 1+ habilitadas), ou 'none' se 0.
   */
  initialReferenceDate: string
  /**
   * Indica se o perfil do usuário logado é restrito por controle de apresentação
   * (Gerente, Supervisor ou Coordenador).
   */
  isRestrictedRole: boolean
  /**
   * Permissões carregadas do backend
   */
  permissions: ReferenceDatePermissionRecord[]
  /**
   * Status de carregamento
   */
  loading: boolean
  /**
   * Recarregar dados do backend
   */
  reload: () => Promise<void>
  /**
   * Verifica se uma data específica é permitida para o perfil do usuário logado
   */
  isDateAllowed: (dateStr: string | null | undefined) => boolean
}

/**
 * Hook centralizado que carrega as datas de referência existentes e as filtra
 * com base nas permissões cadastradas para o perfil do usuário logado.
 *
 * Regras:
 * - ADM sempre vê todas as referências.
 * - Gerente, Supervisor e Coordenador vêem apenas as referências com flag true (ou default true).
 */
export function useAllowedReferenceDates(): UseAllowedReferenceDatesResult {
  const { user } = useAuth()
  const role = user?.role

  const [allReferenceDates, setAllReferenceDates] = useState<string[]>([])
  const [permissions, setPermissions] = useState<ReferenceDatePermissionRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [dates, perms] = await Promise.all([
        fetchDistinctReferenceDates(),
        fetchReferenceDatePermissions(),
      ])
      setAllReferenceDates(dates)
      setPermissions(perms)
    } catch (err) {
      console.error('Falha ao carregar datas de referência ou permissões:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Escuta alterações em tempo real nas permissões de datas de referência
  useRealtime<ReferenceDatePermissionRecord>('reference_date_permissions', (e) => {
    if (e.action === 'create') {
      setPermissions((prev) => {
        if (prev.some((p) => p.id === e.record.id)) return prev
        return [...prev, e.record]
      })
    } else if (e.action === 'update') {
      setPermissions((prev) => prev.map((p) => (p.id === e.record.id ? { ...p, ...e.record } : p)))
    } else if (e.action === 'delete') {
      setPermissions((prev) => prev.filter((p) => p.id !== e.record.id))
    }
  })

  // Escuta novas importações para atualizar a lista de datas
  useRealtime('imported_files', () => {
    fetchDistinctReferenceDates()
      .then(setAllReferenceDates)
      .catch(() => {})
  })

  const allowedReferenceDates = useMemo(() => {
    const filtered = filterReferenceDatesForRole(allReferenceDates, role, permissions)
    return sortReferenceDatesDesc(filtered)
  }, [allReferenceDates, role, permissions])

  const hasMultipleReferences = allowedReferenceDates.length >= 2

  const isRestrictedRole = Boolean(
    role === 'Gerente' || role === 'Supervisor' || role === 'Coordenador',
  )

  const initialReferenceDate = useMemo(() => {
    if (allowedReferenceDates.length === 0) {
      return 'none'
    }

    // Para Gerente, Supervisão e Coordenação:
    // Já trazer carregado os dados na referência habilitada no Controle de Apresentação.
    // Se houver 1 ou múltiplas, selecionar a mais recente entre as habilitadas.
    if (isRestrictedRole) {
      return allowedReferenceDates[0]
    }

    // Para ADM: se houver apenas 1 data, seleciona ela; se múltiplas, 'all'
    if (allowedReferenceDates.length === 1) {
      return allowedReferenceDates[0]
    }
    return 'all'
  }, [allowedReferenceDates, isRestrictedRole])

  const isDateAllowed = useCallback(
    (dateStr: string | null | undefined) => {
      return isReferenceDateAllowedForRole(dateStr, role, permissions)
    },
    [role, permissions],
  )

  return {
    allReferenceDates,
    allowedReferenceDates,
    hasMultipleReferences,
    initialReferenceDate,
    isRestrictedRole,
    permissions,
    loading,
    reload: load,
    isDateAllowed,
  }
}
