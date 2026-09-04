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

      // Direct ID check
      if (effectiveAllowedIds.includes(raw)) return true

      const normInput = normalizeStoreString(raw)
      if (!normInput) return false

      const cleanTokens = (str: string) =>
        normalizeStoreString(str)
          .replace(/\b(celnet|loja|lj|shopping|shp|shop|mall|galeria|posto|call)\b/gi, ' ')
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

      const inputTokens = cleanTokens(normInput)

      // Se temos a lista de todas as lojas para conferir IDs -> nomes
      if (allStores && allStores.length > 0) {
        const allowedStores = allStores.filter((s) => effectiveAllowedIds.includes(s.id))
        if (allowedStores.length === 0) return false

        // 1. Check if direct matchStore against allowedStores matches
        const matchedAllowed = matchStore(raw, allowedStores)
        if (matchedAllowed && effectiveAllowedIds.includes(matchedAllowed.id)) {
          return true
        }

        // 2. Check if matchStore against allStores matches an allowed store
        const matchedAll = matchStore(raw, allStores)
        if (matchedAll && effectiveAllowedIds.includes(matchedAll.id)) {
          return true
        }

        // 3. Robust normalized token and string comparisons against allowedStores
        return allowedStores.some((store) => {
          if (isSameStore(store.name, raw)) return true
          const normStore = normalizeStoreString(store.name)
          if (normStore === normInput) return true

          const storeTokens = cleanTokens(store.name)
          if (inputTokens && storeTokens) {
            if (inputTokens === storeTokens) return true
          }

          return false
        })
      }

      // Fallback if allStores was not supplied but effectiveAllowedIds might match normalized store strings
      return effectiveAllowedIds.some((allowedId) => {
        const normAllowed = normalizeStoreString(allowedId)
        if (normAllowed === normInput) return true
        if (normInput.includes(normAllowed) || normAllowed.includes(normInput)) return true

        const allowedTokens = cleanTokens(allowedId)
        if (inputTokens && allowedTokens) {
          if (inputTokens === allowedTokens) return true
          if (inputTokens.includes(allowedTokens) || allowedTokens.includes(inputTokens))
            return true
        }
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
