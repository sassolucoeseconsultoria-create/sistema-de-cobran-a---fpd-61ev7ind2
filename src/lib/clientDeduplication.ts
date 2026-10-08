import { getDadosField } from './clientFormatters'

/**
 * Normaliza uma chave de negócio de cliente:
 * - trim
 * - remover separadores: pontos, traços, barras, espaços, sublinhados, parênteses
 * - converter para minúsculas / case-insensitive
 *
 * Exemplos:
 * "22043752" -> "22043752"
 * " 22043752 " -> "22043752"
 * "2.2043752" -> "22043752"
 * " (61) 99315-9460 " -> "61993159460"
 * "ABC-123.4" -> "abc1234"
 */
export function normalizeClientDeduplicationKey(rawKey: unknown): string {
  if (rawKey === null || rawKey === undefined) return ''
  const str = String(rawKey).trim()
  if (!str) return ''
  // Remove pontos, traços, barras, espaços, parênteses, underscores
  const cleaned = str.replace(/[\s.\-_/\\()]/g, '').toLowerCase()
  return cleaned
}

/**
 * Normaliza uma data de referência para chave de unicidade:
 * - trim
 * - case-insensitive
 * - normalização de barras e separadores se necessário
 */
export function normalizeReferenceDateForDedup(rawDate: unknown): string {
  if (rawDate === null || rawDate === undefined) return ''
  const str = String(rawDate).trim()
  if (!str) return ''
  return str.toLowerCase()
}

/**
 * Constrói a chave composta de unicidade estrita:
 * (data_referencia normalizada) + (aba móvel/residencial) + (chave normalizada)
 *
 * Garante que regras de não duplicidade valem APENAS dentro de cada referência
 * e nunca cruzam referências diferentes.
 */
export function buildCompositeDeduplicationKey(
  dataReferencia: string | undefined | null,
  aba: 'movel' | 'residencial',
  businessKey: string,
): string {
  const normRef = normalizeReferenceDateForDedup(dataReferencia)
  const normKey = normalizeClientDeduplicationKey(businessKey)
  if (!normRef || !normKey) return ''
  return `${normRef}::${aba}::${normKey}`
}

/**
 * Extrai a chave de duplicidade de um registro Residencial.
 * Regra: Residencial -> campo `nr_contrato` (coluna NR_CONTRATO da planilha;
 * também disponível em `dados['NR_CONTRATO']` e typedFields['nr_contrato']).
 */
export function extractResidencialDeduplicationKey(record: {
  nr_contrato?: string
  typedFields?: Record<string, string>
  dados?: Record<string, unknown>
}): string {
  const directContrato = record.nr_contrato?.trim()
  if (directContrato) {
    const norm = normalizeClientDeduplicationKey(directContrato)
    if (norm) return norm
  }

  const typedContrato = record.typedFields?.nr_contrato?.trim()
  if (typedContrato) {
    const norm = normalizeClientDeduplicationKey(typedContrato)
    if (norm) return norm
  }

  const dadosContrato = getDadosField(
    record.dados,
    'NR_CONTRATO',
    'nr_contrato',
    'CONTRATO',
    'Contrato',
    'Nr Contrato',
    'Numero Contrato',
  )
  if (dadosContrato) {
    const norm = normalizeClientDeduplicationKey(dadosContrato)
    if (norm) return norm
  }

  return ''
}

/**
 * Conta a quantidade de clientes únicos Móvel a partir de um conjunto de registros
 * (ou acumula chaves em um Set fornecido).
 * Regras:
 * (a) Usa extractMovelDeduplicationKey para extrair a chave única canônica;
 * (b) Conta chaves únicas via Set (mesma chave repetida conta 1 ocorrência);
 * (c) Linhas com chave não extraível NÃO são contadas (célula vazia ignorada).
 */
export function countUniqueMovel(
  records: Array<{ dados?: Record<string, unknown> }>,
  seenKeysSet?: Set<string>,
): number {
  const seen = seenKeysSet || new Set<string>()
  const initialSize = seen.size
  for (const r of records) {
    const key = extractMovelDeduplicationKey(r)
    if (!key) continue
    seen.add(key)
  }
  return seen.size - initialSize
}

/**
 * Conta a quantidade de clientes únicos Residencial a partir de um conjunto de registros
 * (ou acumula chaves em um Set fornecido).
 * Regras:
 * (a) Usa extractResidencialDeduplicationKey para extrair a chave única canônica;
 * (b) Conta chaves únicas via Set (mesma chave repetida conta 1 ocorrência);
 * (c) Linhas com chave não extraível NÃO são contadas (célula vazia ignorada).
 */
export function countUniqueResidencial(
  records: Array<{
    nr_contrato?: string
    typedFields?: Record<string, string>
    dados?: Record<string, unknown>
  }>,
  seenKeysSet?: Set<string>,
): number {
  const seen = seenKeysSet || new Set<string>()
  const initialSize = seen.size
  for (const r of records) {
    const key = extractResidencialDeduplicationKey(r)
    if (!key) continue
    seen.add(key)
  }
  return seen.size - initialSize
}

export type DeduplicationRecordItem = {
  aba?: 'movel' | 'residencial'
  nr_contrato?: string
  typedFields?: Record<string, string>
  dados?: Record<string, unknown>
}

/**
 * Helper compartilhado para contagem de clientes únicos Móvel e Residencial.
 * Itera os registros e conta ocorrências únicas canônicas, ignorando registros sem chave válida.
 */
export function countUniqueClients(records: DeduplicationRecordItem[]): {
  movel: number
  residencial: number
} {
  const movelKeys = new Set<string>()
  const residencialKeys = new Set<string>()

  for (const r of records) {
    if (r.aba === 'residencial') {
      const key = extractResidencialDeduplicationKey(r)
      if (key) residencialKeys.add(key)
    } else {
      // Padrão ou 'movel'
      const key = extractMovelDeduplicationKey(r)
      if (key) movelKeys.add(key)
    }
  }

  return {
    movel: movelKeys.size,
    residencial: residencialKeys.size,
  }
}

/**
 * Extrai a chave de duplicidade de um registro Móvel.
 * Regra: Móvel -> o número da primeira coluna do arquivo
 * (campo `numero`/`NÚMERO` em `dados`, ou primeira chave / Coluna_1 / Telefone / Celular / Linha / MSISDN).
 */
export function extractMovelDeduplicationKey(record: { dados?: Record<string, unknown> }): string {
  const d = record.dados
  if (!d || typeof d !== 'object') return ''

  // 1. Tentar primeiro campos com nome explícito de número/linha/telefone
  const fieldVal = getDadosField(
    d,
    'Numero',
    'NÚMERO',
    'NUMERO',
    'Telefone',
    'Linha',
    'MSISDN',
    'Celular',
    'Terminal',
    'Número Telefone',
    'Numero Linha',
  )
  if (fieldVal) {
    const norm = normalizeClientDeduplicationKey(fieldVal)
    if (norm) return norm
  }

  // 2. Fallback seguro: procurar por Coluna_1 ou chaves nomeadas de coluna
  // NUNCA usar a primeira chave cega de `dados` porque em registros reais do banco
  // a primeira chave pode ser "Adimplente" (com valor "não" / "sim"), o que colapsaria
  // erroneamente todas as linhas em uma única chave constante "nao"!
  const coluna1Val = getDadosField(d, 'Coluna_1', 'Coluna 1', 'Coluna1')
  if (coluna1Val) {
    const norm = normalizeClientDeduplicationKey(coluna1Val)
    if (norm) return norm
  }

  return ''
}
