import * as XLSX from 'xlsx'
import type { FpdStatusKey, ParsedVendorLine } from '@/types/fpd'

export interface DetectedColumn {
  letter: string
  name: string
  columnIndex: number
}

export interface ParsedSheetCounts {
  sheetName: string
  sheetType: 'movel' | 'residencial' | 'outro'
  totalRows: number // Total de ocorrências/quantidades somadas
  totalLinesCount?: number // Quantidade de linhas físicas de dados processadas
  envio_fatura: number
  pendente: number
  fatura_paga: number
  sem_contato: number
  promessa_pagto: number
  cancelados: number
  nao_tratados: number
  contato_realizado: number
  outros: number
  vendorLines: ParsedVendorLine[]
  columns?: DetectedColumn[]
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
  vendorLines: ParsedVendorLine[]
  aggregated: {
    total_linhas: number
    envio_fatura: number
    pendente: number
    fatura_paga: number
    sem_contato: number
    promessa_pagto: number
    cancelados: number
    nao_tratados: number
    contato_realizado: number
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

// Exact match sets for each category in strict priority order (1 to 8)
export const EXACT_ENVIO_FATURA = new Set([
  'enviado fatura',
  'enviado fatura(s)',
  'enviada fatura',
  'enviada(s) fatura(s)',
  'fatura enviada',
  'faturas enviadas',
  'fatura reenviada',
  'fatura reencaminhada',
  'envio de fatura',
  'envio da fatura',
  'envio fatura',
  'env fatura',
  'env. fatura',
  'env fat',
  'fatura env',
  'boleto enviado',
  'enviado boleto',
  'enviado 2 via',
  'enviada 2 via',
  'enviado 2a via',
  'enviada 2a via',
  '2 via enviada',
  '2a via enviada',
  'segunda via enviada',
  'enviado segunda via',
  'enviada segunda via',
  'segunda via',
  '2 via',
  '2a via',
  'reenvio',
  'reencaminhado',
  'reencaminhada',
  'reencaminhar',
  'ja enviado',
  'ja enviada',
  'foi enviado',
  'foi enviada',
  'enviado',
  'enviada',
  'envio',
])

export const EXACT_PROMESSA_PAGTO = new Set([
  'promessa de pagto.',
  'promessa de pagto',
  'promessa de pagamento',
  'promessa pagto.',
  'promessa pagto',
  'promessa pagamento',
])

export const EXACT_FATURA_PAGA = new Set([
  'fatura paga',
  'faturas pagas',
  'fatura(s) paga(s)',
  'boleto pago',
  'boleta paga',
  'boleto quitado',
  'boleto liquidado',
  'fatura quitada',
  'fatura liquidada',
  'faturas quitadas',
  'faturas liquidadas',
  'fatura pg',
  'faturas pg',
  'pagamento efetuado',
  'pagamento realizado',
  'pagamento confirmado',
  'debito pago',
  'debito quitado',
  'pix pago',
  'pago pelo cliente',
  'pagamento ok',
  'pagamento identificado',
  'quitado',
  'liquidado',
  'pago',
  'paga',
  'ja pago',
  'ja paga',
  'ja quitado',
  'ja liquidado',
])

export const EXACT_SEM_CONTATO = new Set([
  'sem contato',
  'nao atende',
  'nao atendeu',
  'caixa postal',
  'ocupado',
  'desligado',
  'fora de area',
  'fora de servico',
  'nao existe',
  'telefone incorreto',
  'numero incorreto',
  'numero errado',
  'telefone errado',
  'numero invalido',
  'telefone invalido',
  'invalido',
  'incorreto',
  'mudo',
  'mensagem gravada',
  'chamada recusada',
  'recusou chamada',
  'ligacao caiu',
  'impossibilitado de receber',
])

export const EXACT_CANCELADOS = new Set([
  'cancelado',
  'cancelada',
  'cancelados',
  'canceladas',
  'cancel',
  'devolucao',
  'devolvido',
  'devolvida',
  'fraude',
  'inversao',
  'desistencia',
  'desistiu',
  'desistente',
  'estorno',
  'portabilidade',
  'obito',
  'falecido',
  'sinistro',
  'desativado',
  'desativada',
  'desabilitado',
  'desabilitada',
])

export const EXACT_PENDENTE = new Set([
  'pendente',
  'em analise',
  'em andamento',
  'em tratativa',
  'aguardando retorno',
  'aguardando resposta',
  'aguardando cliente',
  'retorno agendado',
  'retornar',
  'retorno',
])

export const EXACT_CONTATO_REALIZADO = new Set([
  'contato realizado',
  'contato efetuado',
  'contato feito',
  'fez contato',
  'contactado',
  'contactada',
  'contatado',
  'contatada',
  'cliente atendido',
  'cliente atendida',
  'atendido',
  'atendida',
  'atendidos',
  'atendidas',
  'atendimento realizado',
  'falou com cliente',
  'falou com o cliente',
  'falou com titular',
  'falou com terceiro',
  'falou com a mae',
  'falou com o pai',
  'falou com esposo',
  'falou com esposa',
  'contato com sucesso',
  'contato ok',
  'recado',
  'deixou recado',
])

export const EXACT_NAO_TRATADOS = new Set([
  'nao tratado',
  'nao tratada',
  'naotratado',
  'naotratada',
  'nao trabalhado',
  'nao trabalhada',
  'a tratar',
  'sem tratamento',
  'sem status',
  'em branco',
  'nao abordado',
  'novo',
  'virgem',
  'aguardando',
])

export const EXACT_OUTROS = new Set([
  'outros motivos',
  'outros',
  'outro motivo',
  'outro',
  'demais motivos',
  'demais',
])

// First cell structural headers
export const HEADER_FIRST_CELL_KEYWORDS = new Set([
  'status',
  'motivo',
  'cliente',
  'loja',
  'data',
  'acoes',
  'cpf',
  'cnpj',
  'contrato',
  'plano',
  'vencimento',
  'observacao',
  'protocolo',
  'operador',
  'consultor',
  'regional',
  'ddd',
  'telefone',
  'numero',
  'segmento',
  'data acao',
  'coordenacao',
  'supervisao',
  'substatus',
  'historico',
  'atraso',
])

// Second cell structural headers to confirm a genuine header row
export const HEADER_SECOND_CELL_KEYWORDS = new Set([
  'nome',
  'endereco',
  'cidade',
  'uf',
  'bairro',
  'cep',
  'email',
  'contato',
  'celular',
  'status',
  'motivo',
  'cliente',
  'loja',
  'data',
  'acoes',
  'cpf',
  'cnpj',
  'contrato',
  'plano',
  'vencimento',
  'observacao',
  'protocolo',
  'operador',
  'consultor',
  'regional',
  'ddd',
  'telefone',
  'numero',
  'segmento',
  'data acao',
  'coordenacao',
  'supervisao',
  'substatus',
  'historico',
  'atraso',
])

/**
 * Classify a row using EXCLUSIVELY exact match per individual cell against allowed variations.
 * Priority order (top to bottom, first match wins):
 *
 * 1. Enviado Fatura(s) (key 'envio_fatura') - coluna F do consolidado
 * 2. Promessa de Pagto. (key 'promessa_pagto') - coluna G do consolidado
 * 3. Fatura(s) Paga(s) (key 'fatura_paga') - coluna E do consolidado
 * 4. Sem Contato (key 'sem_contato') - coluna H do consolidado
 * 5. Cancelados (key 'cancelados') - coluna I do consolidado
 * 6. Pendente (key 'pendente') - coluna J do consolidado
 * 7. Contato Realizado (key 'contato_realizado') - coluna K do consolidado
 * 8. Não Tratados (key 'nao_tratados') - coluna M do consolidado
 * 9. Outros Motivos (key 'outros') - coluna L do consolidado (EXACT MATCH ONLY)
 *
 * Returns null if no status matches. Unmatched rows are ignored silently.
 */
export function classifyRow(
  input: string | string[],
  explicitCells?: string[],
): FpdStatusKey | null {
  // Support both classifyRow(cells) and classifyRow(rowText, cells) or classifyRow(singleCellString)
  let cells: string[]
  if (Array.isArray(input)) {
    cells = input
  } else if (explicitCells && Array.isArray(explicitCells)) {
    cells = explicitCells
  } else if (typeof input === 'string') {
    cells = [input]
  } else {
    cells = []
  }

  // 1. Enviado Fatura(s)
  if (cells.some((cell) => EXACT_ENVIO_FATURA.has(cell))) {
    return 'envio_fatura'
  }

  // 2. Promessa de Pagto.
  if (cells.some((cell) => EXACT_PROMESSA_PAGTO.has(cell))) {
    return 'promessa_pagto'
  }

  // 3. Fatura(s) Paga(s)
  if (cells.some((cell) => EXACT_FATURA_PAGA.has(cell))) {
    return 'fatura_paga'
  }

  // 4. Sem Contato
  if (cells.some((cell) => EXACT_SEM_CONTATO.has(cell))) {
    return 'sem_contato'
  }

  // 5. Cancelados
  if (cells.some((cell) => EXACT_CANCELADOS.has(cell))) {
    return 'cancelados'
  }

  // 6. Pendente
  if (cells.some((cell) => EXACT_PENDENTE.has(cell))) {
    return 'pendente'
  }

  // 7. Contato Realizado
  if (cells.some((cell) => EXACT_CONTATO_REALIZADO.has(cell))) {
    return 'contato_realizado'
  }

  // 8. Não Tratados
  if (cells.some((cell) => EXACT_NAO_TRATADOS.has(cell))) {
    return 'nao_tratados'
  }

  // 9. Outros Motivos (EXACT MATCH ONLY)
  if (cells.some((cell) => EXACT_OUTROS.has(cell))) {
    return 'outros'
  }

  // No match -> ignore row silently
  return null
}

/**
 * Checks if a row is a header row or a totals summary row by structural keywords.
 * Status classification is NOT handled here.
 */
export function isHeaderOrTotalRow(rowValues: unknown[]): boolean {
  const normalizedCells = rowValues.map(normalizeText).filter(Boolean)
  if (normalizedCells.length === 0) return true // empty row

  // 1. Total / Summary rows detection (first cell = 'total', 'totais', 'total geral', 'resumo')
  const firstCell = normalizedCells[0] || ''
  const isPureTotalRow =
    firstCell === 'total' ||
    firstCell === 'totais' ||
    firstCell === 'total geral' ||
    firstCell === 'resumo' ||
    firstCell.startsWith('total ') ||
    firstCell.startsWith('totais ') ||
    (normalizedCells.length === 1 &&
      (firstCell === 'total' ||
        firstCell === 'totais' ||
        firstCell === 'total geral' ||
        firstCell === 'resumo'))

  if (isPureTotalRow) {
    return true
  }

  // 2. Structural header detection:
  // Must have a structural first cell AND a second cell that is also a recognized header keyword.
  if (normalizedCells.length >= 2) {
    const secondCell = normalizedCells[1] || ''
    if (HEADER_FIRST_CELL_KEYWORDS.has(firstCell) && HEADER_SECOND_CELL_KEYWORDS.has(secondCell)) {
      return true
    }
  }

  return false
}

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
 * Converts a 0-based column index to Excel column letter (0 -> 'A', 25 -> 'Z', 26 -> 'AA', 30 -> 'AE', 48 -> 'AW')
 */
export function indexToColumnLetter(index: number): string {
  if (index < 0) return ''
  let letter = ''
  let num = index + 1
  while (num > 0) {
    const mod = (num - 1) % 26
    letter = String.fromCharCode(65 + mod) + letter
    num = Math.floor((num - mod) / 26)
  }
  return letter
}

/**
 * Extracts the header columns map from worksheet jsonData or cell references.
 * Finds the first structural header row or falls back to the first non-empty row.
 */
export function extractWorksheetColumns(jsonData: unknown[][]): DetectedColumn[] {
  if (!jsonData || jsonData.length === 0) return []

  // 1. Find the first row that matches isHeaderOrTotalRow or has typical header texts
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i]
    if (!Array.isArray(row) || row.length === 0) continue
    const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonBlank.length === 0) continue

