import * as XLSX from 'xlsx'
import {
  extractWorksheetColumns,
  findStatusColumnIndex,
  findValidatedStatusColumnIndex,
  classifyStatusCell,
  extractRowQuantity,
  isHeaderOrTotalRow,
  normalizeText,
  columnLetterToIndex,
} from '@/lib/xlsxParser'
import {
  parseAnalyticalWorksheet,
  type ParsedAnalyticalRow,
  type ParsedAnalyticalSheetData,
} from '@/lib/analyticalImportParser'
import type { FpdStatusKey, ParsedVendorLine, StoreRecord } from '@/types/fpd'
import {
  matchStore,
  saveFpdRecord,
  saveImportedFile,
  saveVendorConsolidationsFromLines,
  createStore,
  fetchStores,
  fetchDistinctReferenceDates,
} from '@/services/fpdService'
import {
  insertMovelBatch,
  insertResidencialBatch,
  type MovelInsertItem,
  type ResidencialInsertItem,
} from '@/services/relacionamentoService'
import { executeWithRateLimitRetry, sleep } from '@/lib/pocketbase/rateLimiter'

export type BatchImportType = 'movel' | 'residencial'

export interface BatchStoreSummary {
  rawStoreName: string
  canonicalStoreName: string
  storeId?: string
  totalLinhas: number
  fatura_paga: number
  envio_fatura: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  pendente: number
  contato_realizado: number
  nao_tratados: number
  outros: number
  vendorLinesCount: number
  analyticalRowsCount: number
}

export interface ParsedBatchData {
  fileName: string
  importType: BatchImportType
  targetSheetName: string
  totalValidRows: number
  totalExpurgadasRows: number
  storeSummaries: BatchStoreSummary[]
  analyticalRows: ParsedAnalyticalRow[]
  vendorLines: ParsedVendorLine[]
}

export interface BatchImportProgressCallback {
  (step: string, percent: number): void
}

/**
 * Detects the worksheet corresponding to the desired batch type (movel or residencial).
 * Prioritizes matching tab names like "movel", "celular", "residencial", etc.
 * Falls back to the first sheet if only one exists or no specific name matches.
 */
export function findBatchSheetName(workbook: XLSX.WorkBook, type: BatchImportType): string {
  const sheetNames = workbook.SheetNames
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('A planilha selecionada está vazia (não contém nenhuma aba).')
  }

  // 1. Try exact or fuzzy match by tab name
  for (const name of sheetNames) {
    const norm = normalizeText(name)
    if (type === 'movel') {
      if (
        norm.includes('movel') ||
        norm.includes('celular') ||
        norm.includes('mov') ||
        norm === 'm'
      ) {
        return name
      }
    } else {
      if (
        norm.includes('residencial') ||
        norm.includes('residen') ||
        norm.includes('fixo') ||
        norm.includes('banda larga') ||
        norm.includes('fibra') ||
        norm.includes('res') ||
        norm === 'r'
      ) {
        return name
      }
    }
  }

  // 2. If single sheet exists, use it
  if (sheetNames.length === 1) {
    return sheetNames[0]
  }

  // 3. Fallback: if not named explicitly, default to first sheet for movel and second for residencial (or first)
  if (type === 'movel') {
    return sheetNames[0]
  }
  return sheetNames[1] || sheetNames[0]
}

/**
 * Parses a batch Excel file client-side for either Móvel or Residencial.
 * Reads all rows from all stores in the file, grouping by store and extracting vendor lines.
 */
