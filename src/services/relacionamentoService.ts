import pb from '@/lib/pocketbase/client'
import { buildStoreFilterClause, getStoreVariants } from '@/lib/storeMatchingUtils'
import { executeWithRateLimitRetry, sleep, isRateLimitError } from '@/lib/pocketbase/rateLimiter'
import {
  extractMovelDeduplicationKey,
  extractResidencialDeduplicationKey,
} from '@/lib/clientDeduplication'
import type {
  MovelRecord,
  ResidencialRecord,
  RelacionamentoAba,
  UnifiedAnalyticRecord,
} from '@/types/fpd'

export interface FetchAnalyticalParams {
  page?: number
  perPage?: number
  search?: string
  aba?: RelacionamentoAba | 'TODAS'
  loja?: string
  sort?: string
  allowedStoreNames?: string[]
  dataReferencia?: string
}

export interface FetchAnalyticalResult {
  items: UnifiedAnalyticRecord[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
  totalMovel: number
  totalResidencial: number
}

// In-flight request deduplication map
const pendingAnalyticalRequests = new Map<string, Promise<FetchAnalyticalResult>>()
let pendingLojasRequest: Promise<string[]> | null = null

// Short TTL memory cache for distinct lojas to prevent repeat requests
let cachedLojas: { data: string[]; timestamp: number } | null = null
const LOJAS_CACHE_TTL = 30000 // 30 seconds

/**
 * Invalidate stores cache when new data is imported or deleted
 */
export function invalidateAnalyticalCache() {
  cachedLojas = null
  pendingAnalyticalRequests.clear()
  pendingLojasRequest = null
}

/**
 * Lists rows from the 'movel' and 'residencial' collections with filtering and pagination.
 * Features request deduplication to prevent duplicate in-flight requests and avoids 429 errors.
 */
export async function fetchAnalyticalRows(
  params: FetchAnalyticalParams = {},
): Promise<FetchAnalyticalResult> {
  const page = Math.max(1, Number(params.page) || 1)
  const perPage = Math.max(1, Math.min(100, Number(params.perPage) || 25))
  const selectedAba = params.aba || 'TODAS'
  const loja = params.loja || 'TODAS'
  const search = params.search?.trim() || ''
  const sortStr = params.sort || '-created'
  const dataReferencia = params.dataReferencia?.trim() || ''

  const allowedStoreNames = params.allowedStoreNames

  // Build a unique key for in-flight deduplication
  const cacheKey = JSON.stringify({
    page,
    perPage,
    selectedAba,
    loja,
    search,
    dataReferencia,
    sortStr,
    allowedStoreNames,
  })

  const existing = pendingAnalyticalRequests.get(cacheKey)
  if (existing) {
    return existing
  }

  const fetchPromise = (async (): Promise<FetchAnalyticalResult> => {
    const filterParts: string[] = []

    if (loja && loja !== 'TODAS' && loja.trim() !== '') {
      const storeClause = buildStoreFilterClause(loja)
      if (storeClause) {
        filterParts.push(storeClause)
      }
    } else if (allowedStoreNames !== undefined) {
      if (allowedStoreNames.length === 0) {
        return {
          items: [],
          totalItems: 0,
          totalPages: 1,
          page,
          perPage,
          totalMovel: 0,
          totalResidencial: 0,
        }
      } else {
        const expandedStoreNames = new Set<string>()
        for (const st of allowedStoreNames) {
          if (!st || !st.trim()) continue
          const variants = getStoreVariants(st)
          variants.forEach((v) => expandedStoreNames.add(v))
        }

        const storeFilters = Array.from(expandedStoreNames).map(
          (st) => `loja = "${st.replace(/"/g, '\\"')}"`,
        )
        if (storeFilters.length > 0) {
          filterParts.push(`(${storeFilters.join(' || ')})`)
        }
      }
    }

    if (search) {
      const s = search.replace(/"/g, '\\"')
      filterParts.push(
        `(loja ~ "${s}" || arquivo ~ "${s}" || vendedor ~ "${s}" || cliente ~ "${s}")`,
      )
    }

    if (dataReferencia && dataReferencia !== 'TODAS') {
      const escapedRef = dataReferencia.replace(/"/g, '\\"')
      // Query with fallback for legacy records where data_referencia is empty/unset
      filterParts.push(
        `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
      )
    }

    const filterStr = filterParts.length > 0 ? filterParts.join(' && ') : undefined

    if (selectedAba === 'Móvel') {
      const res = await executeWithRetry(() =>
        pb.collection('movel').getList<MovelRecord>(page, perPage, {
          filter: filterStr,
          sort: sortStr,
          requestKey: null,
        }),
      )

      const items: UnifiedAnalyticRecord[] = res.items.map((r) => ({
        ...r,
        aba: 'Móvel',
        rawRecord: r,
      }))

      return {
        items,
        totalItems: res.totalItems,
        totalPages: res.totalPages,
        page: res.page,
        perPage: res.perPage,
        totalMovel: res.totalItems,
        totalResidencial: 0,
      }
    }

    if (selectedAba === 'Residencial') {
      const res = await executeWithRetry(() =>
        pb.collection('residencial').getList<ResidencialRecord>(page, perPage, {
          filter: filterStr,
          sort: sortStr,
          requestKey: null,
        }),
      )

      const items: UnifiedAnalyticRecord[] = res.items.map((r) => ({
        ...r,
        aba: 'Residencial',
        rawRecord: r,
      }))

      return {
        items,
        totalItems: res.totalItems,
        totalPages: res.totalPages,
        page: res.page,
        perPage: res.perPage,
        totalMovel: 0,
        totalResidencial: res.totalItems,
      }
    }

    // When 'TODAS': Fetch items from both collections
    // Limit perPage on individual queries to prevent excessive data transfer
    const fetchLimit = Math.min(perPage, 50)
    const [resMovel, resResidencial] = await Promise.all([
      executeWithRetry(() =>
        pb.collection('movel').getList<MovelRecord>(page, fetchLimit, {
          filter: filterStr,
          sort: sortStr,
          requestKey: null,
        }),
      ),
      executeWithRetry(() =>
        pb.collection('residencial').getList<ResidencialRecord>(page, fetchLimit, {
          filter: filterStr,
          sort: sortStr,
          requestKey: null,
        }),
      ),
    ])

    const movelUnified: UnifiedAnalyticRecord[] = resMovel.items.map((r) => ({
      ...r,
      aba: 'Móvel',
      rawRecord: r,
    }))

    const residencialUnified: UnifiedAnalyticRecord[] = resResidencial.items.map((r) => ({
      ...r,
      aba: 'Residencial',
      rawRecord: r,
    }))

    // Merge and sort by created descending
    const merged = [...movelUnified, ...residencialUnified].sort((a, b) => {
      const dateA = new Date(a.created || 0).getTime()
      const dateB = new Date(b.created || 0).getTime()
      return dateB - dateA
    })

    const totalItems = resMovel.totalItems + resResidencial.totalItems
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage))

    // If page is 1, take first perPage items directly
    const paginatedItems = merged.slice(0, perPage)

    return {
      items: paginatedItems,
      totalItems,
      totalPages,
      page,
      perPage,
      totalMovel: resMovel.totalItems,
      totalResidencial: resResidencial.totalItems,
    }
  })()

  pendingAnalyticalRequests.set(cacheKey, fetchPromise)
  try {
    return await fetchPromise
  } finally {
    pendingAnalyticalRequests.delete(cacheKey)
  }
}

/**
 * Fetch distinct store names from both 'movel' and 'residencial' collections for filtering.
 * Uses cached memory or bounded SDK queries, preventing massive record downloads.
 */
export async function fetchDistinctAnalyticalLojas(): Promise<string[]> {
  const now = Date.now()
  if (cachedLojas && now - cachedLojas.timestamp < LOJAS_CACHE_TTL) {
    return cachedLojas.data
  }

  if (pendingLojasRequest) {
    return pendingLojasRequest
  }

  const fetchPromise = (async () => {
    try {
      const [recordsMovel, recordsResidencial] = await Promise.all([
        pb
          .collection('movel')
          .getFullList<MovelRecord>({
            fields: 'loja',
            sort: 'loja',
            requestKey: null,
          })
          .catch(() => []),
        pb
          .collection('residencial')
          .getFullList<ResidencialRecord>({
            fields: 'loja',
            sort: 'loja',
            requestKey: null,
          })
          .catch(() => []),
      ])

      const lojasSet = new Set<string>()
      for (const r of recordsMovel) {
        if (r.loja && r.loja.trim()) lojasSet.add(r.loja.trim())
      }
      for (const r of recordsResidencial) {
        if (r.loja && r.loja.trim()) lojasSet.add(r.loja.trim())
      }

      const result = Array.from(lojasSet).sort((a, b) => a.localeCompare(b))
      cachedLojas = { data: result, timestamp: Date.now() }
      return result
    } catch (err) {
      console.error('Erro ao buscar lojas analíticas:', err)
      return cachedLojas?.data || []
    }
  })()

  pendingLojasRequest = fetchPromise
  try {
    return await fetchPromise
  } finally {
    pendingLojasRequest = null
  }
}

/**
 * Format error message from PocketBase error object for reporting
 */
function extractErrorMessage(err: unknown): string {
  if (!err) return 'Erro desconhecido'
  const errObj = err as {
    message?: string
    status?: number
    response?: { message?: string; data?: Record<string, { message?: string; code?: string }> }
  }

  if (errObj.response?.data && typeof errObj.response.data === 'object') {
    const fieldDetails = Object.entries(errObj.response.data)
      .map(([k, v]) => `${k}: ${v?.message || JSON.stringify(v)}`)
      .join(', ')
    if (fieldDetails) return fieldDetails
  }

  if (errObj.response?.message) return errObj.response.message
  if (errObj.message) return errObj.message
  return String(err)
}

/**
 * Parse Retry-After header or return null if not available
 */
function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const errObj = err as {
    response?: {
      headers?: Record<string, string | number> | Headers
    }
  }
  const headers = errObj.response?.headers
  if (!headers) return null

  let rawValue: string | number | null = null
  if (typeof (headers as Headers).get === 'function') {
    rawValue = (headers as Headers).get('retry-after') || (headers as Headers).get('Retry-After')
  } else if (typeof headers === 'object') {
    rawValue =
      (headers as Record<string, string | number>)['retry-after'] ||
      (headers as Record<string, string | number>)['Retry-After']
  }

  if (!rawValue) return null
  const parsedSeconds = Number(rawValue)
  if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
    return Math.min(parsedSeconds * 1000, 30000)
  }
  return null
}

/**
 * Execute a PocketBase operation with exponential backoff and Retry-After support on HTTP 429 errors.
 * Retries up to `maxRetries` times (default: 6) before throwing.
 */
async function executeWithRetry<T>(
  action: () => Promise<T>,
  maxRetries = 6,
  initialBackoffMs = 1000,
): Promise<T> {
  return executeWithRateLimitRetry(action, {
    maxRetries,
    initialBackoffMs,
    maxBackoffMs: 20000,
  })
}

// Pause between sequential requests (150ms) to safely stay under rate limits without stalling
const SEQUENTIAL_PAUSE_MS = 150

export interface MovelInsertItem {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  data_referencia?: string
}

interface ExistingRecordManualInfo {
  id: string
  arquivo?: string
  linha?: number
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  dedupKey?: string
}

/**
 * Busca registros existentes no banco para a coleção e datas de referência especificadas,
 * indexando por:
 * 1) chave de negócio normalizada (nr_contrato no Residencial, Número no Móvel) por data_referencia
 * 2) fallback: arquivo + linha (comportamento legado para quando não há chave de negócio)
 */
async function fetchExistingRecordsForDeduplication(
  collectionName: 'movel' | 'residencial',
  options: {
    dataReferencias: string[]
    fileNames: string[]
  },
): Promise<{
  byKeyAndRef: Map<string, ExistingRecordManualInfo>
  byFileAndLine: Map<string, ExistingRecordManualInfo>
}> {
  const byKeyAndRef = new Map<string, ExistingRecordManualInfo>()
  const byFileAndLine = new Map<string, ExistingRecordManualInfo>()

  const { dataReferencias, fileNames } = options
  const filterParts: string[] = []

  const validRefs = Array.from(new Set(dataReferencias.map((r) => r.trim()).filter(Boolean)))
  const validFiles = Array.from(new Set(fileNames.map((f) => f.trim()).filter(Boolean)))

  if (validRefs.length > 0) {
    const refClauses = validRefs.map((r) => `data_referencia = "${r.replace(/"/g, '\\"')}"`)
    filterParts.push(`(${refClauses.join(' || ')})`)
  } else if (validFiles.length > 0) {
    const fileClauses = validFiles.map((f) => `arquivo = "${f.replace(/"/g, '\\"')}"`)
    filterParts.push(`(${fileClauses.join(' || ')})`)
  } else {
    return { byKeyAndRef, byFileAndLine }
  }

  const filter = filterParts.join(' && ')

  try {
    let page = 1
    const perPage = 200
    while (true) {
      const res = await executeWithRetry(
        () =>
          pb.collection(collectionName).getList<{
            id: string
            arquivo?: string
            linha?: number
            dados?: Record<string, unknown>
            typedFields?: Record<string, string>
            nr_contrato?: string
            ocorrencias?: string
            data_promessa_de_pagto?: string
            comentarios?: string
            data_referencia?: string
          }>(page, perPage, {
            filter,
            fields:
              'id,arquivo,linha,dados,nr_contrato,ocorrencias,data_promessa_de_pagto,comentarios,data_referencia',
            requestKey: null,
          }),
        5,
        1000,
      )

      for (const item of res.items) {
        const refKey = item.data_referencia?.trim() || ''
        const dedupKey =
          collectionName === 'residencial'
            ? extractResidencialDeduplicationKey(item)
            : extractMovelDeduplicationKey(item)

        const manualInfo: ExistingRecordManualInfo = {
          id: item.id,
          arquivo: item.arquivo,
          linha: item.linha,
          ocorrencias: item.ocorrencias || '',
          data_promessa_de_pagto: item.data_promessa_de_pagto || '',
          comentarios: item.comentarios || '',
          dedupKey,
        }

        if (dedupKey && refKey) {
          const mapKey = `${refKey}::${dedupKey}`
          // Priorizar registro que tenha campos manuais preenchidos se houver mais de um no banco
          const existing = byKeyAndRef.get(mapKey)
          if (!existing) {
            byKeyAndRef.set(mapKey, manualInfo)
          } else {
            const hasExistingManual = !!(
              existing.ocorrencias ||
              existing.data_promessa_de_pagto ||
              existing.comentarios
            )
            const hasNewManual = !!(
              manualInfo.ocorrencias ||
              manualInfo.data_promessa_de_pagto ||
              manualInfo.comentarios
            )
            if (!hasExistingManual && hasNewManual) {
              byKeyAndRef.set(mapKey, manualInfo)
            }
          }
        }

        if (item.arquivo && item.linha !== undefined && item.linha !== null) {
          const fileLineKey = `${item.arquivo.trim()}::${item.linha}`
          byFileAndLine.set(fileLineKey, manualInfo)
        }
      }

      if (page >= res.totalPages || res.items.length === 0) break
      page++
    }
  } catch (err) {
    console.warn(
      `[relacionamentoService] Aviso ao buscar registros existentes em ${collectionName}:`,
      err,
    )
  }

  return { byKeyAndRef, byFileAndLine }
}

/**
 * Deduplica itens do lote em memória (intra-batch deduplication).
 * Mesma data_referencia + mesma chave de negócio = mantém o mais recente (último) do lote,
 * preservando eventuais campos manuais já preenchidos.
 * Itens sem chave de negócio não são colapsados entre si (mantidos como estão).
 */
export function deduplicateMovelBatchItems(rows: MovelInsertItem[]): MovelInsertItem[] {
  if (!rows || rows.length <= 1) return rows || []

  const dedupMap = new Map<string, MovelInsertItem>()
  const itemsWithoutKey: MovelInsertItem[] = []

  for (const item of rows) {
    const key = extractMovelDeduplicationKey(item)
    const ref = item.data_referencia?.trim() || ''

    if (key && ref) {
      const compositeKey = `${ref}::${key}`
      const existing = dedupMap.get(compositeKey)
      if (existing) {
        // Mesclar preservando ocorrências/promessa/comentários se já preenchidos no anterior
        const merged: MovelInsertItem = {
          ...item,
          ocorrencias: (item.ocorrencias || existing.ocorrencias || '').trim(),
          data_promessa_de_pagto:
            item.data_promessa_de_pagto || existing.data_promessa_de_pagto || '',
          comentarios: item.comentarios || existing.comentarios || '',
        }
        dedupMap.set(compositeKey, merged)
      } else {
        dedupMap.set(compositeKey, item)
      }
    } else {
      itemsWithoutKey.push(item)
    }
  }

  return [...Array.from(dedupMap.values()), ...itemsWithoutKey]
}

/**
 * Deduplica itens do lote Residencial em memória (intra-batch deduplication).
 */
export function deduplicateResidencialBatchItems(
  rows: ResidencialInsertItem[],
): ResidencialInsertItem[] {
  if (!rows || rows.length <= 1) return rows || []

  const dedupMap = new Map<string, ResidencialInsertItem>()
  const itemsWithoutKey: ResidencialInsertItem[] = []

  for (const item of rows) {
    const key = extractResidencialDeduplicationKey(item)
    const ref = item.data_referencia?.trim() || ''

    if (key && ref) {
      const compositeKey = `${ref}::${key}`
      const existing = dedupMap.get(compositeKey)
      if (existing) {
        const merged: ResidencialInsertItem = {
          ...item,
          ocorrencias: (
            item.ocorrencias ||
            item.typedFields?.ocorrencias ||
            existing.ocorrencias ||
            existing.typedFields?.ocorrencias ||
            ''
          ).trim(),
          data_promessa_de_pagto:
            item.data_promessa_de_pagto ||
            item.typedFields?.data_promessa_de_pagto ||
            existing.data_promessa_de_pagto ||
            existing.typedFields?.data_promessa_de_pagto ||
            '',
          comentarios:
            item.comentarios ||
            item.typedFields?.comentarios ||
            existing.comentarios ||
            existing.typedFields?.comentarios ||
            '',
        }
        dedupMap.set(compositeKey, merged)
      } else {
        dedupMap.set(compositeKey, item)
      }
    } else {
      itemsWithoutKey.push(item)
    }
  }

  return [...Array.from(dedupMap.values()), ...itemsWithoutKey]
}

/**
 * Insert or upsert rows into collection 'movel' sequentially one by one with a safe pause.
 * Regras anti-duplicidade:
 * 1. Chave de negócio: Número (primeira coluna do arquivo / campo de dados).
 * 2. Escopo: data_referencia + chave normalizada.
 * 3. Se chave encontrada no banco ou intra-lote: UPDATE em vez de CREATE,
 *    preservando ocorrencias, data_promessa_de_pagto e comentarios.
 * 4. Chave vazia: fallback para arquivo + linha.
 */
export async function insertMovelBatch(
  rows: MovelInsertItem[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  // 1. Deduplicação intra-lote: mesmo contrato no mesmo lote não gera duas operações
  const cleanRows = deduplicateMovelBatchItems(rows)

  // 2. Pré-carregar registros existentes no banco para a mesma data_referencia e arquivos
  const distinctRefs = Array.from(
    new Set(cleanRows.map((r) => r.data_referencia?.trim()).filter(Boolean)),
  ) as string[]
  const distinctFiles = Array.from(
    new Set(cleanRows.map((r) => r.arquivo?.trim()).filter(Boolean)),
  ) as string[]

  const { byKeyAndRef, byFileAndLine } = await fetchExistingRecordsForDeduplication('movel', {
    dataReferencias: distinctRefs,
    fileNames: distinctFiles,
  })

  let processedTotal = 0
  const accumulatedErrors: string[] = []

  for (let idx = 0; idx < cleanRows.length; idx++) {
    const item = cleanRows[idx]
    const fileKey = item.arquivo?.trim() || ''
    const refKey = item.data_referencia?.trim() || ''
    const businessKey = extractMovelDeduplicationKey(item)

    // Localizar registro existente:
    // (a) por chave de negócio + data_referencia
    // (b) fallback: arquivo + linha (se não houver chave de negócio)
    let existingRecord: ExistingRecordManualInfo | undefined
    if (businessKey && refKey) {
      existingRecord = byKeyAndRef.get(`${refKey}::${businessKey}`)
    }
    if (!existingRecord && fileKey && item.linha !== undefined && item.linha !== null) {
      existingRecord = byFileAndLine.get(`${fileKey}::${item.linha}`)
    }

    // Preserve manual fields from existing record if not explicitly provided in new item
    const preservedOcorrencias = (existingRecord?.ocorrencias || item.ocorrencias || '').trim()
    const preservedPromessa =
      item.data_promessa_de_pagto || existingRecord?.data_promessa_de_pagto || ''
    const preservedComentarios = item.comentarios || existingRecord?.comentarios || ''

    const payload = {
      arquivo: fileKey,
      linha: item.linha,
      loja: item.loja?.trim() || '',
      vendedor: item.vendedor?.trim() || '',
      cliente: item.cliente?.trim() || '',
      dados: item.dados || {},
      ocorrencias: preservedOcorrencias,
      data_promessa_de_pagto: preservedPromessa,
      comentarios: preservedComentarios,
      data_referencia: refKey,
    }

    try {
      if (existingRecord) {
        // Update existing record
        await executeWithRetry(
          () => pb.collection('movel').update(existingRecord!.id, payload, { requestKey: null }),
          6,
          800,
        )
      } else {
        // Create new record
        const created = await executeWithRetry(
          () => pb.collection('movel').create(payload, { requestKey: null }),
          6,
          800,
        )
        // Atualizar mapas em memória para caso registros seguintes coincidam
        if (businessKey && refKey) {
          byKeyAndRef.set(`${refKey}::${businessKey}`, {
            id: created.id,
            arquivo: fileKey,
            linha: item.linha,
            ocorrencias: preservedOcorrencias,
            data_promessa_de_pagto: preservedPromessa,
            comentarios: preservedComentarios,
            dedupKey: businessKey,
          })
        }
        if (fileKey && item.linha !== undefined && item.linha !== null) {
          byFileAndLine.set(`${fileKey}::${item.linha}`, {
            id: created.id,
            arquivo: fileKey,
            linha: item.linha,
            ocorrencias: preservedOcorrencias,
            data_promessa_de_pagto: preservedPromessa,
            comentarios: preservedComentarios,
          })
        }
      }
      processedTotal++
    } catch (err: unknown) {
      const fileInfo = item.arquivo ? `arquivo '${item.arquivo}'` : 'arquivo desconhecido'
      const lineInfo =
        item.linha !== undefined && item.linha !== null ? `, linha ${item.linha}` : ''
      const is429 = isRateLimitError(err)
      const errorDetail = is429
        ? 'Limite de requisições excedido (Too Many Requests). Reprocesse o lote.'
        : extractErrorMessage(err)
      accumulatedErrors.push(`[Móvel] ${fileInfo}${lineInfo}: ${errorDetail}`)
    }

    if (onProgress) {
      onProgress(processedTotal, cleanRows.length)
    }

    // Conservative pause between sequential requests
    if (idx < cleanRows.length - 1) {
      await sleep(SEQUENTIAL_PAUSE_MS)
    }
  }

  if (accumulatedErrors.length > 0) {
    const summary =
      accumulatedErrors.length === 1
        ? `Falha ao importar: ${accumulatedErrors[0]}`
        : `Falha ao importar ${accumulatedErrors.length} registro(s):\n• ${accumulatedErrors.slice(0, 10).join('\n• ')}${
            accumulatedErrors.length > 10
              ? `\n... e mais ${accumulatedErrors.length - 10} falha(s).`
              : ''
          }`
    throw new Error(summary)
  }

  return processedTotal
}

export interface ResidencialInsertItem {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
  typedFields?: Record<string, string>
  nr_contrato?: string
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  data_referencia?: string
}

/**
 * Insert or upsert rows into collection 'residencial' sequentially one by one with a safe pause.
 * Preserves existing 'ocorrencias', 'data_promessa_de_pagto' and 'comentarios' when re-importing the same file+linha.
 * All new records default to 'Não Tratados' for 'ocorrencias'.
 */
export async function insertResidencialBatch(
  rows: ResidencialInsertItem[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  // 1. Deduplicação intra-lote: mesmo contrato no mesmo lote não gera duas operações
  const cleanRows = deduplicateResidencialBatchItems(rows)

  // 2. Pré-carregar registros existentes no banco para a mesma data_referencia e arquivos
  const distinctRefs = Array.from(
    new Set(cleanRows.map((r) => r.data_referencia?.trim()).filter(Boolean)),
  ) as string[]
  const distinctFiles = Array.from(
    new Set(cleanRows.map((r) => r.arquivo?.trim()).filter(Boolean)),
  ) as string[]

  const { byKeyAndRef, byFileAndLine } = await fetchExistingRecordsForDeduplication('residencial', {
    dataReferencias: distinctRefs,
    fileNames: distinctFiles,
  })

  let processedTotal = 0
  const accumulatedErrors: string[] = []

  for (let idx = 0; idx < cleanRows.length; idx++) {
    const item = cleanRows[idx]
    const fileKey = item.arquivo?.trim() || ''
    const refKey = item.data_referencia?.trim() || ''
    const businessKey = extractResidencialDeduplicationKey(item)

    // Localizar registro existente:
    // (a) por chave de negócio + data_referencia
    // (b) fallback: arquivo + linha (se não houver chave de negócio)
    let existingRecord: ExistingRecordManualInfo | undefined
    if (businessKey && refKey) {
      existingRecord = byKeyAndRef.get(`${refKey}::${businessKey}`)
    }
    if (!existingRecord && fileKey && item.linha !== undefined && item.linha !== null) {
      existingRecord = byFileAndLine.get(`${fileKey}::${item.linha}`)
    }

    // Preserve manual fields if existing. Faithful occurrence: never default to 'Não Tratados'
    const typedOcorrencias = item.typedFields?.ocorrencias || item.ocorrencias
    const preservedOcorrencias = (existingRecord?.ocorrencias || typedOcorrencias || '').trim()

    const typedPromessa = item.typedFields?.data_promessa_de_pagto || item.data_promessa_de_pagto
    const preservedPromessa = typedPromessa || existingRecord?.data_promessa_de_pagto || ''

    const typedComentarios = item.typedFields?.comentarios || item.comentarios
    const preservedComentarios = typedComentarios || existingRecord?.comentarios || ''

    const payload = {
      arquivo: fileKey,
      linha: item.linha,
      loja: item.loja?.trim() || '',
      vendedor: item.vendedor?.trim() || '',
      cliente: item.cliente?.trim() || '',
      dados: item.dados || {},
      ...(item.typedFields || {}),
      ocorrencias: preservedOcorrencias,
      data_promessa_de_pagto: preservedPromessa,
      comentarios: preservedComentarios,
      data_referencia: refKey,
    }

    try {
      if (existingRecord) {
        // Update existing record
        await executeWithRetry(
          () =>
            pb.collection('residencial').update(existingRecord!.id, payload, { requestKey: null }),
          6,
          800,
        )
      } else {
        // Create new record
        const created = await executeWithRetry(
          () => pb.collection('residencial').create(payload, { requestKey: null }),
          6,
          800,
        )
        // Atualizar mapas em memória para caso registros seguintes coincidam
        if (businessKey && refKey) {
          byKeyAndRef.set(`${refKey}::${businessKey}`, {
            id: created.id,
            arquivo: fileKey,
            linha: item.linha,
            ocorrencias: preservedOcorrencias,
            data_promessa_de_pagto: preservedPromessa,
            comentarios: preservedComentarios,
            dedupKey: businessKey,
          })
        }
        if (fileKey && item.linha !== undefined && item.linha !== null) {
          byFileAndLine.set(`${fileKey}::${item.linha}`, {
            id: created.id,
            arquivo: fileKey,
            linha: item.linha,
            ocorrencias: preservedOcorrencias,
            data_promessa_de_pagto: preservedPromessa,
            comentarios: preservedComentarios,
          })
        }
      }
      processedTotal++
    } catch (err: unknown) {
      const fileInfo = item.arquivo ? `arquivo '${item.arquivo}'` : 'arquivo desconhecido'
      const lineInfo =
        item.linha !== undefined && item.linha !== null ? `, linha ${item.linha}` : ''
      const is429 = isRateLimitError(err)
      const errorDetail = is429
        ? 'Limite de requisições excedido (Too Many Requests). Reprocesse o lote.'
        : extractErrorMessage(err)
      accumulatedErrors.push(`[Residencial] ${fileInfo}${lineInfo}: ${errorDetail}`)
    }

    if (onProgress) {
      onProgress(processedTotal, cleanRows.length)
    }

    // Conservative pause between sequential requests
    if (idx < cleanRows.length - 1) {
      await sleep(SEQUENTIAL_PAUSE_MS)
    }
  }

  if (accumulatedErrors.length > 0) {
    const summary =
      accumulatedErrors.length === 1
        ? `Falha ao importar: ${accumulatedErrors[0]}`
        : `Falha ao importar ${accumulatedErrors.length} registro(s):\n• ${accumulatedErrors.slice(0, 10).join('\n• ')}${
            accumulatedErrors.length > 10
              ? `\n... e mais ${accumulatedErrors.length - 10} falha(s).`
              : ''
          }`
    throw new Error(summary)
  }

  return processedTotal
}

/**
 * Update manual fields (ocorrencias, data_promessa_de_pagto and comentarios) for a single row in 'movel' or 'residencial'.
 */
export async function updateClientManualFields(
  id: string,
  aba: RelacionamentoAba,
  fields: { ocorrencias?: string; data_promessa_de_pagto?: string; comentarios?: string },
): Promise<boolean> {
  const collectionName = aba === 'Móvel' ? 'movel' : 'residencial'
  return await executeWithRetry(
    async () => {
      await pb.collection(collectionName).update(id, fields, { requestKey: null })
      return true
    },
    5,
    1000,
  )
}

/**
 * Delete a single record from 'movel' or 'residencial'.
 */
export async function deleteAnalyticalRow(id: string, aba: RelacionamentoAba): Promise<boolean> {
  invalidateAnalyticalCache()
  const collectionName = aba === 'Móvel' ? 'movel' : 'residencial'
  return await executeWithRetry(
    () => pb.collection(collectionName).delete(id, { requestKey: null }),
    5,
    1000,
  )
}

/**
 * Clear all records from 'movel' and 'residencial' collections (or single aba)
 * using sequential deletion with throttle and retry to safely prevent HTTP 429.
 */
export interface ClearAnalyticalRowsOptions {
  targetAba?: RelacionamentoAba | 'TODAS'
  loja?: string
  lojas?: string[]
}

/**
 * Clear records from 'movel' and 'residencial' collections (or single aba / specific stores).
 * Tries the custom backend endpoint first (/api/custom/analytical/clear) which deletes server-side
 * inside a single fast SQL transaction without 429 rate limit risk.
 * Falls back to batched client-side deletion with exponential backoff if the endpoint fails.
 */
export async function clearAllAnalyticalRows(
  optionsOrTargetAba?: RelacionamentoAba | 'TODAS' | ClearAnalyticalRowsOptions,
): Promise<{
  movelCount: number
  residencialCount: number
  relacionamentoCount?: number
}> {
  invalidateAnalyticalCache()

  let target: RelacionamentoAba | 'TODAS' = 'TODAS'
  let lojas: string[] = []

  if (typeof optionsOrTargetAba === 'string') {
    target = optionsOrTargetAba
  } else if (optionsOrTargetAba && typeof optionsOrTargetAba === 'object') {
    target = optionsOrTargetAba.targetAba || 'TODAS'
    if (Array.isArray(optionsOrTargetAba.lojas)) {
      lojas = optionsOrTargetAba.lojas
    } else if (optionsOrTargetAba.loja && optionsOrTargetAba.loja !== 'TODAS') {
      lojas = [optionsOrTargetAba.loja]
    }
  }

  // 1. Try server-side endpoint first (avoids 429 and does atomic deletion)
  try {
    const res = await pb.send<{
      success: boolean
      movelCount: number
      residencialCount: number
      relacionamentoCount?: number
    }>('/backend/v1/custom/analytical/clear', {
      method: 'POST',
      body: {
        targetAba: target,
        lojas,
      },
    })
    if (res && res.success) {
      return {
        movelCount: res.movelCount || 0,
        residencialCount: res.residencialCount || 0,
        relacionamentoCount: res.relacionamentoCount || 0,
      }
    }
  } catch (endpointErr) {
    console.warn(
      '[relacionamentoService] Endpoint server-side /backend/v1/custom/analytical/clear não respondeu, usando fallback seguro:',
      endpointErr,
    )
  }

  // 2. Fallback: batched sequential deletion with throttle and retry
  let movelCount = 0
  let residencialCount = 0

  const shouldClearMovel = target === 'TODAS' || target === 'Móvel'
  const shouldClearResidencial = target === 'TODAS' || target === 'Residencial'
  const FETCH_PAGE_SIZE = 50

  const buildLojaFilter = () => {
    if (lojas.length === 0) return undefined
    const parts: string[] = []
    for (const l of lojas) {
      const storeClause = buildStoreFilterClause(l)
      if (storeClause) {
        parts.push(storeClause)
      }
    }
    return parts.length > 0 ? `(${parts.join(' || ')})` : undefined
  }

  const filter = buildLojaFilter()

  // 2.1 Clear Móvel
  if (shouldClearMovel) {
    try {
      while (true) {
        const page = await executeWithRetry(
          () =>
            pb.collection('movel').getList<{ id: string }>(1, FETCH_PAGE_SIZE, {
              fields: 'id',
              filter,
              requestKey: null,
            }),
          5,
          1000,
        )
        if (!page.items || page.items.length === 0) break

        for (let i = 0; i < page.items.length; i++) {
          const item = page.items[i]
          try {
            await executeWithRetry(
              () => pb.collection('movel').delete(item.id, { requestKey: null }),
              5,
              1000,
            )
            movelCount++
          } catch (delErr: unknown) {
            const status = (delErr as { status?: number })?.status
            if (status !== 404) {
              console.error(`Erro ao deletar id ${item.id} de movel:`, delErr)
            }
          }

          await sleep(SEQUENTIAL_PAUSE_MS)
        }

        if (page.items.length < FETCH_PAGE_SIZE) break
      }
    } catch (err) {
      console.error('Erro na limpeza da tabela móvel:', err)
      throw new Error('Não foi possível limpar a tabela Móvel.')
    }
  }

  // 2.2 Clear Residencial
  if (shouldClearResidencial) {
    try {
      while (true) {
        const page = await executeWithRetry(
          () =>
            pb.collection('residencial').getList<{ id: string }>(1, FETCH_PAGE_SIZE, {
              fields: 'id',
              filter,
              requestKey: null,
            }),
          5,
          1000,
        )
        if (!page.items || page.items.length === 0) break

        for (let i = 0; i < page.items.length; i++) {
          const item = page.items[i]
          try {
            await executeWithRetry(
              () => pb.collection('residencial').delete(item.id, { requestKey: null }),
              5,
              1000,
            )
            residencialCount++
          } catch (delErr: unknown) {
            const status = (delErr as { status?: number })?.status
            if (status !== 404) {
              console.error(`Erro ao deletar id ${item.id} de residencial:`, delErr)
            }
          }

          await sleep(SEQUENTIAL_PAUSE_MS)
        }

        if (page.items.length < FETCH_PAGE_SIZE) break
      }
    } catch (err) {
      console.error('Erro na limpeza da tabela residencial:', err)
      throw new Error('Não foi possível limpar a tabela Residencial.')
    }
  }

  return { movelCount, residencialCount }
}

// Backward compatibility exports for existing codebase referencing relacionamentoService
export {
  fetchAnalyticalRows as fetchRelacionamentoRows,
  fetchDistinctAnalyticalLojas as fetchDistinctRelacionamentoLojas,
  deleteAnalyticalRow as deleteRelacionamentoRow,
}