    // Check if it's a genuine header row
    if (isHeaderOrTotalRow(row)) {
      // If it's a total row, skip; if it's structural header, take it
      const normalizedCells = row.map(normalizeText).filter(Boolean)
      const firstCell = normalizedCells[0] || ''
      const isTotal =
        firstCell === 'total' ||
        firstCell === 'totais' ||
        firstCell === 'total geral' ||
        firstCell === 'resumo' ||
        firstCell.startsWith('total ') ||
        firstCell.startsWith('totais ')
      if (!isTotal) {
        headerRowIndex = i
        break
      }
    }
  }

  // Fallback: If no explicit structural header found, pick the first non-empty row
  if (headerRowIndex === -1) {
    for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
      const row = jsonData[i]
      if (
        Array.isArray(row) &&
        row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')
      ) {
        headerRowIndex = i
        break
      }
    }
  }

  if (headerRowIndex === -1) return []

  const headerRow = jsonData[headerRowIndex]
  if (!Array.isArray(headerRow)) return []

  const detected: DetectedColumn[] = []

  for (let c = 0; c < headerRow.length; c++) {
    const cellVal = headerRow[c]
    const letter = indexToColumnLetter(c)
    if (cellVal !== null && cellVal !== undefined) {
      const nameStr = String(cellVal).trim()
      if (nameStr !== '') {
        detected.push({
          letter,
          name: nameStr,
          columnIndex: c,
        })
      }
    }
  }

  return detected
}