export async function parseBatchXlsxFile(
  file: File,
  importType: BatchImportType,
  registeredStores: StoreRecord[] = [],
): Promise<ParsedBatchData> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  const sheetName = findBatchSheetName(workbook, importType)
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    throw new Error(`Aba "${sheetName}" não foi encontrada no arquivo ${file.name}.`)
  }

  // Parse analytical rows using existing analytical parser (faithful to spreadsheet)
  const analyticalSheet: ParsedAnalyticalSheetData = parseAnalyticalWorksheet(
    worksheet,
    sheetName,
    importType,
  )

  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, blankrows: false })
  const detectedColumns = extractWorksheetColumns(jsonData)

  // Find status column
  let statusColIndex = findValidatedStatusColumnIndex(detectedColumns, jsonData, 1)
  if (statusColIndex === -1) {
    statusColIndex = findStatusColumnIndex(detectedColumns)
  }

  // Find quantity column
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
  for (const col of detectedColumns) {
    const norm = normalizeText(col.name)
    if (ACCEPTED_QTY_HEADERS.has(norm)) {
      explicitQtyColIndex = col.columnIndex
      break
    }
  }
  const fallbackQtyColIndex =
    statusColIndex === -1
      ? importType === 'movel'
        ? columnLetterToIndex('AE')
        : columnLetterToIndex('AW')
      : -1
  const activeQtyColIndex = explicitQtyColIndex !== -1 ? explicitQtyColIndex : fallbackQtyColIndex

  // Find Vendor and Store column indices (same rules as parseWorksheet in xlsxParser.ts)
  let vendorColIndex = -1
  let storeColIndex = -1

  for (const col of detectedColumns) {
    const norm = normalizeText(col.name)
    if (
      vendorColIndex === -1 &&
      (norm === 'vendedor' ||
        norm === 'vendedores' ||
        norm === 'consultor' ||
        norm === 'operador' ||
        norm === 'nm vendedor')
    ) {
      vendorColIndex = col.columnIndex
    }
    if (
      storeColIndex === -1 &&
      (norm === 'loja' || norm === 'lojas' || norm === 'nm loja' || norm === 'nome loja')
    ) {
      storeColIndex = col.columnIndex
    }
  }

  // Template fallbacks:
  // Móvel: D (index 3) is Vendedor, E (index 4) is Loja
  // Residencial: AV (index 47) is Vendedor, AU (index 46) is Loja
  if (vendorColIndex === -1) {
    vendorColIndex = importType === 'movel' ? columnLetterToIndex('D') : columnLetterToIndex('AV')
  }
  if (storeColIndex === -1) {
    storeColIndex = importType === 'movel' ? columnLetterToIndex('E') : columnLetterToIndex('AU')
  }

  // Find header row
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i]
    if (!Array.isArray(row) || row.length === 0) continue
    if (isHeaderOrTotalRow(row)) {
      const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
      if (nonBlank.length > 0) {
        headerRowIndex = i
        break
      }
    }
  }

  const dataStartRowIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0

  // Maps by canonical store key
  const storeMap = new Map<
    string,
    {
      rawStoreName: string
      canonicalStoreName: string
      matchedStore?: StoreRecord
      totalLinhas: number
      fatura_paga: number
      envio_fatura: number
      promessa_pagto: number
      sem_contato: number
      cancelados: number
      pendente: number
      contato_realizado: number
      nao_tratados: number
      outros: number
      vendorLinesCount: number
      analyticalRowsCount: number
    }
  >()

  const allVendorLines: ParsedVendorLine[] = []
  let totalValidRows = 0
  let totalExpurgadasRows = 0

  for (let i = dataStartRowIndex; i < jsonData.length; i++) {
    const row = jsonData[i]
    if (!Array.isArray(row) || row.length === 0) continue

    const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonBlank.length === 0) continue

    if (isHeaderOrTotalRow(row)) {
      continue
    }

    // Determine occurrences category:
    // Fidelidade estrita à planilha:
    // Quando a linha possui a coluna Ocorrências preenchida com um valor válido, esse valor
    // prevalece SEMPRE (canonizado: "Não Tratados" -> nao_tratados, etc.).
    // A derivação multi-campo (FATURA, PAGO, VLR PAGO, INDICADOR, PREVENTIVA FPD, VIROU FPD, DSC_STATUS_CONTRATO)
    // só deve ser aplicada quando a coluna Ocorrências NÃO existe na planilha ou a célula está vazia.
    // Empty/blank cell -> EXPURGADA quando não há como classificar.
    let category: FpdStatusKey | null = null
    if (statusColIndex >= 0 && statusColIndex < row.length) {
      const rawCell = row[statusColIndex]
      if (rawCell !== null && rawCell !== undefined && String(rawCell).trim() !== '') {
        const normCell = normalizeText(rawCell)
        category = normCell ? classifyStatusCell(normCell) : null
      }
    }

    // Para lote Residencial: aplicar a derivação multi-campo APENAS quando a coluna
    // de ocorrências não existir ou a célula estiver vazia (!category).
    if (!category && importType === 'residencial') {
      let isFaturaPaga = false
      let isPendente = false
      let isCancelado = false
      let candidateStatus: FpdStatusKey | null = null

      for (let c = 0; c < row.length; c++) {
        const headerName = detectedColumns.find((dc) => dc.columnIndex === c)?.name || ''
        const normHeader = normalizeText(headerName)
        const cellRaw = row[c]
        if (cellRaw === null || cellRaw === undefined || String(cellRaw).trim() === '') continue
        const cellStr = String(cellRaw).trim()
        const normCell = normalizeText(cellStr)

        if (normHeader === 'fatura') {
          if (normCell.includes('paga') || classifyStatusCell(normCell) === 'fatura_paga') {
            isFaturaPaga = true
          } else if (normCell.includes('em aberto') || normCell.includes('aberto')) {
            isPendente = true
          } else if (!candidateStatus) {
            candidateStatus = classifyStatusCell(normCell)
          }
        } else if (normHeader === 'pago') {
          if (cellStr === '1' || normCell === 'pago' || normCell === 'sim' || normCell === 'true') {
            isFaturaPaga = true
          }
        } else if (normHeader === 'vlr pago' || normHeader === 'vlr_pago') {
          const num = Number(cellStr.replace(',', '.'))
          if (!isNaN(num) && num > 0) {
            isFaturaPaga = true
          }
        } else if (normHeader === 'indicador') {
          if (normCell.includes('virou fpd') || normCell.includes('preventiva fpd')) {
            isPendente = true
          } else if (normCell.includes('cancel') || normCell.includes('desconect')) {
            isCancelado = true
          } else if (!candidateStatus) {
            candidateStatus = classifyStatusCell(normCell)
          }
        } else if (normHeader === 'virou fpd') {
          if (cellStr === '1' || normCell === '1' || normCell.includes('virou fpd')) {
            isPendente = true
          }
        } else if (normHeader === 'preventiva fpd') {
          if (cellStr === '1' || normCell === '1' || normCell.includes('preventiva fpd')) {
            isPendente = true
          }
        } else if (normHeader === 'dsc_status_contrato' || normHeader === 'status contrato') {
          if (normCell.includes('cancel') || normCell.includes('desconect')) {
            isCancelado = true
          } else if (!candidateStatus) {
            candidateStatus = classifyStatusCell(normCell)
          }
        }
      }

      if (isFaturaPaga) {
        category = 'fatura_paga'
      } else if (isPendente) {
        category = 'pendente'
      } else if (isCancelado) {
        category = 'cancelados'
      } else if (candidateStatus) {
        category = candidateStatus
      }
    }

    // Célula vazia ou sem ocorrência válida -> EXPURGADA (não contabiliza em totalLinhas nem em nenhuma categoria)
    if (!category) {
      totalExpurgadasRows++
      continue
    }

    // Extract quantity
    let qty = 1
    if (activeQtyColIndex >= 0 && activeQtyColIndex < row.length) {
      const parsedQty = Math.round(extractRowQuantity(row, activeQtyColIndex))
      qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1
    }

    totalValidRows += qty

    // Extract raw store and vendor
    let rawStoreName = ''
    if (storeColIndex >= 0 && storeColIndex < row.length) {
      const val = row[storeColIndex]
      if (val !== null && val !== undefined) {
        rawStoreName = String(val).trim()
      }
    }
    if (!rawStoreName) {
      rawStoreName = 'LOJA NÃO IDENTIFICADA'
    }

    let rawVendorName = ''
    if (vendorColIndex >= 0 && vendorColIndex < row.length) {
      const val = row[vendorColIndex]
      if (val !== null && val !== undefined) {
        rawVendorName = String(val).trim()
      }
    }
    if (!rawVendorName) {
      rawVendorName = 'NÃO INFORMADO'
    }

    // Match store canonically
    const matched = matchStore(rawStoreName, registeredStores)
    const canonicalStoreName = matched ? matched.name : rawStoreName.toUpperCase()
    const storeKey = canonicalStoreName.trim().toUpperCase()

    let storeSummary = storeMap.get(storeKey)
    if (!storeSummary) {
      storeSummary = {
        rawStoreName,
        canonicalStoreName,
        matchedStore: matched || undefined,
        totalLinhas: 0,
        fatura_paga: 0,
        envio_fatura: 0,
        promessa_pagto: 0,
        sem_contato: 0,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
        vendorLinesCount: 0,
        analyticalRowsCount: 0,
      }
      storeMap.set(storeKey, storeSummary)
    }

    storeSummary.totalLinhas += qty
    storeSummary[category] += qty
    storeSummary.vendorLinesCount++

    // Record vendor line
    allVendorLines.push({
      loja: canonicalStoreName,
      vendedor: rawVendorName,
      status: category,
      quantidade: qty,
    })
  }

  // Count analytical rows per store
  for (const aRow of analyticalSheet.rows) {
    const rawLoja = (aRow.loja || '').trim() || 'LOJA NÃO IDENTIFICADA'
    const matched = matchStore(rawLoja, registeredStores)
    const canonicalName = matched ? matched.name : rawLoja.toUpperCase()
    const key = canonicalName.trim().toUpperCase()
    const summary = storeMap.get(key)
    if (summary) {
      summary.analyticalRowsCount++
    }
  }

  const storeSummaries: BatchStoreSummary[] = Array.from(storeMap.values()).map((s) => ({
    rawStoreName: s.rawStoreName,
    canonicalStoreName: s.canonicalStoreName,
    storeId: s.matchedStore?.id,
    totalLinhas: s.totalLinhas,
    fatura_paga: s.fatura_paga,
    envio_fatura: s.envio_fatura,
    promessa_pagto: s.promessa_pagto,
    sem_contato: s.sem_contato,
    cancelados: s.cancelados,
    pendente: s.pendente,
    contato_realizado: s.contato_realizado,
    nao_tratados: s.nao_tratados,
    outros: s.outros,
    vendorLinesCount: s.vendorLinesCount,
    analyticalRowsCount: s.analyticalRowsCount,
  }))

  return {
    fileName: file.name,
    importType,
    targetSheetName: sheetName,
    totalValidRows,
    totalExpurgadasRows,
    storeSummaries,
    analyticalRows: analyticalSheet.rows,
    vendorLines: allVendorLines,
  }
}

