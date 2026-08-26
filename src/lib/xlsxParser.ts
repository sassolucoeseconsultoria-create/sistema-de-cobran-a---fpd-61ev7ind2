import * as XLSX from 'xlsx'
import type { FpdStatusKey } from '@/types/fpd'

export interface ParsedSheetCounts {
  sheetName: string
  sheetType: 'movel' | 'residencial' | 'outro'
  totalRows: number // Total de ocorrências/quantidades somadas
  totalLinesCount?: number // Quantidade de linhas físicas de dados processadas
  envio_fatura: number
  pendente: number
  fatura_paga: number
  envia_fatura: number
  sem_contato: number
  promessa_pagto: number
  cancelados: number
  nao_tratados: number
  contato_realizado: number
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
    envio_fatura: number
    pendente: number
    fatura_paga: number
    envia_fatura: number
    sem_contato: number
    promessa_pagto: number
    cancelados: number
    nao_tratados: number
    contato_realizado: number
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
 * 1. ENVIADO FATURA(S) (key 'envio_fatura'):
 *    Past tense / invoice already sent. Captures: "envio", "enviad", "reencaminh", "2 via",
 *    "segunda via", "fatura enviada", "reenvio", "envio fatura", "enviado fatura", etc.
 *
 * 2. PENDENTE (key 'pendente'):
 *    Pending treatment / status: "pendente", "aguardando retorno", "em analise", "em tratativa", etc.
 *    (when not payment paid, not invoice sending).
 *
 * 3. FATURA(S) PAGA(S) (key 'fatura_paga'):
 *    Payment confirmed / paid invoice: "fatura paga", "boleto pago", "liquidado", "pago", "paga", "quitado",
 *    "pagamento realizado", "ja pago", etc.
 *
 * 4. ENVIA FATURA(S) (key 'envia_fatura'):
 *    Action / intention / pending sending: "envia fatura", "enviar fatura", "precisa enviar", "a enviar",
 *    "mandar fatura", "solicitou envio", etc.
 *
 * 5. SEM CONTATO (key 'sem_contato'):
 *    "sem contato", "caixa postal", "nao atende", "ocupado", "desligado", "invalido", "numero errado", etc.
 *
 * 6. PROMESSA DE PAGTO. (key 'promessa_pagto'):
 *    "promessa de pagamento", "promessa de pagto", "promessa pgto", "prometeu pagar", "promete pagar", "vai pagar", "irá pagar", "combinou pagamento", etc.
 *
 * 7. CANCELADOS (key 'cancelados'):
 *    "cancelado", "cancelamento", "devolucao", "fraude", "inversao", "desistencia", "estorno", etc.
 *
 * 8. NÃO TRATADOS (key 'nao_tratados'):
 *    "nao tratad", "naotratad", "nao trabalhad", "a tratar", "aguardando", "sem status", "em branco", "virgem", fallback.
 */
export function classifyRow(rowNormalizedText: string): FpdStatusKey {
  // --- 1. ENVIADO FATURA(S) vs ENVIA FATURA(S) ---
  const isEnviadoFatura =
    rowNormalizedText.includes('enviado fatura') ||
    rowNormalizedText.includes('enviada fatura') ||
    rowNormalizedText.includes('enviados fatura') ||
    rowNormalizedText.includes('enviadas fatura') ||
    rowNormalizedText.includes('fatura enviada') ||
    rowNormalizedText.includes('faturas enviadas') ||
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
    rowNormalizedText.includes('segunda via enviada') ||
    rowNormalizedText.includes('enviado segunda via') ||
    rowNormalizedText.includes('enviada segunda via') ||
    rowNormalizedText.includes('segunda via') ||
    rowNormalizedText.includes('2 via') ||
    rowNormalizedText.includes('2a via') ||
    rowNormalizedText.includes('reenvio') ||
    rowNormalizedText.includes('reencaminhado') ||
    rowNormalizedText.includes('reencaminhada') ||
    rowNormalizedText.includes('reencaminhar') ||
    rowNormalizedText.includes('ja enviado') ||
    rowNormalizedText.includes('ja enviada') ||
    rowNormalizedText.includes('foi enviado') ||
    rowNormalizedText.includes('foi enviada') ||
    /\benviad[oa]s?\b/.test(rowNormalizedText) ||
    /\b(envio|reencaminh[oa]s?)\b/.test(rowNormalizedText)

  const isEnviaFatura =
    rowNormalizedText.includes('envia fatura') ||
    rowNormalizedText.includes('enviar fatura') ||
    rowNormalizedText.includes('precisa enviar') ||
    rowNormalizedText.includes('a enviar') ||
    rowNormalizedText.includes('enviando fatura') ||
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

  if (isEnviadoFatura && !isEnviaFatura) {
    return 'envio_fatura' // Enviado Fatura(s)
  }
  if (isEnviaFatura && !isEnviadoFatura) {
    return 'envia_fatura' // Envia Fatura(s)
  }
  if (isEnviadoFatura && isEnviaFatura) {
    if (
      rowNormalizedText.includes('enviado') ||
      rowNormalizedText.includes('enviada') ||
      rowNormalizedText.includes('reencaminhado') ||
      rowNormalizedText.includes('foi envi') ||
      rowNormalizedText.includes('fatura enviada')
    ) {
      return 'envio_fatura' // Enviado Fatura(s)
    }
    return 'envia_fatura' // Envia Fatura(s)
  }

  // --- 2. PROMESSA DE PAGTO. (key: promessa_pagto) ---
  // Specific promise-to-pay phrases only (avoid matching loose words like "acordo", "negociacao", "parcelamento", "prom", or isolated payment terms)
  const isPromessaPagto =
    rowNormalizedText.includes('promessa de pagamento') ||
    rowNormalizedText.includes('promessa de pagto') ||
    rowNormalizedText.includes('promessa de pgto') ||
    rowNormalizedText.includes('promessa de pag') ||
    rowNormalizedText.includes('promessa pagto') ||
    rowNormalizedText.includes('promessa pgto') ||
    rowNormalizedText.includes('promessa pagamento') ||
    rowNormalizedText.includes('promessa pagar') ||
    rowNormalizedText.includes('prometeu pagar') ||
    rowNormalizedText.includes('promete pagar') ||
    rowNormalizedText.includes('prometeu pagto') ||
    rowNormalizedText.includes('vai pagar') ||
    rowNormalizedText.includes('ira pagar') ||
    rowNormalizedText.includes('combinou pagamento') ||
    rowNormalizedText.includes('combinou pagto') ||
    rowNormalizedText.includes('combinado pagamento') ||
    rowNormalizedText.includes('combinado pagto') ||
    /\bpp\b/.test(rowNormalizedText)

  if (isPromessaPagto) {
    // Check if it's explicitly already paid with receipt/confirmation despite mentioning promise
    const isAlreadyPaid =
      (rowNormalizedText.includes('ja pago') ||
        rowNormalizedText.includes('ja paga') ||
        rowNormalizedText.includes('comprovante') ||
        rowNormalizedText.includes('fatura paga') ||
        rowNormalizedText.includes('pagamento efetuado') ||
        rowNormalizedText.includes('pagamento realizado') ||
        rowNormalizedText.includes('pagamento confirmado')) &&
      !rowNormalizedText.includes('promete') &&
      !rowNormalizedText.includes('vai pagar') &&
      !rowNormalizedText.includes('ira pagar')

    if (!isAlreadyPaid) {
      return 'promessa_pagto'
    }
  }

  // --- 3. FATURA(S) PAGA(S) (key: fatura_paga) ---
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
    return 'fatura_paga'
  }

