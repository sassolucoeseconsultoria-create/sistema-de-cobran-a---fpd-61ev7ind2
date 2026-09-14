import * as XLSX from 'xlsx'
import {
  normalizeText,
  extractWorksheetColumns,
  findStatusColumnIndex,
  findValidatedStatusColumnIndex,
  getCanonicalCategoryOrRaw,
  isHeaderOrTotalRow,
  guessReferenteDate,
} from './xlsxParser'

/**
 * Normalizes a header column name into a safe snake_case PocketBase field name.
 * e.g.:
 * "PARCEIRO RESUMIDO" -> "parceiro_resumido"
 * "COD_ AMX" -> "cod_amx"
 * "QTDE INSTALADA" -> "qtde_instalada"
 * "Data Promessa de Pagto." -> "data_promessa_de_pagto"
 * "Não Vencidas" -> "nao_vencidas"
 * "QTD DIAS VENC x Data atual" -> "qtd_dias_venc_x_data_atual"
 */
export function normalizeColumnToSnakeCase(colName: string): string {
  if (!colName) return ''

  return colName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[.\-/\\()]/g, ' ') // replace special punctuation with space
    .replace(/[^a-z0-9_ ]/g, '') // remove remaining non-alphanumeric chars
    .trim()
    .replace(/\s+/g, '_') // collapse spaces to underscore
    .replace(/_+/g, '_') // collapse multiple underscores
}

/**
 * Map of known snake_case fields for the RESIDENCIAL collection
 */
export const KNOWN_RESIDENCIAL_FIELDS = new Set<string>([
  'nr_ano_mes',
  'data_instalacao',
  'nm_mercado',
  'nm_marca',
  'cod_municipio',
  'canal',
  'produto_atual',
  'nm_indicador_negocio',
  'nm_tipo_ass_domicilio',
  'uf',
  'nm_visao_analise',
  'nm_linha_negocio',
  'nm_cidade',
  'nm_bairro',
  'parceiro_resumido',
  'cod_amx',
  'coordenador',
  'executivo',
  'nr_contrato',
  'dsc_status_contrato',
  'dat_vencimento',
  'dat_pagamento',
  'vlr_total',
  'vlr_pago',
  'vlr_aberto',
  'nm_forma_pagamento',
  'nr_cep',
  'qtde_instalada',
  'fatura',
  'devendo',
  'data_relatorio',
  'qtd_dias_pag_x_venc',
  'indicador',
  'pago',
  'preventiva_fpd',
  'virou_fpd',
  'nao_vencidas',
  'indefinido',
  'desprezar',
  'qtd_dias_venc_x_data_atual',
  'canal_2',
  'bcc_tipo_rede',
  'coordenador_2',
  'cpf',
  'cliente',
  'fone',
  'loja',
  'vendedor',
  'ocorrencias',
  'data_promessa_de_pagto',
  'comentarios',
])

export interface ParsedAnalyticalRow {
  linha: number
  loja?: string
  vendedor?: string
  cliente?: string
  ocorrencias?: string
  dados: Record<string, unknown>
  typedFields?: Record<string, string>
}

export interface ParsedAnalyticalSheetData {
  sheetName: string
  sheetType: 'movel' | 'residencial'
  headerColumns: string[]
  rows: ParsedAnalyticalRow[]
}

export interface ParsedAnalyticalFileData {
  fileName: string
  guessedReferente?: string
  movelSheet?: ParsedAnalyticalSheetData
  residencialSheet?: ParsedAnalyticalSheetData
  totalMovelRows: number
  totalResidencialRows: number
}

/**
 * Parses an individual worksheet into raw analytical rows with dynamic header extraction.
 */