/**
 * Executes full batch commit into backend collections:
 * 1. Resolves / creates stores in 'stores' collection
 * 2. Saves individual records in 'imported_files'
 * 3. Upserts consolidated records in 'fpd_records'
 * 4. Upserts vendor consolidations in 'vendor_consolidations'
 * 5. Inserts analytical lines into 'movel' or 'residencial'
 */
export async function executeBatchImport(
  parsed: ParsedBatchData,
  referenceDate: string,
  storesCache: StoreRecord[],
  onProgress?: BatchImportProgressCallback,
): Promise<{
  storesCount: number
  totalFpdUpdated: number
  totalVendorSaved: number
  totalAnalyticalInserted: number
}> {
  let refDate = (referenceDate || '').trim()
  if (!refDate) {
    try {
      const distinctDates = await fetchDistinctReferenceDates()
      if (distinctDates.length > 0 && distinctDates[0]) {
        refDate = distinctDates[0].trim()
      }
    } catch {
      // fallback
    }
  }

  if (!refDate) {
    throw new Error('Data de Referência obrigatória não fornecida para a importação em lote.')
  }

  let currentStoresList = [...storesCache]

  onProgress?.('Verificando lojas e cadastrando faltantes...', 10)

  // 1. Resolve store IDs for all stores found in batch
  const storeIdMap = new Map<string, string>() // canonicalName -> storeId
  for (let sIdx = 0; sIdx < parsed.storeSummaries.length; sIdx++) {
    const sSummary = parsed.storeSummaries[sIdx]
    let storeId = sSummary.storeId
    let match = storeId ? currentStoresList.find((s) => s.id === storeId) : null
    if (!match) {
      match = matchStore(sSummary.canonicalStoreName, currentStoresList)
    }
    if (match) {
      storeId = match.id
    } else {
      // Create new store with rate limit retry
      try {
        const created = await executeWithRateLimitRetry(() =>
          createStore({
            name: sSummary.canonicalStoreName.trim().toUpperCase(),
          }),
        )
        storeId = created.id
        currentStoresList.push(created)
      } catch {
        // If creation fails due to unique constraint or collision, retry match
        const live = await fetchStores()
        currentStoresList = live.length > 0 ? live : currentStoresList
        const recheck = matchStore(sSummary.canonicalStoreName, currentStoresList)
        if (recheck) storeId = recheck.id
      }
    }
    if (storeId) {
      storeIdMap.set(sSummary.canonicalStoreName.trim().toUpperCase(), storeId)
    }

    if (sIdx < parsed.storeSummaries.length - 1) {
      await sleep(50)
    }
  }

  // 2. Save into imported_files and fpd_records per store sequentially with pacing & retry
  onProgress?.('Consolidando totais por loja (fpd_records e imported_files)...', 30)
  let totalFpdUpdated = 0

  for (let idx = 0; idx < parsed.storeSummaries.length; idx++) {
    const s = parsed.storeSummaries[idx]
    const storeId = storeIdMap.get(s.canonicalStoreName.trim().toUpperCase()) || ''

    // Save individual imported_files entry with retry
    await executeWithRateLimitRetry(() =>
      saveImportedFile({
        storeId: storeId || undefined,
        storeName: s.canonicalStoreName,
        fileName: `${parsed.fileName} [LOTE ${parsed.importType === 'movel' ? 'MÓVEL' : 'RESIDENCIAL'}]`,
        referenceDate: refDate,
        total_linhas: s.totalLinhas,
        enviado_faturas: s.envio_fatura,
        envio_fatura: s.envio_fatura,
        pendente: s.pendente,
        fatura_paga: s.fatura_paga,
        sem_contato: s.sem_contato,
        promessa_pagto: s.promessa_pagto,
        cancelados: s.cancelados,
        nao_tratados: s.nao_tratados,
        contato_realizado: s.contato_realizado,
        outros: 0,
      }),
    )

    // Upsert consolidated fpd_record with retry (accumulate: true para não sobrescrever lotes de outros tipos)
    if (storeId) {
      await executeWithRateLimitRetry(() =>
        saveFpdRecord({
          storeId,
          referente: refDate,
          total_linhas: s.totalLinhas,
          envio_fatura: s.envio_fatura,
          pendente: s.pendente,
          fatura_paga: s.fatura_paga,
          sem_contato: s.sem_contato,
          promessa_pagto: s.promessa_pagto,
          cancelados: s.cancelados,
          nao_tratados: s.nao_tratados,
          contato_realizado: s.contato_realizado,
          outros: 0,
          accumulate: true,
        }),
      )
      totalFpdUpdated++
    }

    // Pacing entre lojas
    if (idx < parsed.storeSummaries.length - 1) {
      await sleep(100)
    }

    const pct = 30 + Math.round(((idx + 1) / parsed.storeSummaries.length) * 25)
    onProgress?.(
      `Consolidando loja ${idx + 1}/${parsed.storeSummaries.length}: ${s.canonicalStoreName}`,
      pct,
    )
  }

  // 3. Save vendor consolidations
  onProgress?.('Atualizando ranking de vendedores (vendor_consolidations)...', 60)
  let totalVendorSaved = 0
  if (parsed.vendorLines && parsed.vendorLines.length > 0) {
    totalVendorSaved = await saveVendorConsolidationsFromLines(
      parsed.vendorLines,
      refDate,
      currentStoresList,
    )
  }

  // 4. Save analytical records in movel or residencial
  onProgress?.(
    `Gravando registros na coleção ${parsed.importType === 'movel' ? 'Móvel' : 'Residencial'}...`,
    75,
  )
  let totalAnalyticalInserted = 0

  if (parsed.importType === 'movel') {
    const movelItems: MovelInsertItem[] = parsed.analyticalRows.map((r) => {
      let normalizedLoja = r.loja?.trim() || ''
      if (normalizedLoja) {
        const matched = matchStore(normalizedLoja, currentStoresList)
        if (matched) normalizedLoja = matched.name
      }
      return {
        arquivo: parsed.fileName,
        linha: r.linha,
        loja: normalizedLoja,
        vendedor: r.vendedor,
        cliente: r.cliente,
        dados: r.dados,
        data_referencia: refDate,
        ocorrencias: r.ocorrencias,
      }
    })

    totalAnalyticalInserted = await insertMovelBatch(movelItems, (inserted, total) => {
      const pct = 75 + Math.round((inserted / (total || 1)) * 20)
      onProgress?.(`Gravando Móvel: ${inserted}/${total}`, Math.min(95, pct))
    })
  } else {
    const resItems: ResidencialInsertItem[] = parsed.analyticalRows.map((r) => {
      let normalizedLoja = r.loja?.trim() || ''
      if (normalizedLoja) {
        const matched = matchStore(normalizedLoja, currentStoresList)
        if (matched) normalizedLoja = matched.name
      }
      return {
        arquivo: parsed.fileName,
        linha: r.linha,
        loja: normalizedLoja,
        vendedor: r.vendedor,
        cliente: r.cliente,
        dados: r.dados,
        data_referencia: refDate,
        typedFields: r.typedFields,
        ocorrencias: r.ocorrencias,
      }
    })

    totalAnalyticalInserted = await insertResidencialBatch(resItems, (inserted, total) => {
      const pct = 75 + Math.round((inserted / (total || 1)) * 20)
      onProgress?.(`Gravando Residencial: ${inserted}/${total}`, Math.min(95, pct))
    })
  }

  onProgress?.('Importação em lote concluída!', 100)

  return {
    storesCount: parsed.storeSummaries.length,
    totalFpdUpdated,
    totalVendorSaved,
    totalAnalyticalInserted,
  }
}
