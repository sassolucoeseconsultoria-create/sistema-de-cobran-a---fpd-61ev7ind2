import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { StoreRecord } from '@/types/fpd'

export interface UserStoreAccess {
  /**
   * Se verdadeiro, o usuário é ADM e tem acesso irrestrito a todas as lojas.
   */
  isAdm: boolean

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
      if (hasNoStoreAssigned || !storeName || !storeName.trim()) return false

      const cleanName = storeName.trim().toUpperCase()

      // Se temos a lista de todas as lojas para conferir IDs -> nomes
      if (allStores && allStores.length > 0) {
        const allowedNames = allStores
          .filter((s) => effectiveAllowedIds.includes(s.id))
          .map((s) => s.name.trim().toUpperCase())

        // Checagem exata ou por correspondência de nome
        if (allowedNames.includes(cleanName)) return true

        // Checagem parcial caso haja sufixos ou prefixos
        return allowedNames.some(
          (allowed) => cleanName.includes(allowed) || allowed.includes(cleanName),
        )
      }

      // Se não temos allStores, não podemos mapear storeId para storeName com certeza
      return false
    }

    return {
      isAdm,
      hasNoStoreAssigned,
      allowedStoreIds: effectiveAllowedIds,
      isStoreIdAllowed,
      isStoreNameAllowed,
      filterStores,
      getAllowedStoreNames,
    }
  }, [user])
}