export function parseAnalyticalWorksheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
  sheetType: 'movel' | 'residencial',
): ParsedAnalyticalSheetData {
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
  if (!jsonData || jsonData.length === 0) {
    return {
      sheetName,
      sheetType,
      headerColumns: [],
      rows: [],
    }
  }

  // Find header row index and detected columns
  const detectedCols = extractWorksheetColumns(jsonData)
  let headerRowIndex = 0

  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i]
    if (!Array.isArray(row) || row.length === 0) continue
    if (isHeaderOrTotalRow(row)) {
      const normalizedCells = row.map(normalizeText).filter(Boolean)
      const firstCell = normalizedCells[0] || ''
      const isTotal = firstCell.startsWith('total') || firstCell === 'resumo'
      if (!isTotal) {
        headerRowIndex = i
        break
      }
    }
  }

  const headerRow = (jsonData[headerRowIndex] as unknown[]) || []
  const colIndexToHeaderName: Record<number, string> = {}
  const headerColumns: string[] = []

  for (let c = 0; c < headerRow.length; c++) {
    const rawVal = headerRow[c]
    if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
      const name = String(rawVal).trim()
      colIndexToHeaderName[c] = name
      headerColumns.push(name)
    }
  }

  // Detect and validate the status / occurrences column index against data rows
  let statusColIndex = findValidatedStatusColumnIndex(detectedCols, jsonData, headerRowIndex + 1)
  if (statusColIndex === -1) {
    statusColIndex = findStatusColumnIndex(detectedCols)
  }

  const rows: ParsedAnalyticalRow[] = []

  for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
    const row = jsonData[r]
    if (!Array.isArray(row) || row.length === 0) continue

    const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonBlank.length === 0) continue

    if (isHeaderOrTotalRow(row)) {
      continue
    }

    const rowDataMap: Record<string, unknown> = {}
    const typedFields: Record<string, string> = {}
    let lojaVal: string | undefined
    let vendedorVal: string | undefined
    let clienteVal: string | undefined

    for (let c = 0; c < row.length; c++) {
      const val = row[c]
      const colHeader = colIndexToHeaderName[c] || `Coluna_${c + 1}`
      const formattedVal = val !== null && val !== undefined ? val : ''

      rowDataMap[colHeader] = formattedVal

      const normalizedSnake = normalizeColumnToSnakeCase(colHeader)

      // Identify fixed keys
      const normText = normalizeText(colHeader)
      if (
        !lojaVal &&
        (normText === 'loja' ||
          normText === 'lojas' ||
          normText === 'nm loja' ||
          normText === 'nome loja')
      ) {
        if (formattedVal !== '') lojaVal = String(formattedVal).trim()
      }

      if (
        !vendedorVal &&
        (normText === 'vendedor' ||
          normText === 'vendedores' ||
          normText === 'consultor' ||
          normText === 'operador' ||
          normText === 'nm vendedor')
      ) {
        if (formattedVal !== '') vendedorVal = String(formattedVal).trim()
      }

      if (
        !clienteVal &&
        (normText === 'cliente' ||
          normText === 'nm cliente' ||
          normText === 'nome cliente' ||
          normText === 'razao social' ||
          normText === 'titular')
      ) {
        if (formattedVal !== '') clienteVal = String(formattedVal).trim()
      }

      // If it's residencial, check if snake_case name matches any typed column
      if (sheetType === 'residencial') {
        if (KNOWN_RESIDENCIAL_FIELDS.has(normalizedSnake)) {
          typedFields[normalizedSnake] = String(formattedVal ?? '').trim()
        }
      }
    }

    // Fallback detection for Móvel if standard column headers weren't named "Loja" or "Vendedor"
    if (!vendedorVal && sheetType === 'movel' && row[3]) {
      vendedorVal = String(row[3]).trim()
    }
    if (!lojaVal && sheetType === 'movel' && row[4]) {
      lojaVal = String(row[4]).trim()
    }

    // Determine occurrences classification:
    // Exclusively by the status/occurrences column cell value:
    // - Vazia -> EXPURGADA (linha não deve gerar contagem nem registro de ocorrência)
    // - Casa com categoria oficial -> rótulo canônico
    // - Não casa -> texto original da célula (trim)
    let rowOcorrenciaLabel = ''
    if (statusColIndex >= 0 && statusColIndex < row.length) {
      const rawStatusCell = row[statusColIndex]
      rowOcorrenciaLabel = getCanonicalCategoryOrRaw(rawStatusCell)
    }

    // Para tipo residencial: derivar a ocorrência de múltiplos campos quando a coluna
    // de status isolada não casar ou estiver ausente/vazia:
    // FATURA, PAGO, VLR PAGO, INDICADOR, PREVENTIVA FPD, VIROU FPD, DSC_STATUS_CONTRATO (mesma lógica da migração 0040).
    // Linhas válidas NÃO podem ser expurgadas — só expurgar linha sem nenhum campo de ocorrência identificável (célula totalmente vazia).
    if (sheetType === 'residencial') {
      const faturaVal = rowDataMap['FATURA'] ?? rowDataMap['fatura'] ?? typedFields['fatura']
      const pagoVal = rowDataMap['PAGO'] ?? rowDataMap['pago'] ?? typedFields['pago']
      const vlrPagoVal =
        rowDataMap['VLR PAGO'] ??
        rowDataMap['VLR_PAGO'] ??
        rowDataMap['vlr_pago'] ??
        typedFields['vlr_pago']
      const indicadorVal =
        rowDataMap['INDICADOR'] ?? rowDataMap['indicador'] ?? typedFields['indicador']
      const preventivaVal =
        rowDataMap['PREVENTIVA FPD'] ??
        rowDataMap['preventiva_fpd'] ??
        typedFields['preventiva_fpd']
      const virouFpdVal =
        rowDataMap['VIROU FPD'] ?? rowDataMap['virou_fpd'] ?? typedFields['virou_fpd']
      const dscStatusVal =
        rowDataMap['DSC_STATUS_CONTRATO'] ??
        rowDataMap['dsc_status_contrato'] ??
        typedFields['dsc_status_contrato']

      // Prioridade 1: Pagamento identificado (fatura paga, pago=1, vlr_pago > 0)
      const faturaStr =
        faturaVal !== null && faturaVal !== undefined ? String(faturaVal).trim() : ''
      const pagoStr = pagoVal !== null && pagoVal !== undefined ? String(pagoVal).trim() : ''
      const vlrPagoNum =
        vlrPagoVal !== null && vlrPagoVal !== undefined
          ? Number(String(vlrPagoVal).replace(',', '.'))
          : NaN

      const isFaturaPaga =
        (faturaStr && getCanonicalCategoryOrRaw(faturaStr) === 'Fatura(s) Paga(s)') ||
        pagoVal === 1 ||
        pagoStr === '1' ||
        pagoStr.toLowerCase() === 'pago' ||
        (!isNaN(vlrPagoNum) && vlrPagoNum > 0)

      if (isFaturaPaga) {
        rowOcorrenciaLabel = 'Fatura(s) Paga(s)'
      } else if (!rowOcorrenciaLabel || !rowOcorrenciaLabel.trim()) {
        // Prioridade 2: Indicador / Preventiva FPD / Virou FPD / DSC_STATUS_CONTRATO
        if (indicadorVal) {
          const catIndicador = getCanonicalCategoryOrRaw(indicadorVal)
          if (catIndicador) rowOcorrenciaLabel = catIndicador
        }
        if (!rowOcorrenciaLabel && preventivaVal) {
          const catPrev = getCanonicalCategoryOrRaw(preventivaVal)
          if (catPrev) rowOcorrenciaLabel = catPrev
        }
        if (!rowOcorrenciaLabel && virouFpdVal) {
          const catVirou = getCanonicalCategoryOrRaw(virouFpdVal)
          if (catVirou) rowOcorrenciaLabel = catVirou
        }
        if (!rowOcorrenciaLabel && dscStatusVal) {
          const catDsc = getCanonicalCategoryOrRaw(dscStatusVal)
          if (catDsc) rowOcorrenciaLabel = catDsc
        }
        if (!rowOcorrenciaLabel && faturaStr) {
          const catFat = getCanonicalCategoryOrRaw(faturaStr)
          if (catFat) rowOcorrenciaLabel = catFat
        }
      }
    }

    // Célula vazia na coluna de ocorrências / nenhum campo identificável: a linha deve ser expurgada
    if (!rowOcorrenciaLabel || !rowOcorrenciaLabel.trim()) {
      continue
    }

    rows.push({
      linha: r + 1, // original 1-based line number in spreadsheet
      loja: lojaVal,
      vendedor: vendedorVal,
      cliente: clienteVal,
      ocorrencias: rowOcorrenciaLabel,
      dados: rowDataMap,
      typedFields: sheetType === 'residencial' ? typedFields : undefined,
    })
  }

  return {
    sheetName,
    sheetType,
    headerColumns,
    rows,
  }
}