/**
 * Extracts a numeric quantity from a cell value in a given column.
 * If empty, invalid, 0, or negative, defaults to 1 (each valid data row represents at least 1 occurrence unless specified).
 * If it's a positive number or string number, parses it (e.g. "5" -> 5).
 */
/**
 * Normalized status headers accepted in spreadsheets.
 * Priority: columns containing "ocorren" (exact, prefix, contains) come first.
 * Fallbacks: status cobranca, substatus, situacao, status, motivo.
 */
export const ACCEPTED_STATUS_HEADERS = [
  'ocorrencias',
  'ocorrencia',
  'ocorrencia 1',
  'ocorrencias 1',
  'status',
  'substatus',
  'situacao',
  'status cobranca',
  'status da cobranca',
  'motivo',
]

/**
 * Finds the column index for the occurrences/status column from detected columns.
 * Selection algorithm:
 * 1. Checks columns containing "ocorren" (cobre ocorrência, ocorrencias, ocorrência):
 *    exact match ("ocorrencias"/"ocorrencia") > prefix match > contains.
 * 2. If none match "ocorren", checks fallback terms (status cobranca, substatus, situacao, status, motivo):
 *    exact match > prefix match > contains.
 * In case of tie, picks the leftmost column (lowest columnIndex).
 */
