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
   * Aceita também opcionalmente `storeName` para resolução híbrida (ID ou nome).
   */
  isStoreIdAllowed: (storeId?: string | null, storeName?: string) => boolean

  /**
   * Helper para resolução híbrida de acesso a uma loja dado seu ID e nome.
   */
  resolveAllowed: (store: { id: string; name: string }) => boolean

  /**
   * Retorna se um determinado nome de loja (ou texto com nome de loja) é permitido para o usuário.
   * Compara de forma normalizada (trim, case-insensitive) e por contenção mútua/variantes.
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

    // Função interna de normalização (lowercase, trim, colapsar espaços múltiplos)
    const normalizeInternal = (str: unknown): string => {
      if (str === null || str === undefined) return ''
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Helper interno para verificar se um nome de loja casa com as lojas vinculadas do usuário
    const matchesUserAssignedStore = (rawStoreName: string): boolean => {
      if (!rawStoreName) return false
      const normInput = normalizeInternal(rawStoreName)
      if (!normInput) return false

      const isCallOrIlhaInput = /\b(call|ilha)\b/.test(normInput)
      const hasDfInput = /\bdf\b/.test(normInput)
      const hasGoInput = /\bgo\b/.test(normInput)

      return effectiveAllowedIds.some((assigned) => {
        if (!assigned) return false
        const normAssigned = normalizeInternal(assigned)
        if (!normAssigned) return false

        const isCallOrIlhaAssigned = /\b(call|ilha)\b/.test(normAssigned)
        if (isCallOrIlhaInput !== isCallOrIlhaAssigned) return false

        const hasDfAssigned = /\bdf\b/.test(normAssigned)
        const hasGoAssigned = /\bgo\b/.test(normAssigned)
        if ((hasDfInput && hasGoAssigned) || (hasGoInput && hasDfAssigned)) return false

        // 1. Igualdade direta ou normalizada
        if (normAssigned === normInput) return true

        // 2. isSameStore
        if (isSameStore(assigned, rawStoreName)) return true

        // 3. Contenção mútua (nome cadastrado contido no nome da linha ou vice-versa)
        // ex: "CELNET CALL" vs "CELNET CALL NOVA SUIÇA"
        if (normInput.includes(normAssigned) || normAssigned.includes(normInput)) return true

        return false
      })
    }

    const isStoreIdAllowed = (storeId?: string | null, storeName?: string): boolean => {
      if (isAdm) return true
      if (hasNoStoreAssigned) return false

      // 1. Verifica se effectiveAllowedIds contém o ID diretamente
      if (storeId && effectiveAllowedIds.includes(storeId)) return true

      // 2. Se storeName foi fornecido, verifica match híbrido por nome
      if (storeName && matchesUserAssignedStore(storeName)) {
        return true
      }

      // 3. Se storeId foi fornecido e é um nome de loja (caso não seja id de 15 chars)
      if (storeId && matchesUserAssignedStore(storeId)) {
        return true
      }

      return false
    }

    const resolveAllowed = (store: { id: string; name: string }): boolean => {
      if (isAdm) return true
      if (hasNoStoreAssigned) return false
      return isStoreIdAllowed(store.id, store.name)
    }

    const filterStores = (stores: StoreRecord[]): StoreRecord[] => {
      if (isAdm) return stores
      if (hasNoStoreAssigned) return []
      return stores.filter((s) => isStoreIdAllowed(s.id, s.name))
    }

    const getAllowedStoreNames = (allStores: StoreRecord[]): string[] => {
      if (isAdm) {
        return allStores.map((s) => s.name.trim()).filter(Boolean)
      }
      if (hasNoStoreAssigned) return []

      const matchedNames = allStores
        .filter((s) => isStoreIdAllowed(s.id, s.name))
        .map((s) => s.name.trim())
        .filter(Boolean)

      if (matchedNames.length > 0) {
        return Array.from(new Set(matchedNames))
      }

      // Se allStores não bateu nenhum ID, retorna os próprios nomes vinculados (se não forem IDs)
      return effectiveAllowedIds.map((idOrName) => idOrName.trim()).filter(Boolean)
    }

    const isStoreNameAllowed = (storeName?: string | null, allStores?: StoreRecord[]): boolean => {
      if (isAdm) return true
      if (hasNoStoreAssigned || !storeName || !String(storeName).trim()) return false

      const raw = String(storeName).trim()

      // Direct ID check (se storeName for o próprio ID de uma loja permitida)
      if (effectiveAllowedIds.includes(raw)) return true

      const normInput = normalizeInternal(raw)
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
          // Verifica se essa loja casada é permitida pelo ID OU pelo nome
          const isAllowed = isStoreIdAllowed(matchedAll.id, matchedAll.name)
          if (!isAllowed) {
            return false
          }
          // Se está permitida, verificar que não haja colisão de CALL/ILHA ou DF/GO
          const normMatched = normalizeInternal(matchedAll.name)
          const isCallOrIlhaMatched = /\b(call|ilha)\b/.test(normMatched)
          const hasDfMatched = /\bdf\b/.test(normMatched)
          const hasGoMatched = /\bgo\b/.test(normMatched)
          if (isCallOrIlhaInput !== isCallOrIlhaMatched) return false
          if ((hasDfInput && hasGoMatched) || (hasGoInput && hasDfMatched)) return false
          return true
        }

        // Se matchStore contra allStores não encontrou uma loja cadastrada:
        const allowedStores = allStores.filter((s) => isStoreIdAllowed(s.id, s.name))
        if (allowedStores.length > 0) {
          // Comparação contra as lojas permitidas
          const matchedInAllowed = allowedStores.some((store) => {
            const normStore = normalizeInternal(store.name)
            const isCallOrIlhaStore = /\b(call|ilha)\b/.test(normStore)
            if (isCallOrIlhaInput !== isCallOrIlhaStore) return false

            const hasDfStore = /\bdf\b/.test(normStore)
            const hasGoStore = /\bgo\b/.test(normStore)
            if (hasDfInput && hasGoStore) return false
            if (hasGoInput && hasDfStore) return false

            // Match exato normalizado, variante canônica estrita (isSameStore) ou contenção mútua
            if (normStore === normInput) return true
            if (isSameStore(store.name, raw)) return true
            if (normInput.includes(normStore) || normStore.includes(normInput)) return true

            return false
          })
          if (matchedInAllowed) return true
        }
      }

      // Fallback estrito contra effectiveAllowedIds (se contiverem nomes)
      return effectiveAllowedIds.some((allowedId) => {
        const normAllowed = normalizeInternal(allowedId)
        if (!normAllowed) return false

        const isCallOrIlhaAllowed = /\b(call|ilha)\b/.test(normAllowed)
        if (isCallOrIlhaInput !== isCallOrIlhaAllowed) return false

        const hasDfAllowed = /\bdf\b/.test(normAllowed)
        const hasGoAllowed = /\bgo\b/.test(normAllowed)
        if (hasDfInput && hasGoAllowed) return false
        if (hasGoInput && hasDfAllowed) return false

        if (normAllowed === normInput) return true
        if (isSameStore(allowedId, raw)) return true
        if (normInput.includes(normAllowed) || normAllowed.includes(normInput)) return true

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
      resolveAllowed,
      isStoreNameAllowed,
      filterStores,
      getAllowedStoreNames,
    }
  }, [user])
}