  // --- 4. SEM CONTATO (key: sem_contato) ---
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
    return 'sem_contato'
  }

  // --- 5. CANCELADOS (key: cancelados) ---
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
    return 'cancelados'
  }

  // --- 6. PENDENTE (key: pendente) ---
  if (
    rowNormalizedText.includes('pendente') ||
    rowNormalizedText.includes('em analise') ||
    rowNormalizedText.includes('em andamento') ||
    rowNormalizedText.includes('em tratativa') ||
    rowNormalizedText.includes('retorno')
  ) {
    return 'pendente'
  }

  // --- 7. CONTATO REALIZADO (key: contato_realizado) ---
  if (
    rowNormalizedText.includes('contato realizado') ||
    rowNormalizedText.includes('contato efetuado') ||
    rowNormalizedText.includes('contato feito') ||
    rowNormalizedText.includes('fez contato') ||
    rowNormalizedText.includes('contactado') ||
    rowNormalizedText.includes('contactada') ||
    rowNormalizedText.includes('contatado') ||
    rowNormalizedText.includes('contatada') ||
    rowNormalizedText.includes('cliente atendido') ||
    rowNormalizedText.includes('cliente atendida') ||
    rowNormalizedText.includes('atendido') ||
    rowNormalizedText.includes('falou com cliente') ||
    rowNormalizedText.includes('falou com o cliente') ||
    rowNormalizedText.includes('falou com titular') ||
    rowNormalizedText.includes('contato com sucesso') ||
    rowNormalizedText.includes('contato ok') ||
    rowNormalizedText.includes('atendimento realizado')
  ) {
    return 'contato_realizado'
  }

  // --- 8. NÃO TRATADOS (key: nao_tratados) ---
  if (
    rowNormalizedText.includes('nao tratad') ||
    rowNormalizedText.includes('naotratad') ||
    rowNormalizedText.includes('nao trabalhad') ||
    rowNormalizedText.includes('a tratar') ||
    rowNormalizedText.includes('aguardando') ||
    rowNormalizedText.includes('sem status') ||
    rowNormalizedText.includes('em branco') ||
    rowNormalizedText.includes('novo') ||
    rowNormalizedText.includes('virgem')
  ) {
    return 'nao_tratados'
  }

  return 'nao_tratados'
}