/**
 * Classifies the cell value of a dedicated occurrences/status column.
 * Rules:
 * 1. Empty/blank -> 'nao_tratados'
 * 2. Texts containing "paga" or "pago" (or "quitad", "liquidad") -> 'fatura_paga'
 * 3. Texts containing "enviad" (or "2 via", "2a via", "reenvio") -> 'envio_fatura'
 * 4. Texts containing "contato" or "atendid" -> 'contato_realizado'
 * 5. Other categories via exact/known matches (promessa_pagto, sem_contato, cancelados, pendente, nao_tratados)
 * 6. Fallback to classifyRow or 'outros'
 */
export function classifyStatusCell(cellVal: unknown): FpdStatusKey {
  const norm = normalizeText(cellVal)
  if (!norm) return 'nao_tratados'

  // Exact/priority checks
  // 1. Enviado fatura: "enviad", "envio", "2 via", "2a via"
  if (
    norm.includes('enviad') ||
    norm.includes('envio') ||
    norm.includes('2 via') ||
    norm.includes('2a via') ||
    EXACT_ENVIO_FATURA.has(norm)
  ) {
    return 'envio_fatura'
  }

  // 2. Promessa de Pagamento
  if (norm.includes('promessa') || EXACT_PROMESSA_PAGTO.has(norm)) {
    return 'promessa_pagto'
  }

  // 3. Fatura Paga: "paga", "pago", "quitad", "liquidad"
  if (
    norm.includes('paga') ||
    norm.includes('pago') ||
    norm.includes('quitad') ||
    norm.includes('liquidad') ||
    EXACT_FATURA_PAGA.has(norm)
  ) {
    return 'fatura_paga'
  }

  // 4. Sem Contato: "sem contato", "nao atende", "caixa postal", "recusad", "desligad"
  if (
    norm.includes('sem contato') ||
    norm.includes('nao atende') ||
    norm.includes('caixa postal') ||
    EXACT_SEM_CONTATO.has(norm)
  ) {
    return 'sem_contato'
  }

  // 5. Cancelados
  if (
    norm.includes('cancel') ||
    norm.includes('fraude') ||
    norm.includes('desist') ||
    norm.includes('devolv') ||
    EXACT_CANCELADOS.has(norm)
  ) {
    return 'cancelados'
  }

  // 6. Pendente
  if (
    norm.includes('pendente') ||
    norm.includes('em analise') ||
    norm.includes('em tratativa') ||
    norm.includes('aguardando') ||
    EXACT_PENDENTE.has(norm)
  ) {
    return 'pendente'
  }

  // 7. Contato Realizado: "contato", "atendid", "falou"
  if (
    norm.includes('contato') ||
    norm.includes('atendid') ||
    norm.includes('falou') ||
    norm.includes('recado') ||
    EXACT_CONTATO_REALIZADO.has(norm)
  ) {
    return 'contato_realizado'
  }

  // 8. Não Tratados
  if (
    norm.includes('nao tratado') ||
    norm.includes('nao trabalh') ||
    norm.includes('a tratar') ||
    EXACT_NAO_TRATADOS.has(norm)
  ) {
    return 'nao_tratados'
  }

  // 9. Standard classifyRow fallback or 'outros'
  return classifyRow(norm) || 'outros'
}

