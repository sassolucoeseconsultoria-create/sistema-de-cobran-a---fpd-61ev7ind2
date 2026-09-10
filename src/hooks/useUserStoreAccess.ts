import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { StoreRecord } from '@/types/fpd'
import { matchStore, normalizeStoreString } from '@/services/fpdService'
import { isSameStore } from '@/lib/storeMatchingUtils'

export interface UserStoreAccess {
  /**
   * Se verdadeiro, o usuário é ADM e tem acesso irrestrito a todas as lojas.
   */
  isAdm: boolean

  /**
   * Perfil direto do usuário logado (ADM, Coordenador, Supervisor, Gerente).
   */
  userRole?: string

  /**
   * Se o perfil do usuário logado é Gerente.
   */
  isGerente: boolean

  /**
   * Se o perfil do usuário logado é Supervisor.
   */
  isSupervisor: boolean

  /**
   * Se o perfil do usuário logado é Coordenador.
   */
  isCoordenador: boolean

  /**
   * ID da única loja vinculada (quando Gerente), se houver.
   */
  managerStoreId: string | null

  /**
   * Se o usuário NÃO é ADM e NÃO possui nenhuma loja vinculada.
   * Nesse caso, as telas devem renderizar estado vazio/sem dados.
   */
  hasNoStoreAssigned: boolean

  /**
   * Lista de IDs de lojas permitidas para o usuário (vazio para ADM se irrestrito, ou filtrado).
   */
  allowedStoreIds: string[]

  /**
   * Retorna se um determinado ID de loja é permitido para o usuário.
   */
  isStoreIdAllowed: (storeId?: string | null) => boolean

  /**
   * Retorna se um determinado nome de loja (ou texto com nome de loja) é permitido para o usuário.
   * Compara de forma normalizada (trim, case-insensitive).
   */
  isStoreNameAllowed: (storeName?: string | null, allStores?: StoreRecord[]) => boolean

  /**
   * Filtra uma lista de StoreRecord com base nas lojas vinculadas ao usuário.
   * Se for ADM, retorna a lista completa original.
   */
  filterStores: (stores: StoreRecord[]) => StoreRecord[]

  /**
   * Obtém a lista de nomes normalizados de lojas permitidas para o usuário.
   */
  getAllowedStoreNames: (allStores: StoreRecord[]) => string[]
}

/**
 * Hook centralizado para gerenciar a restrição de dados por lojas vinculadas do usuário logado.
 *
 * Regras:
 * - ADM: acesso irrestrito a todas as lojas (isAdm = true).
 * - Coordenador / Supervisor: restrito a todas as lojas em `user.lojas`.
 * - Gerente: restrito à única loja vinculada em `user.lojas`.
 * - Sem lojas vinculadas (e não-ADM): hasNoStoreAssigned = true (exibir estado vazio).
 */