/**
 * Parses an entire .xlsx file for Analytical import (Móvel & Residencial)
 */
export async function parseAnalyticalXlsxFile(file: File): Promise<ParsedAnalyticalFileData> {
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

  // Fallback if sheet names are not explicitly recognized
  if (!movelSheetName && !residencialSheetName) {
    if (sheetNames.length === 1) {
      movelSheetName = sheetNames[0]
    } else if (sheetNames.length >= 2) {
      movelSheetName = sheetNames[0]
      residencialSheetName = sheetNames[1]
    } else {
      throw new Error(`Nenhuma aba válida encontrada no arquivo ${file.name}.`)
    }
  }

  let movelSheet: ParsedAnalyticalSheetData | undefined
  let residencialSheet: ParsedAnalyticalSheetData | undefined

  if (movelSheetName && workbook.Sheets[movelSheetName]) {
    movelSheet = parseAnalyticalWorksheet(workbook.Sheets[movelSheetName], movelSheetName, 'movel')
  }

  if (residencialSheetName && workbook.Sheets[residencialSheetName]) {
    residencialSheet = parseAnalyticalWorksheet(
      workbook.Sheets[residencialSheetName],
      residencialSheetName,
      'residencial',
    )
  }

  return {
    fileName: file.name,
    guessedReferente: guessReferenteDate(file.name),
    movelSheet,
    residencialSheet,
    totalMovelRows: movelSheet?.rows.length || 0,
    totalResidencialRows: residencialSheet?.rows.length || 0,
  }
}
