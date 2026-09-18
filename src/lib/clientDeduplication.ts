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

  // 2. O usuário mencionou: "no Móvel é o Número, que consta na primeira coluna do arquivo".
  // Se o parser salvou a primeira coluna como 'Coluna_1' ou com outro nome, verificar a primeira chave de `dados`:
  const entries = Object.entries(d)
  if (entries.length > 0) {
    const [firstKey, firstVal] = entries[0]
    // Se a primeira chave já é uma das colunas ou Coluna_1
    if (firstVal !== undefined && firstVal !== null) {
      const valStr = String(firstVal).trim()
      // Se não for vazia e parecer um identificador/número
      if (valStr) {
        const norm = normalizeClientDeduplicationKey(valStr)
        if (norm) return norm
      }
    }
    // Ou se a primeira chave contém Coluna_1
    if (firstKey.toLowerCase().startsWith('coluna_1')) {
      const norm = normalizeClientDeduplicationKey(firstVal)
      if (norm) return norm
    }
  }

  return ''
}