/**
 * Maps an FpdStatusKey to its official OCORRENCIAS_OPTIONS label
 */
export function fpdStatusKeyToOcorrenciaLabel(key: FpdStatusKey): string {
  switch (key) {
    case 'fatura_paga':
      return 'Fatura(s) Paga(s)'
    case 'envio_fatura':
      return 'Enviado Fatura(s)'
    case 'promessa_pagto':
      return 'Promessa de Pagto.'
    case 'sem_contato':
      return 'Sem Contato'
    case 'cancelados':
      return 'Cancelados'
    case 'pendente':
      return 'Pendente'
    case 'contato_realizado':
      return 'Contato Realizado'
    case 'outros':
      return 'Outros Motivos'
    case 'nao_tratados':
    default:
      return 'Não Tratados'
  }
}

export function findStatusColumnIndex(detectedColumns: DetectedColumn[]): number {
  if (!detectedColumns || detectedColumns.length === 0) return -1

  // 1. Check for "ocorren"
  let bestOcorrenScore = -1
  let bestOcorrenCol: DetectedColumn | null = null

  for (const col of detectedColumns) {
    const norm = normalizeText(col.name)
    if (!norm) continue

    if (norm.includes('ocorren')) {
      // Score: 3 = exact ('ocorrencias' or 'ocorrencia'), 2 = prefix ('ocorren...'), 1 = contains
      let score = 1
      if (norm === 'ocorrencias' || norm === 'ocorrencia') {
        score = 3
      } else if (
        norm.startsWith('ocorrencias') ||
        norm.startsWith('ocorrencia') ||
        norm.startsWith('ocorren')
      ) {
        score = 2
      }

      if (score > bestOcorrenScore) {
        bestOcorrenScore = score
        bestOcorrenCol = col
      } else if (
        score === bestOcorrenScore &&
        bestOcorrenCol &&
        col.columnIndex < bestOcorrenCol.columnIndex
      ) {
        bestOcorrenCol = col
      }
    }
  }

  if (bestOcorrenCol) {
    return bestOcorrenCol.columnIndex
  }

  // 2. Fallbacks: 'status cobranca', 'substatus', 'situacao', 'status', 'motivo'
  const fallbackTerms = [
    'status cobranca',
    'status da cobranca',
    'substatus',
    'situacao',
    'status',
    'motivo',
  ]

  let bestFallbackScore = -1
  let bestFallbackCol: DetectedColumn | null = null

  for (const col of detectedColumns) {
    const norm = normalizeText(col.name)
    if (!norm) continue

    for (const term of fallbackTerms) {
      if (norm === term) {
        // Exact match
        const score = 3
        if (score > bestFallbackScore) {
          bestFallbackScore = score
          bestFallbackCol = col
        } else if (
          score === bestFallbackScore &&
          bestFallbackCol &&
          col.columnIndex < bestFallbackCol.columnIndex
        ) {
          bestFallbackCol = col
        }
        break
      } else if (norm.startsWith(term)) {
        // Prefix match
        const score = 2
        if (score > bestFallbackScore) {
          bestFallbackScore = score
          bestFallbackCol = col
        } else if (
          score === bestFallbackScore &&
          bestFallbackCol &&
          col.columnIndex < bestFallbackCol.columnIndex
        ) {
          bestFallbackCol = col
        }
        break
      } else if (norm.includes(term)) {
        // Contains match
        const score = 1
        if (score > bestFallbackScore) {
          bestFallbackScore = score
          bestFallbackCol = col
        } else if (
          score === bestFallbackScore &&
          bestFallbackCol &&
          col.columnIndex < bestFallbackCol.columnIndex
        ) {
          bestFallbackCol = col
        }
        break
      }
    }
  }

  if (bestFallbackCol) {
    return bestFallbackCol.columnIndex
  }

  return -1
}

