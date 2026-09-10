/**
 * storeMatchingUtils.ts
 *
 * Utilitários centralizados para resolução de nomes de lojas, geração de variantes
 * canônicas (ex.: "CELNET AGUAS CLARA" <-> "CELNET AGUAS CLARAS",
 * "CELNET MATRIZ PLANALTINA DF" <-> "CELNET PLANALTINA DF") e construção de cláusulas
 * de filtro para consultas no PocketBase e comparações na interface.
 */

import { normalizeStoreString } from '@/services/fpdService'

/**
 * Remove acentos e converte para minúsculas de forma segura.
 */
export function removeAccentsAndLower(str: string): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Mapeamentos conhecidos de equivalências de lojas históricas e variações da importação.
 * Todas as chaves e valores são comparados de forma normalizada (minúsculas sem acentos).
 */
const KNOWN_EQUIVALENCES: Record<string, string[]> = {
  // Águas Claras
  'celnet aguas clara': [
    'celnet aguas claras',
    'celnet aguas clara',
    'aguas claras',
    'aguas clara',
  ],
  'celnet aguas claras': [
    'celnet aguas clara',
    'celnet aguas claras',
    'aguas claras',
    'aguas clara',
  ],
  'aguas clara': ['celnet aguas clara', 'celnet aguas claras', 'aguas claras', 'aguas clara'],
  'aguas claras': ['celnet aguas clara', 'celnet aguas claras', 'aguas claras', 'aguas clara'],

  // Planaltina DF (atenção: NÃO confundir com Planaltina GO!)
  'celnet matriz planaltina df': [
    'celnet matriz planaltina df',
    'celnet planaltina df',
    'matriz planaltina df',
    'celnet planaltina',
  ],
  'celnet planaltina df': [
    'celnet matriz planaltina df',
    'celnet planaltina df',
    'matriz planaltina df',
    'celnet planaltina',
  ],
  'matriz planaltina df': [
    'celnet matriz planaltina df',
    'celnet planaltina df',
    'matriz planaltina df',
    'celnet planaltina',
  ],
}

/**
 * Retorna o conjunto de todas as variantes conhecidas e ortográficas de um nome de loja
 * para montagem de filtros SQL / PocketBase `loja = "X" || loja = "Y"`.
 *
 * NUNCA usa matching parcial `loja ~ texto`, garantindo que:
 * - "CELNET AGUAS CLARAS" case exatamente com "CELNET AGUAS CLARA" e "CELNET AGUAS CLARAS"
 * - NUNCA traga dados de Planaltina ou outra loja ao selecionar Águas Claras
 * - "CELNET PLANALTINA DF" case com "CELNET MATRIZ PLANALTINA DF" e "CELNET PLANALTINA DF", sem casar com "CELNET PLANALTINA GO".
 */
export function getStoreVariants(lojaName: string): string[] {
  if (!lojaName || lojaName === 'TODAS') return []

  const trimmed = lojaName.trim()
  const variants = new Set<string>()

  // 1. O próprio nome como recebido
  variants.add(trimmed)

  // 2. Variação com ou sem 'S' final (ex: ÁGUAS CLARAS <-> ÁGUAS CLARA)
  if (trimmed.endsWith('S') || trimmed.endsWith('s')) {
    variants.add(trimmed.slice(0, -1).trim())
  } else {
    variants.add(`${trimmed}S`)
  }

  // 3. Variação sem acentos
  const unaccented = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  variants.add(unaccented)
  if (unaccented.endsWith('S') || unaccented.endsWith('s')) {
    variants.add(unaccented.slice(0, -1).trim())
  } else {
    variants.add(`${unaccented}S`)
  }

  // 4. Mapeamento de equivalências conhecidas
  const normKey = removeAccentsAndLower(trimmed)
  for (const [key, equivList] of Object.entries(KNOWN_EQUIVALENCES)) {
    if (
      normKey === key ||
      (normKey.length > 3 && normKey.replace(/s$/, '') === key.replace(/s$/, ''))
    ) {
      for (const eq of equivList) {
        variants.add(eq.toUpperCase())
        variants.add(eq)
      }
    }
  }

  // 5. Se o nome for especificamente Planaltina DF (ATENÇÃO: nunca acionar se tiver 'go')
  if (normKey.includes('planaltina') && normKey.includes('df') && !normKey.includes('go')) {
    variants.add('CELNET MATRIZ PLANALTINA DF')
    variants.add('CELNET PLANALTINA DF')
  }

  // 6. Se o nome for "CELNET AGUAS CLARAS" ou "CELNET AGUAS CLARA"
  if (normKey.includes('aguas') && normKey.includes('clara')) {
    variants.add('CELNET AGUAS CLARA')
    variants.add('CELNET AGUAS CLARAS')
    variants.add('CELNET ÁGUAS CLARA')
    variants.add('CELNET ÁGUAS CLARAS')
  }

  return Array.from(variants).filter(Boolean)
}

/**
 * Constrói a cláusula de filtro PocketBase para uma loja selecionada.
 * Utiliza igualdade estrita para cada variante: `(loja = "A" || loja = "B")`.
 */
export function buildStoreFilterClause(lojaName: string): string {
  const variants = getStoreVariants(lojaName)
  if (variants.length === 0) return ''

  const clauses = variants.map((v) => `loja = "${v.replace(/"/g, '\\"')}"`)
  if (clauses.length === 1) return clauses[0]
  return `(${clauses.join(' || ')})`
}

/**
 * Verifica se dois nomes de lojas representam a mesma loja, considerando
 * normalização (minúsculas, sem acentos, sem pontuações) e variações conhecidas (com/sem "S", MATRIZ).
 */
export function isSameStore(storeA?: string | null, storeB?: string | null): boolean {
  if (!storeA || !storeB) return false

  const normA = normalizeStoreString(storeA)
  const normB = normalizeStoreString(storeB)

  if (!normA || !normB) return false
  if (normA === normB) return true

  // Lojas CALL ou ILHA nunca são a mesma de lojas físicas comuns
  const isCallOrIlhaA = /\b(call|ilha)\b/.test(normA)
  const isCallOrIlhaB = /\b(call|ilha)\b/.test(normB)
  if (isCallOrIlhaA !== isCallOrIlhaB) {
    return false
  }

  // Diferenciação geográfica estrita: DF vs GO
  const hasDfA = /\bdf\b/.test(normA)
  const hasGoA = /\bgo\b/.test(normA)
  const hasDfB = /\bdf\b/.test(normB)
  const hasGoB = /\bgo\b/.test(normB)
  if (hasDfA && hasGoB) return false
  if (hasGoA && hasDfB) return false

  // Comparação com variantes
  const variantsA = getStoreVariants(storeA).map((v) => normalizeStoreString(v))
  const variantsB = getStoreVariants(storeB).map((v) => normalizeStoreString(v))

  if (variantsA.includes(normB) || variantsB.includes(normA)) {
    return true
  }

  // Checagem sem 's' final em cada token ou na string (apenas se nenhum token chave se perder)
  const stripS = (s: string) => s.replace(/\bs\b/g, '').replace(/s(?=\s|$)/g, '')
  if (stripS(normA) === stripS(normB) && stripS(normA).length >= 4) {
    return true
  }

  return false
}