export function useUserStoreAccess(): UserStoreAccess {
  const { user } = useAuth()

  return useMemo<UserStoreAccess>(() => {
    const isAdm = user?.role === 'ADM'
    const userLojas = Array.isArray(user?.lojas) ? user.lojas.filter(Boolean) : []

    // Para Gerente, por regra possui 1 loja vinculada (pega apenas a primeira se houver mais)
    const effectiveAllowedIds: string[] =
      user?.role === 'Gerente' ? userLojas.slice(0, 1) : userLojas

    const hasNoStoreAssigned = !isAdm && effectiveAllowedIds.length === 0

    const isStoreIdAllowed = (storeId?: string | null): boolean => {
      if (isAdm) return true
      if (hasNoStoreAssigned || !storeId) return false
      return effectiveAllowedIds.includes(storeId)
    }

    const filterStores = (stores: StoreRecord[]): StoreRecord[] => {
      if (isAdm) return stores
      if (hasNoStoreAssigned) return []
      return stores.filter((s) => effectiveAllowedIds.includes(s.id))
    }

    const getAllowedStoreNames = (allStores: StoreRecord[]): string[] => {
      if (isAdm) {
        return allStores.map((s) => s.name.trim()).filter(Boolean)
      }
      if (hasNoStoreAssigned) return []
      return allStores
        .filter((s) => effectiveAllowedIds.includes(s.id))
        .map((s) => s.name.trim())
        .filter(Boolean)
    }

    const isStoreNameAllowed = (storeName?: string | null, allStores?: StoreRecord[]): boolean => {
      if (isAdm) return true
      if (hasNoStoreAssigned || !storeName || !String(storeName).trim()) return false

      const raw = String(storeName).trim()

      // Direct ID check (se storeName for o próprio ID de uma loja permitida)
      if (effectiveAllowedIds.includes(raw)) return true

      const normInput = normalizeStoreString(raw)
      if (!normInput) return false

      // Diferenciação estrita de CALL / ILHA e de DF vs GO
      const isCallOrIlhaInput = /\b(call|ilha)\b/.test(normInput)
      const hasDfInput = /\bdf\b/.test(normInput)
      const hasGoInput = /\bgo\b/.test(normInput)

      // Se temos a lista de lojas cadastradas (stores)
      if (allStores && allStores.length > 0) {
        // Se a loja de entrada resolver para qualquer loja do cadastro geral via matchStore:
        const matchedAll = matchStore(raw, allStores)
        if (matchedAll) {
          // Lojas sem supervisão ou sem coordenação (ex.: CALL/ILHA) NUNCA podem ser vistas por Supervisor/Coordenador
          // a menos que estejam explicitamente na lista de lojas vinculadas do usuário
          const isAllowed = effectiveAllowedIds.includes(matchedAll.id)
          if (!isAllowed) {
            return false
          }
          // Se está entre os IDs permitidos, verificar que não haja colisão de CALL/ILHA ou DF/GO
          const normMatched = normalizeStoreString(matchedAll.name)
          const isCallOrIlhaMatched = /\b(call|ilha)\b/.test(normMatched)
          const hasDfMatched = /\bdf\b/.test(normMatched)
          const hasGoMatched = /\bgo\b/.test(normMatched)
          if (isCallOrIlhaInput !== isCallOrIlhaMatched) return false
          if ((hasDfInput && hasGoMatched) || (hasGoInput && hasDfMatched)) return false
          return true
        }

        // Se matchStore contra allStores não encontrou uma loja cadastrada:
        // A regra é: linhas de lojas não vinculadas ou não cadastradas são INVISÍVEIS por padrão para não-ADM
        const allowedStores = allStores.filter((s) => effectiveAllowedIds.includes(s.id))
        if (allowedStores.length === 0) return false

        // Comparação estrita apenas contra as lojas permitidas
        return allowedStores.some((store) => {
          const normStore = normalizeStoreString(store.name)
          const isCallOrIlhaStore = /\b(call|ilha)\b/.test(normStore)
          if (isCallOrIlhaInput !== isCallOrIlhaStore) return false

          const hasDfStore = /\bdf\b/.test(normStore)
          const hasGoStore = /\bgo\b/.test(normStore)
          if (hasDfInput && hasGoStore) return false
          if (hasGoInput && hasDfStore) return false

          // Match exato normalizado ou variante canônica estrita (isSameStore)
          if (normStore === normInput) return true
          if (isSameStore(store.name, raw)) return true

          return false
        })
      }

      // Fallback estrito se allStores não foi fornecido (apenas contra effectiveAllowedIds se contiverem nomes)
      return effectiveAllowedIds.some((allowedId) => {
        const normAllowed = normalizeStoreString(allowedId)
        if (normAllowed === normInput) return true

        const isCallOrIlhaAllowed = /\b(call|ilha)\b/.test(normAllowed)
        if (isCallOrIlhaInput !== isCallOrIlhaAllowed) return false

        const hasDfAllowed = /\bdf\b/.test(normAllowed)
        const hasGoAllowed = /\bgo\b/.test(normAllowed)
        if (hasDfInput && hasGoAllowed) return false
        if (hasGoInput && hasDfAllowed) return false

        if (isSameStore(allowedId, raw)) return true

        return false
      })
    }

    const isGerente = user?.role === 'Gerente'
    const isSupervisor = user?.role === 'Supervisor'
    const isCoordenador = user?.role === 'Coordenador'
    const managerStoreId =
      isGerente && effectiveAllowedIds.length > 0 ? effectiveAllowedIds[0] : null

    return {
      isAdm,
      userRole: user?.role,
      isGerente,
      isSupervisor,
      isCoordenador,
      managerStoreId,
      hasNoStoreAssigned,
      allowedStoreIds: effectiveAllowedIds,
      isStoreIdAllowed,
      isStoreNameAllowed,
      filterStores,
      getAllowedStoreNames,
    }
  }, [user])
}