export function extractRowQuantity(row: unknown[], colIndex: number): number {
  if (!row || colIndex < 0 || colIndex >= row.length) {
    return 1
  }
  const raw = row[colIndex]
  if (raw === null || raw === undefined || raw === '') {
    return 1
  }
  if (typeof raw === 'number' && !isNaN(raw)) {
    return raw > 0 ? Math.round(raw) : 1
  }
  const str = String(raw).trim().replace(',', '.')
  const parsed = parseFloat(str)
  if (!isNaN(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return 1
}

/**
 * Parse a worksheet into counts
 */
export function parseWorksheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
  sheetType: 'movel' | 'residencial' | 'outro',
  qtyColIndexOverride?: number,
  colMappingOverride?: { vendorColIndex?: number; storeColIndex?: number },
): ParsedSheetCounts {
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

  const vendorLines: ParsedVendorLine[] = []

  const detectedColumns = extractWorksheetColumns(jsonData)

  const counts: ParsedSheetCounts = {
    sheetName,
    sheetType,
    totalRows: 0,
    totalLinesCount: 0,
    envio_fatura: 0,
    pendente: 0,
    fatura_paga: 0,
    sem_contato: 0,
    promessa_pagto: 0,
    cancelados: 0,
    nao_tratados: 0,
    contato_realizado: 0,
    outros: 0,
    vendorLines,
    columns: detectedColumns,
  }
  if (!jsonData || jsonData.length === 0) {
    return counts
  }

  // Identify status/occurrences column from detected headers
  let statusColIndex = findStatusColumnIndex(detectedColumns)

  // Determine explicit quantity column index from detected headers if any
  // If column header explicitly indicates quantity ('quantidade', 'qtde', 'qtd', 'quantidades', 'faturas')
  const ACCEPTED_QTY_HEADERS = new Set([
    'quantidade',
    'qtde',
    'qtd',
    'quantidades',
    'faturas',
    'total de faturas',
    'qtde faturas',
    'qtd faturas',
  ])

  let explicitQtyColIndex = -1
  if (qtyColIndexOverride !== undefined) {
    explicitQtyColIndex = qtyColIndexOverride
  } else {
    for (const col of detectedColumns) {
      const normColName = normalizeText(col.name)
      if (ACCEPTED_QTY_HEADERS.has(normColName)) {
        explicitQtyColIndex = col.columnIndex
        break
      }
    }
  }

  // Fallback fixed quantity column index only when NO status/occurrences column is detected
  // and explicit template position was requested or sheet is template-based
  const fallbackQtyColIndex =
    qtyColIndexOverride !== undefined
      ? qtyColIndexOverride
      : statusColIndex === -1
        ? sheetType === 'movel'
          ? columnLetterToIndex('AE') // 30
          : sheetType === 'residencial'
            ? columnLetterToIndex('AW') // 48
            : -1
        : -1

  const activeQtyColIndex = explicitQtyColIndex !== -1 ? explicitQtyColIndex : fallbackQtyColIndex

  // Determine Vendor & Store column indices:
  // First check detected header names
  let vendorColIndex =
    colMappingOverride?.vendorColIndex !== undefined ? colMappingOverride.vendorColIndex : -1
  let storeColIndex =
    colMappingOverride?.storeColIndex !== undefined ? colMappingOverride.storeColIndex : -1

  if (vendorColIndex === -1) {
    for (const col of detectedColumns) {
      const normColName = normalizeText(col.name)
      if (
        normColName === 'vendedor' ||
        normColName === 'vendedores' ||
        normColName === 'consultor' ||
        normColName === 'operador' ||
        normColName === 'nm vendedor'
      ) {
        vendorColIndex = col.columnIndex
        break
      }
    }
  }

  if (storeColIndex === -1) {
    for (const col of detectedColumns) {
      const normColName = normalizeText(col.name)
      if (
        normColName === 'loja' ||
        normColName === 'lojas' ||
        normColName === 'nm loja' ||
        normColName === 'nome loja'
      ) {
        storeColIndex = col.columnIndex
        break
      }
    }
  }

  // Fallback to fixed template positions if not found by header
  // Aba Móvel: Vendedor está na coluna D (index 3), Loja está na coluna E (index 4)
  // Aba Residencial: Vendedor está na coluna AV (index 47), Loja está na coluna AU (index 46)
  if (vendorColIndex === -1) {
    vendorColIndex =
      sheetType === 'movel'
        ? columnLetterToIndex('D')
        : sheetType === 'residencial'
          ? columnLetterToIndex('AV')
          : -1
  }

  if (storeColIndex === -1) {
    storeColIndex =
      sheetType === 'movel'
        ? columnLetterToIndex('E')
        : sheetType === 'residencial'
          ? columnLetterToIndex('AU')
          : -1
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

    let category: FpdStatusKey
    if (statusColIndex >= 0) {
      // Status column identified: classify exclusively by this column's cell value
      const rawStatusCell = statusColIndex < row.length ? row[statusColIndex] : ''
      const normalizedStatusCell = normalizeText(rawStatusCell)
      if (!normalizedStatusCell) {
        category = 'nao_tratados'
      } else {
        category = classifyStatusCell(normalizedStatusCell)
      }
    } else {
      // Fallback: classify scanning the whole row to keep compatibility with sheets lacking status header
      const normalizedCells = row.map(normalizeText)
      category = classifyRow(normalizedCells) || 'outros'
    }

    // Determine quantity for this row:
    // For analytical sheets or rows, each row represents 1 occurrence unless an explicit and validated quantity column is present
    let validQty = 1
    if (activeQtyColIndex >= 0) {
      const qty = Math.round(extractRowQuantity(row, activeQtyColIndex))
      validQty = Number.isFinite(qty) && qty > 0 ? qty : 1
    }

    counts[category] = Math.round((counts[category] || 0) + validQty)
    counts.totalRows = Math.round((counts.totalRows || 0) + validQty)
    if (counts.totalLinesCount !== undefined) {
      counts.totalLinesCount++
    }

    // Extract vendor and store for this line
    let vendorName = ''
    if (vendorColIndex >= 0 && vendorColIndex < row.length) {
      const vVal = row[vendorColIndex]
      if (vVal !== null && vVal !== undefined) {
        vendorName = String(vVal).trim()
      }
    }

    let storeName = ''
    if (storeColIndex >= 0 && storeColIndex < row.length) {
      const sVal = row[storeColIndex]
      if (sVal !== null && sVal !== undefined) {
        storeName = String(sVal).trim()
      }
    }

    vendorLines.push({
      vendedor: vendorName || 'NÃO INFORMADO',
      loja: storeName,
      status: category,
      quantidade: validQty,
    })
  }

  // Ensure every status counter is a guaranteed finite integer (>= 0)
  counts.envio_fatura = Math.round(counts.envio_fatura || 0)
  counts.pendente = Math.round(counts.pendente || 0)
  counts.fatura_paga = Math.round(counts.fatura_paga || 0)
  counts.sem_contato = Math.round(counts.sem_contato || 0)
  counts.promessa_pagto = Math.round(counts.promessa_pagto || 0)
  counts.cancelados = Math.round(counts.cancelados || 0)
  counts.nao_tratados = Math.round(counts.nao_tratados || 0)
  counts.contato_realizado = Math.round(counts.contato_realizado || 0)
  counts.outros = Math.round(counts.outros || 0)
  counts.totalRows = Math.round(counts.totalRows || 0)
  counts.vendorLines = vendorLines

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

  const safeInt = (val: unknown): number => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Math.round(val)
    }
    const parsed = Number(val)
    return Number.isFinite(parsed) ? Math.round(parsed) : 0
  }

  const combinedVendorLines: ParsedVendorLine[] = [
    ...(movelCounts?.vendorLines || []),
    ...(residencialCounts?.vendorLines || []),
  ]

  const aggregated = {
    total_linhas: safeInt((movelCounts?.totalRows || 0) + (residencialCounts?.totalRows || 0)),
    envio_fatura: safeInt(
      (movelCounts?.envio_fatura || 0) + (residencialCounts?.envio_fatura || 0),
    ),
    pendente: safeInt((movelCounts?.pendente || 0) + (residencialCounts?.pendente || 0)),
    fatura_paga: safeInt((movelCounts?.fatura_paga || 0) + (residencialCounts?.fatura_paga || 0)),
    sem_contato: safeInt((movelCounts?.sem_contato || 0) + (residencialCounts?.sem_contato || 0)),
    promessa_pagto: safeInt(
      (movelCounts?.promessa_pagto || 0) + (residencialCounts?.promessa_pagto || 0),
    ),
    cancelados: safeInt((movelCounts?.cancelados || 0) + (residencialCounts?.cancelados || 0)),
    nao_tratados: safeInt(
      (movelCounts?.nao_tratados || 0) + (residencialCounts?.nao_tratados || 0),
    ),
    contato_realizado: safeInt(
      (movelCounts?.contato_realizado || 0) + (residencialCounts?.contato_realizado || 0),
    ),
    outros: safeInt((movelCounts?.outros || 0) + (residencialCounts?.outros || 0)),
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
    vendorLines: combinedVendorLines,
    aggregated,
  }
}
