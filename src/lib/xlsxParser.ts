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
 * Classify a row's normalized text into exactly one of 8 FPD categories,
 * following the specific evaluation priority defined in PRD:
 * 1. FATURA PAGA: contains "pago" or "paga"
 * 2. ENVIO FATURA: contains "envio" or "enviad"
 * 3. CONTATO REALIZADO: contains "contato realizad" or "realizad" (when "sem contato" not present)
 * 4. PROMESSA PAGTO.: contains "promess"
 * 5. SEM CONTATO: contains "sem contato"
 * 6. CANCELADOS: contains "cancel"
 * 7. NÃO TRATADOS: contains "nao tratad" or "nao atendid"
 * 8. OUTROS: contains "outros"/"outro" OR catch-all for any other unclassified row
 */
export function classifyRow(rowNormalizedText: string): FpdStatusKey {
  // 1. FATURA PAGA: "fatura paga", "boleto pago", "liquidado", "pago", "paga", "pg", "quitado", "quitada", "pagamento realizado", etc.
  if (
    rowNormalizedText.includes('fatura paga') ||
    rowNormalizedText.includes('fatura pg') ||
    rowNormalizedText.includes('paga') ||
    rowNormalizedText.includes('pago') ||
    rowNormalizedText.includes('pagto') ||
    rowNormalizedText.includes('pagamento') ||
    rowNormalizedText.includes('boleto pago') ||
    rowNormalizedText.includes('quitad') ||
    rowNormalizedText.includes('liquid') ||
    /\b(pg|pga|pgo)\b/.test(rowNormalizedText)
  ) {
    // If it's a promise of payment, prioritize promise unless explicit payment made
    if (
      (rowNormalizedText.includes('promess') || rowNormalizedText.includes('promessa')) &&
      !rowNormalizedText.includes('fatura paga') &&
      !rowNormalizedText.includes('comprovante') &&
      !rowNormalizedText.includes('ja pago') &&
      !rowNormalizedText.includes('ja paga')
    ) {
      return 'promessa_pagto'
    }
    return 'fatura_paga'
  }

  // 2. PROMESSA PAGTO.: contains "promess", "pp", "acordo", etc.
  if (
    rowNormalizedText.includes('promess') ||
    rowNormalizedText.includes('acordo') ||
    /\b(pp)\b/.test(rowNormalizedText)
  ) {
    return 'promessa_pagto'
  }

  // 3. ENVIO FATURA: contains "envio", "enviad", "reencaminh", "2 via", "segunda via", etc.
  if (
    rowNormalizedText.includes('envio') ||
    rowNormalizedText.includes('enviad') ||
    rowNormalizedText.includes('reencaminh') ||
    rowNormalizedText.includes('2a via') ||
    rowNormalizedText.includes('2 via') ||
    rowNormalizedText.includes('segunda via')
  ) {
    return 'envio_fatura'
  }

  // 4. CONTATO REALIZADO: "contato realizad", "atendid", "recado", etc. (when "sem contato" not present)
  if (
    !rowNormalizedText.includes('sem contato') &&
    !rowNormalizedText.includes('nao atendid') &&
    (rowNormalizedText.includes('contato realizad') ||
      rowNormalizedText.includes('realizad') ||
      rowNormalizedText.includes('atendid') ||
      rowNormalizedText.includes('falou com') ||
      rowNormalizedText.includes('recado'))
  ) {
    return 'contato_realizado'
  }

  // 5. SEM CONTATO: "sem contato", "caixa postal", "nao atende", "ocupado", "desligado", "invalido", etc.
  if (
    rowNormalizedText.includes('sem contato') ||
    rowNormalizedText.includes('nao atende') ||
    rowNormalizedText.includes('nao atendeu') ||
    rowNormalizedText.includes('caixa postal') ||
    rowNormalizedText.includes('chamou') ||
    rowNormalizedText.includes('ocupado') ||
    rowNormalizedText.includes('desligado') ||
    rowNormalizedText.includes('telefone incorreto') ||
    rowNormalizedText.includes('invalido') ||
    rowNormalizedText.includes('incorreto') ||
    rowNormalizedText.includes('mudo')
  ) {
    return 'sem_contato'
  }

  // 6. CANCELADOS: "cancel", "devol", "fraude", "inversao", "desistencia", etc.
  if (
    rowNormalizedText.includes('cancel') ||
    rowNormalizedText.includes('devol') ||
    rowNormalizedText.includes('fraude') ||
    rowNormalizedText.includes('inversao') ||
    rowNormalizedText.includes('desist')
  ) {
    return 'cancelados'
  }

  // 7. NÃO TRATADOS: "nao tratad", "nao trabalhad", "pendente", "em branco", "sem status", "naotratado", etc.
  if (
    rowNormalizedText.includes('nao tratad') ||
    rowNormalizedText.includes('naotratad') ||
    rowNormalizedText.includes('nao trabalhad') ||
    rowNormalizedText.includes('a tratar') ||
    rowNormalizedText.includes('pendente') ||
    rowNormalizedText.includes('aguardando') ||
    rowNormalizedText.includes('sem status')
  ) {
    return 'nao_tratados'
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

  // 1. NEVER discard a row if it contains payment or status indicators unless it's strictly a header definition row
  const hasPaymentKeyword =
    combined.includes('pago') ||
    combined.includes('paga') ||
    combined.includes('quitad') ||
    combined.includes('liquid') ||
    /\b(pg|pga|pgo)\b/.test(combined)

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

  if (isPureTotalRow && !hasPaymentKeyword) {
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

  // If at least 2 distinct standard header column names match as cell titles and NO individual customer data is present
  if (exactMatchesCount >= 2 && !hasPaymentKeyword) {
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
