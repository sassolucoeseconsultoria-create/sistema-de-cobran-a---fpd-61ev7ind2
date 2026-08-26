import * as XLSX from 'xlsx'
import type { FpdStatusKey } from '@/types/fpd'

export interface ParsedSheetCounts {
  sheetName: string
  sheetType: 'movel' | 'residencial' | 'outro'
  totalRows: number
  fatura_paga: number
  envio_fatura: number
  contato_realizado: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  nao_tratados: number
  outros: number
}

export interface ParsedFileData {
  fileName: string
  guessedStoreName: string
  guessedReferente: string
  sheetsFound: {
    movel?: string
    residencial?: string
  }
  movelCounts?: ParsedSheetCounts
  residencialCounts?: ParsedSheetCounts
  aggregated: {
    total_linhas: number
    fatura_paga: number
    envio_fatura: number
    contato_realizado: number
    promessa_pagto: number
    sem_contato: number
    cancelados: number
    nao_tratados: number
    outros: number
  }
}

/**
 * Strips accents, lowers case, trims and normalizes multiple spaces/separators
 */
export function normalizeText(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\r\n\t_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Auto-guesses a store name from a filename
 * e.g. "CELNET_AGUAS_CLARAS_20-08-2026.xlsx" -> "CELNET AGUAS CLARAS"
 */
export function guessStoreName(filename: string): string {
  // Remove extension
  let base = filename.replace(/\.[^/.]+$/, '')
  // Replace underscores and multiple dashes with spaces
  base = base.replace(/[_-]+/g, ' ')
  // Remove trailing date-like patterns like "20 08 2026" or "20.08.2026" or "20082026"
  base = base.replace(/\b\d{1,2}[\s./-]\d{1,2}[\s./-]\d{2,4}\b/g, '')
  base = base.replace(/\b\d{8}\b/g, '')
  // Normalize whitespace
  base = base.replace(/\s+/g, ' ').trim()
  return base.toUpperCase() || filename.replace(/\.[^/.]+$/, '').toUpperCase()
}

/**
 * Auto-guesses a referring date (e.g. "20/08/2026") from filename or defaults to formatted today
 */
export function guessReferenteDate(filename: string): string {
  // Match patterns like 20-08-2026, 20_08_2026, 20.08.2026, 20/08/2026
  const dateMatch = filename.match(/(\d{1,2})[-_./](\d{1,2})[-_./](\d{2,4})/)
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0')
    const month = dateMatch[2].padStart(2, '0')
    let year = dateMatch[3]
    if (year.length === 2) {
      year = `20${year}`
    }
    return `${day}/${month}/${year}`
  }

  // Fallback to today formatted as DD/MM/YYYY
  const now = new Date()
  const d = String(now.getDate()).padStart(2, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const y = now.getFullYear()
  return `${d}/${m}/${y}`
}

/**
 * Classify a row's normalized text into exactly one of 8 FPD categories:
 *
 * 1. ENVIADO FATURA(S) (column/key 'fatura_paga'):
 *    Past tense / invoice already sent. Captures: "enviado fatura", "envio fatura", "fatura enviada",
 *    "env fatura", "envio de fatura", "enviada 2 via", "fatura reenviada", "reencaminhado", "enviado", etc.
 *
 * 2. ENVIA FATURA(S) (column/key 'promessa_pagto'):
 *    Action / intention to send / pending sending action: "envia fatura", "enviar fatura", "a enviar fatura",
 *    "reenviar fatura", "mandar fatura", "solicitado envio fatura", etc.
 *    (Carefully separated from Enviado Fatura so there is NO overlap).
 *
 * 3. FATURA(S) PAGA(S) (column/key 'contato_realizado'):
 *    Payment confirmed / paid invoice: "fatura paga", "boleto pago", "liquidado", "pago", "paga", "quitado",
 *    "pagamento realizado", "ja pago", etc.
 *
 * 4. PENDENTE (column/key 'envio_fatura'):
 *    Pending treatment / pending status: "pendente", "aguardando retorno", "em analise", etc.
 *
 * 5. SEM CONTATO (column/key 'sem_contato'):
 *    "sem contato", "caixa postal", "nao atende", "ocupado", "desligado", "invalido", "numero errado", etc.
 *
 * 6. PROMESSA DE PAGTO. (column/key 'cancelados'):
 *    "promessa de pagamento", "promessa de pagto", "promessa", "acordo", "vai pagar", "prometeu pagar", etc.
 *
 * 7. CANCELADOS (column/key 'nao_tratados'):
 *    "cancelado", "cancelamento", "devolucao", "fraude", "inversao", "desistencia", "estorno", etc.
 *
 * 8. NÃO TRATADOS (column/key 'outros'):
 *    "nao tratado", "nao trabalhado", "sem status", "em branco", "a tratar" OR fallback.
 */
export function classifyRow(rowNormalizedText: string): FpdStatusKey {
  // --- 1. ENVIADO FATURA(S) vs ENVIA FATURA(S) ---
  // Must distinguish between past (Enviado = fatura_paga) and future/infinitive/present action (Envia = promessa_pagto)

  const isEnviadoFatura =
    // Past participle / already sent variations:
    rowNormalizedText.includes('enviado fatura') ||
    rowNormalizedText.includes('enviada fatura') ||
    rowNormalizedText.includes('enviados fatura') ||
    rowNormalizedText.includes('enviadas fatura') ||
    rowNormalizedText.includes('fatura enviada') ||
    rowNormalizedText.includes('faturas enviadas') ||
    rowNormalizedText.includes('fatura enviando') ||
    rowNormalizedText.includes('fatura reenviada') ||
    rowNormalizedText.includes('fatura reencaminhada') ||
    rowNormalizedText.includes('envio de fatura') ||
    rowNormalizedText.includes('envio da fatura') ||
    rowNormalizedText.includes('envio fatura') ||
    rowNormalizedText.includes('env fatura') ||
    rowNormalizedText.includes('env. fatura') ||
    rowNormalizedText.includes('env fat') ||
    rowNormalizedText.includes('fatura env') ||
    rowNormalizedText.includes('boleto enviado') ||
    rowNormalizedText.includes('enviado boleto') ||
    rowNormalizedText.includes('enviado 2 via') ||
    rowNormalizedText.includes('enviada 2 via') ||
    rowNormalizedText.includes('enviado 2a via') ||
    rowNormalizedText.includes('enviada 2a via') ||
    rowNormalizedText.includes('2 via enviada') ||
    rowNormalizedText.includes('2a via enviada') ||
    rowNormalizedText.includes('reencaminhado') ||
    rowNormalizedText.includes('reencaminhada') ||
    rowNormalizedText.includes('ja enviado') ||
    rowNormalizedText.includes('ja enviada') ||
    rowNormalizedText.includes('foi enviado') ||
    rowNormalizedText.includes('foi enviada') ||
    /\benviad[oa]s?\b/.test(rowNormalizedText) ||
    /\b(envio|reencaminh[oa]s?)\b/.test(rowNormalizedText)

  const isEnviaFatura =
    // Infinitive / present imperative action variations:
    rowNormalizedText.includes('enviar fatura') ||
    rowNormalizedText.includes('envia fatura') ||
    rowNormalizedText.includes('enviando fatura') ||
    rowNormalizedText.includes('a enviar fatura') ||
    rowNormalizedText.includes('reenviar fatura') ||
    rowNormalizedText.includes('mandar fatura') ||
    rowNormalizedText.includes('encaminhar fatura') ||
    rowNormalizedText.includes('solicitou envio') ||
    rowNormalizedText.includes('solicitado envio') ||
    rowNormalizedText.includes('solicitou 2 via') ||
    rowNormalizedText.includes('solicita 2 via') ||
    rowNormalizedText.includes('gerar 2 via') ||
    rowNormalizedText.includes('gerar fatura') ||
    rowNormalizedText.includes('enviar boleto') ||
    rowNormalizedText.includes('envia boleto') ||
    rowNormalizedText.includes('enviar codigo de barras') ||
    rowNormalizedText.includes('envia codigo de barras') ||
    rowNormalizedText.includes('enviar pix') ||
    rowNormalizedText.includes('envia pix') ||
    /\b(enviar|envia|mandar|encaminhar)\b/.test(rowNormalizedText)

  // Disambiguation: if both or matched, decide accurately
  if (isEnviadoFatura && !isEnviaFatura) {
    return 'fatura_paga' // Enviado Fatura(s)
  }
  if (isEnviaFatura && !isEnviadoFatura) {
    return 'promessa_pagto' // Envia Fatura(s)
  }
  if (isEnviadoFatura && isEnviaFatura) {
    // If text specifically mentions past participle like "enviado" or "fatura enviada", it is Enviado
    if (
      rowNormalizedText.includes('enviado') ||
      rowNormalizedText.includes('enviada') ||
      rowNormalizedText.includes('reencaminhado') ||
      rowNormalizedText.includes('foi envi')
    ) {
      return 'fatura_paga' // Enviado Fatura(s)
    }
    return 'promessa_pagto' // Envia Fatura(s)
  }

  // --- 2. FATURA(S) PAGA(S) (column: contato_realizado) ---
  // Payment confirmed / already paid
  if (
    rowNormalizedText.includes('fatura paga') ||
    rowNormalizedText.includes('faturas pagas') ||
    rowNormalizedText.includes('fatura pg') ||
    rowNormalizedText.includes('boleto pago') ||
    rowNormalizedText.includes('ja pago') ||
    rowNormalizedText.includes('ja paga') ||
    rowNormalizedText.includes('ja quitad') ||
    rowNormalizedText.includes('comprovante') ||
    rowNormalizedText.includes('liquidado') ||
    rowNormalizedText.includes('liquidada') ||
    rowNormalizedText.includes('quitado') ||
    rowNormalizedText.includes('quitada') ||
    rowNormalizedText.includes('pagamento efetuado') ||
    rowNormalizedText.includes('pagamento realizado') ||
    rowNormalizedText.includes('pagamento confirmado') ||
    rowNormalizedText.includes('debito pago') ||
    rowNormalizedText.includes('pix pago') ||
    /\b(pago|paga|pagos|pagas|quitou|liquidou)\b/.test(rowNormalizedText) ||
    /\b(pg|pga|pgo)\b/.test(rowNormalizedText)
  ) {
    // Check if it's explicitly a promise to pay (e.g. "promessa de pagamento") rather than payment done
    if (
      (rowNormalizedText.includes('promess') || rowNormalizedText.includes('acordo')) &&
      !rowNormalizedText.includes('ja pago') &&
      !rowNormalizedText.includes('ja paga') &&
      !rowNormalizedText.includes('comprovante') &&
      !rowNormalizedText.includes('fatura paga')
    ) {
      return 'cancelados' // Promessa de Pagto.
    }
    return 'contato_realizado' // Fatura(s) Paga(s)
  }

  // --- 3. PROMESSA DE PAGTO. (column: cancelados) ---
  if (
    rowNormalizedText.includes('promessa de pagamento') ||
    rowNormalizedText.includes('promessa de pagto') ||
    rowNormalizedText.includes('promessa pagto') ||
    rowNormalizedText.includes('promessa') ||
    rowNormalizedText.includes('prometeu pagar') ||
    rowNormalizedText.includes('vai pagar') ||
    rowNormalizedText.includes('acordo') ||
    rowNormalizedText.includes('negociacao') ||
    rowNormalizedText.includes('parcelamento') ||
    /\b(pp|prom)\b/.test(rowNormalizedText)
  ) {
    return 'cancelados' // Promessa de Pagto.
  }

  // --- 4. SEM CONTATO (column: sem_contato) ---
  if (
    rowNormalizedText.includes('sem contato') ||
    rowNormalizedText.includes('nao atende') ||
    rowNormalizedText.includes('nao atendeu') ||
    rowNormalizedText.includes('caixa postal') ||
    rowNormalizedText.includes('chamou') ||
    rowNormalizedText.includes('ocupado') ||
    rowNormalizedText.includes('desligado') ||
    rowNormalizedText.includes('fora de area') ||
    rowNormalizedText.includes('nao existe') ||
    rowNormalizedText.includes('telefone incorreto') ||
    rowNormalizedText.includes('numero incorreto') ||
    rowNormalizedText.includes('numero errado') ||
    rowNormalizedText.includes('invalido') ||
    rowNormalizedText.includes('incorreto') ||
    rowNormalizedText.includes('mudo') ||
    rowNormalizedText.includes('recado') ||
    rowNormalizedText.includes('mensagem gravada')
  ) {
    return 'sem_contato' // Sem Contato
  }

  // --- 5. CANCELADOS (column: nao_tratados) ---
  if (
    rowNormalizedText.includes('cancel') ||
    rowNormalizedText.includes('devol') ||
    rowNormalizedText.includes('fraude') ||
    rowNormalizedText.includes('inversao') ||
    rowNormalizedText.includes('desist') ||
    rowNormalizedText.includes('estorno') ||
    rowNormalizedText.includes('portabilidade') ||
    rowNormalizedText.includes('obito') ||
    rowNormalizedText.includes('falecido')
  ) {
    return 'nao_tratados' // Cancelados
  }

  // --- 6. PENDENTE (column: envio_fatura) ---
  if (
    rowNormalizedText.includes('pendente') ||
    rowNormalizedText.includes('aguardando') ||
    rowNormalizedText.includes('em analise') ||
    rowNormalizedText.includes('em andamento') ||
    rowNormalizedText.includes('em tratativa') ||
    rowNormalizedText.includes('retorno')
  ) {
    return 'envio_fatura' // Pendente
  }

  // --- 7. NÃO TRATADOS (column: outros) ---
  if (
    rowNormalizedText.includes('nao tratad') ||
    rowNormalizedText.includes('naotratad') ||
    rowNormalizedText.includes('nao trabalhad') ||
    rowNormalizedText.includes('a tratar') ||
    rowNormalizedText.includes('sem status') ||
    rowNormalizedText.includes('em branco') ||
    rowNormalizedText.includes('novo') ||
    rowNormalizedText.includes('virgem')
  ) {
    return 'outros' // Não Tratados
  }

  return 'outros'
}

/**
 * Checks if a row is a header row or a totals summary row
 */
export function isHeaderOrTotalRow(rowValues: unknown[]): boolean {
  const normalizedCells = rowValues.map(normalizeText).filter(Boolean)
  if (normalizedCells.length === 0) return true // empty row

  const combined = normalizedCells.join(' ')

  // 1. NEVER discard a row if it contains operational FPD status indicators
  // like "enviado fatura", "fatura paga", "sem contato", "promessa", etc.
  const hasStatusKeyword =
    combined.includes('enviad') ||
    combined.includes('envio') ||
    combined.includes('envia') ||
    combined.includes('pago') ||
    combined.includes('paga') ||
    combined.includes('quitad') ||
    combined.includes('liquid') ||
    combined.includes('promess') ||
    combined.includes('sem contato') ||
    combined.includes('caixa postal') ||
    combined.includes('cancel') ||
    combined.includes('pendente') ||
    /\b(pg|pga|pgo|pp)\b/.test(combined)

  // 2. Total / Summary rows detection
  // A summary row that starts with 'total' or 'totais' (e.g. "Total Geral: 50" or "Total")
  const firstCell = normalizedCells[0] || ''
  const isPureTotalRow =
    firstCell === 'total' ||
    firstCell === 'totais' ||
    firstCell === 'total geral' ||
    firstCell === 'resumo' ||
    firstCell.startsWith('total ') ||
    firstCell.startsWith('totais ') ||
    combined === 'total' ||
    combined === 'totais' ||
    combined === 'total geral'

  if (isPureTotalRow && !hasStatusKeyword) {
    return true
  }

  // 3. Header detection:
  // Typical column names in telecom / FPD spreadsheets
  const headerKeywords = [
    'status',
    'motivo',
    'cliente',
    'loja',
    'coordenacao',
    'supervisao',
    'telefone',
    'cpf',
    'cnpj',
    'contrato',
    'plano',
    'vencimento',
    'atraso',
    'historico',
    'observacao',
    'protocolo',
    'operador',
    'consultor',
    'regional',
    'ddd',
    'numero',
    'segmento',
    'data acao',
    'substatus',
  ]

  let exactMatchesCount = 0
  for (const kw of headerKeywords) {
    if (
      normalizedCells.some(
        (c) => c === kw || c.startsWith(`${kw} `) || c.endsWith(` ${kw}`) || c.includes(` ${kw} `),
      )
    ) {
      exactMatchesCount++
    }
  }

  // If at least 2 distinct standard header column names match as cell titles and NO status keyword is present
  if (exactMatchesCount >= 2 && !hasStatusKeyword) {
    return true
  }

  return false
}

/**
 * Parse a worksheet into counts
 */
export function parseWorksheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
  sheetType: 'movel' | 'residencial' | 'outro',
): ParsedSheetCounts {
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

  const counts: ParsedSheetCounts = {
    sheetName,
    sheetType,
    totalRows: 0,
    fatura_paga: 0,
    envio_fatura: 0,
    contato_realizado: 0,
    promessa_pagto: 0,
    sem_contato: 0,
    cancelados: 0,
    nao_tratados: 0,
    outros: 0,
  }

  if (!jsonData || jsonData.length === 0) {
    return counts
  }

  // Iterate rows (skip empty and headers/totals)
  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i]
    if (!Array.isArray(row) || row.length === 0) continue

    // Check if entire row is empty
    const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonBlank.length === 0) continue

    if (isHeaderOrTotalRow(row)) {
      continue
    }

    // Join row cells into a normalized search string
    const rowText = row.map(normalizeText).join(' ')
    if (!rowText.trim()) continue

    const category = classifyRow(rowText)
    counts[category]++
    counts.totalRows++
  }

  return counts
}