/**
 * Checks if a row is a header row or a totals summary row
 */
/**
 * Converts column letters like 'A', 'Z', 'AE', 'AW' to 0-based column index.
 * e.g. A -> 0, Z -> 25, AA -> 26, AE -> 30, AW -> 48
 */
export function columnLetterToIndex(columnLetter: string): number {
  const clean = columnLetter.toUpperCase().trim()
  let result = 0
  for (let i = 0; i < clean.length; i++) {
    result = result * 26 + (clean.charCodeAt(i) - 64)
  }
  return result - 1
}

/**
 * Extracts a numeric quantity from a cell value in a given column.
 * If empty, invalid, 0, or negative, defaults to 1 (each valid data row represents at least 1 occurrence unless specified).
 * If it's a positive number or string number, parses it (e.g. "5" -> 5).
 */
export function extractRowQuantity(row: unknown[], colIndex: number): number {
  if (!row || colIndex < 0 || colIndex >= row.length) {
    return 1
  }
  const raw = row[colIndex]
  if (raw === null || raw === undefined || raw === '') {
    return 1
  }
  if (typeof raw === 'number' && !isNaN(raw)) {
    return raw > 0 ? raw : 1
  }
  const str = String(raw).trim().replace(',', '.')
  const parsed = parseFloat(str)
  if (!isNaN(parsed) && parsed > 0) {
    return parsed
  }
  return 1
}

/**
 * Checks if a row is a header row or a totals summary row
 */
export function isHeaderOrTotalRow(rowValues: unknown[]): boolean {
  const normalizedCells = rowValues.map(normalizeText).filter(Boolean)
  if (normalizedCells.length === 0) return true // empty row

  const combined = normalizedCells.join(' ')

  // 1. NEVER discard a row if it contains operational FPD status indicators
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
  qtyColIndexOverride?: number,
): ParsedSheetCounts {
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

  const counts: ParsedSheetCounts = {
    sheetName,
    sheetType,
    totalRows: 0,
    totalLinesCount: 0,
    envio_fatura: 0,
    pendente: 0,
    fatura_paga: 0,
    envia_fatura: 0,
    sem_contato: 0,
    promessa_pagto: 0,
    cancelados: 0,
    nao_tratados: 0,
    contato_realizado: 0,
  }
  if (!jsonData || jsonData.length === 0) {
    return counts
  }

  // Determine target quantity column index:
  // For 'movel': column AE (index 30)
  // For 'residencial': column AW (index 48)
  const qtyColIndex =
    qtyColIndexOverride !== undefined
      ? qtyColIndexOverride
      : sheetType === 'movel'
        ? columnLetterToIndex('AE') // 30
        : sheetType === 'residencial'
          ? columnLetterToIndex('AW') // 48
          : -1

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

    // Join row cells into a normalized search string for classification
    const rowText = row.map(normalizeText).join(' ')
    if (!rowText.trim()) continue

    const category = classifyRow(rowText)
    const qty = extractRowQuantity(row, qtyColIndex)

    counts[category] += qty
    counts.totalRows += qty
    if (counts.totalLinesCount !== undefined) {
      counts.totalLinesCount++
    }
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
    envio_fatura: (movelCounts?.envio_fatura || 0) + (residencialCounts?.envio_fatura || 0),
    pendente: (movelCounts?.pendente || 0) + (residencialCounts?.pendente || 0),
    fatura_paga: (movelCounts?.fatura_paga || 0) + (residencialCounts?.fatura_paga || 0),
    envia_fatura: (movelCounts?.envia_fatura || 0) + (residencialCounts?.envia_fatura || 0),
    sem_contato: (movelCounts?.sem_contato || 0) + (residencialCounts?.sem_contato || 0),
    promessa_pagto: (movelCounts?.promessa_pagto || 0) + (residencialCounts?.promessa_pagto || 0),
    cancelados: (movelCounts?.cancelados || 0) + (residencialCounts?.cancelados || 0),
    nao_tratados: (movelCounts?.nao_tratados || 0) + (residencialCounts?.nao_tratados || 0),
    contato_realizado:
      (movelCounts?.contato_realizado || 0) + (residencialCounts?.contato_realizado || 0),
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
