import { classifyStatusCell, getCanonicalCategoryOrRaw } from '@/lib/xlsxParser'

/**
 * Checks whether an ocorrencia text corresponds to "Fatura(s) Paga(s)".
 * Uses canonical classification rules from xlsxParser rather than loose string comparison.
 */
export function isFaturaPagaOcorrencia(ocorrencia?: string | null): boolean {
  if (!ocorrencia || typeof ocorrencia !== 'string') return false
  const trimmed = ocorrencia.trim()
  if (!trimmed) return false

  // Direct check via classifyStatusCell
  if (classifyStatusCell(trimmed) === 'fatura_paga') {
    return true
  }

  // Canonical category check
  const canonical = getCanonicalCategoryOrRaw(trimmed)
  return canonical === 'Fatura(s) Paga(s)'
}

/**
 * Compares two items such that:
 * 1. Non-"Fatura(s) Paga(s)" items come first (priority 0)
 * 2. "Fatura(s) Paga(s)" items come last (priority 1)
 * 3. Tie-breaker 1: import line (linha ASC, lower line number first if available)
 * 4. Tie-breaker 2: created date (created DESC or ASC fallback)
 * 5. Tie-breaker 3: id fallback
 */
export function compareClientesByOcorrencia<
  T extends {
    ocorrencias?: string | null
    linha?: number | null
    created?: string | null
    id?: string
  },
>(a: T, b: T, edits?: Record<string, { ocorrencias?: string | null }>): number {
  const ocorrenciaA =
    a.id && edits?.[a.id]?.ocorrencias !== undefined ? edits[a.id].ocorrencias : a.ocorrencias
  const ocorrenciaB =
    b.id && edits?.[b.id]?.ocorrencias !== undefined ? edits[b.id].ocorrencias : b.ocorrencias

  const isPagaA = isFaturaPagaOcorrencia(ocorrenciaA) ? 1 : 0
  const isPagaB = isFaturaPagaOcorrencia(ocorrenciaB) ? 1 : 0

  if (isPagaA !== isPagaB) {
    return isPagaA - isPagaB // 0 before 1: non-paga first, paga last
  }

  // If both have linha defined, sort by linha ascending (original spreadsheet order)
  if (typeof a.linha === 'number' && typeof b.linha === 'number' && a.linha !== b.linha) {
    return a.linha - b.linha
  }

  // If linha not distinguishable, sort by created date descending (matching PocketBase '-created')
  const dateA = a.created ? new Date(a.created).getTime() : 0
  const dateB = b.created ? new Date(b.created).getTime() : 0
  if (dateA !== dateB) {
    return dateB - dateA
  }

  // Fallback to id
  return (a.id || '').localeCompare(b.id || '')
}

/**
 * Returns a new sorted array where all non-"Fatura(s) Paga(s)" appear first,
 * and all "Fatura(s) Paga(s)" appear at the end.
 */
export function sortClientesByOcorrencia<
  T extends {
    ocorrencias?: string | null
    linha?: number | null
    created?: string | null
    id?: string
  },
>(items: T[], edits?: Record<string, { ocorrencias?: string | null }>): T[] {
  if (!items || items.length <= 1) return items ? [...items] : []
  return [...items].sort((a, b) => compareClientesByOcorrencia(a, b, edits))
}