/**
 * Reads an ArrayBuffer of an xlsx file and computes consolidated counts for Móvel + Residencial
 */
export async function parseXlsxFile(file: File): Promise<ParsedFileData> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  const sheetNames = workbook.SheetNames
  let movelSheetName: string | undefined
  let residencialSheetName: string | undefined

  for (const name of sheetNames) {
    const norm = normalizeText(name)
    if (
      !movelSheetName &&
      (norm.includes('movel') || norm.includes('celular') || norm.includes('mov') || norm === 'm')
    ) {
      movelSheetName = name
    }
    if (
      !residencialSheetName &&
      (norm.includes('residencial') ||
        norm.includes('residen') ||
        norm.includes('fixo') ||
        norm.includes('banda larga') ||
        norm.includes('fibra') ||
        norm.includes('res') ||
        norm === 'r')
    ) {
      residencialSheetName = name
    }
  }

  // Fallback: If only 1 or 2 sheets exist and neither matched named pattern,
  // take first sheet as movel and second sheet as residencial (or first as movel if 1 sheet)
  if (!movelSheetName && !residencialSheetName) {
    if (sheetNames.length === 1) {
      movelSheetName = sheetNames[0]
    } else if (sheetNames.length >= 2) {
      movelSheetName = sheetNames[0]
      residencialSheetName = sheetNames[1]
    } else {
      throw new Error(
        `O arquivo "${file.name}" não contém as abas "Móvel" e/ou "Residencial". Abas encontradas: ${sheetNames.join(', ')}`,
      )
    }
  }

  let movelCounts: ParsedSheetCounts | undefined
  let residencialCounts: ParsedSheetCounts | undefined

  if (movelSheetName) {
    const ws = workbook.Sheets[movelSheetName]
    movelCounts = parseWorksheet(ws, movelSheetName, 'movel')
  }

  if (residencialSheetName) {
    const ws = workbook.Sheets[residencialSheetName]
    residencialCounts = parseWorksheet(ws, residencialSheetName, 'residencial')
  }

  const aggregated = {
    total_linhas: (movelCounts?.totalRows || 0) + (residencialCounts?.totalRows || 0),
    fatura_paga: (movelCounts?.fatura_paga || 0) + (residencialCounts?.fatura_paga || 0),
    envio_fatura: (movelCounts?.envio_fatura || 0) + (residencialCounts?.envio_fatura || 0),
    contato_realizado:
      (movelCounts?.contato_realizado || 0) + (residencialCounts?.contato_realizado || 0),
    promessa_pagto: (movelCounts?.promessa_pagto || 0) + (residencialCounts?.promessa_pagto || 0),
    sem_contato: (movelCounts?.sem_contato || 0) + (residencialCounts?.sem_contato || 0),
    cancelados: (movelCounts?.cancelados || 0) + (residencialCounts?.cancelados || 0),
    nao_tratados: (movelCounts?.nao_tratados || 0) + (residencialCounts?.nao_tratados || 0),
    outros: (movelCounts?.outros || 0) + (residencialCounts?.outros || 0),
  }

  return {
    fileName: file.name,
    guessedStoreName: guessStoreName(file.name),
    guessedReferente: guessReferenteDate(file.name),
    sheetsFound: {
      movel: movelSheetName,
      residencial: residencialSheetName,
    },
    movelCounts,
    residencialCounts,
    aggregated,
  }
}
