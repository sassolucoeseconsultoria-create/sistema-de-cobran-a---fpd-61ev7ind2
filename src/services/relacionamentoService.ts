import pb from '@/lib/pocketbase/client'
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

// Delay helper for throttling
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  // Build a unique key for in-flight deduplication
  const cacheKey = JSON.stringify({ page, perPage, selectedAba, loja, search, sortStr })

  const existing = pendingAnalyticalRequests.get(cacheKey)
  if (existing) {
    return existing
  }

  const fetchPromise = (async (): Promise<FetchAnalyticalResult> => {
    const filterParts: string[] = []

    if (loja && loja !== 'TODAS' && loja.trim() !== '') {
      filterParts.push(`loja = "${loja.replace(/"/g, '\\"')}"`)
    }

    if (search) {
      const s = search.replace(/"/g, '\\"')
      filterParts.push(
        `(loja ~ "${s}" || arquivo ~ "${s}" || vendedor ~ "${s}" || cliente ~ "${s}")`,
      )
    }

    const filterStr = filterParts.length > 0 ? filterParts.join(' && ') : undefined

    if (selectedAba === 'Móvel') {
      const res = await pb.collection('movel').getList<MovelRecord>(page, perPage, {
        filter: filterStr,
        sort: sortStr,
        requestKey: null, // Avoid client auto-cancellation conflicts
      })

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
      const res = await pb.collection('residencial').getList<ResidencialRecord>(page, perPage, {
        filter: filterStr,
        sort: sortStr,
        requestKey: null,
      })

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
      pb.collection('movel').getList<MovelRecord>(page, fetchLimit, {
        filter: filterStr,
        sort: sortStr,
        requestKey: null,
      }),
      pb.collection('residencial').getList<ResidencialRecord>(page, fetchLimit, {
        filter: filterStr,
        sort: sortStr,
        requestKey: null,
      }),
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
      // Query first page with max batch to avoid 429
      const [recordsMovel, recordsResidencial] = await Promise.all([
        pb.collection('movel').getList<MovelRecord>(1, 200, {
          fields: 'loja',
          sort: 'loja',
          requestKey: null,
        }),
        pb.collection('residencial').getList<ResidencialRecord>(1, 200, {
          fields: 'loja',
          sort: 'loja',
          requestKey: null,
        }),
      ])

      const lojasSet = new Set<string>()
      for (const r of recordsMovel.items) {
        if (r.loja && r.loja.trim()) lojasSet.add(r.loja.trim())
      }
      for (const r of recordsResidencial.items) {
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
 * Execute a create operation with exponential backoff on 429 errors.
 */
async function createWithRetry<T>(
  action: () => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 500,
): Promise<T> {
  let attempt = 0
  let delay = initialDelayMs

  while (attempt < maxRetries) {
    try {
      return await action()
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 429 && attempt < maxRetries - 1) {
        attempt++
        // Jittered exponential backoff
        const jitter = Math.floor(Math.random() * 200)
        await sleep(delay + jitter)
        delay *= 2
      } else {
        throw err
      }
    }
  }
  return await action()
}

export interface MovelInsertItem {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
}

/**
 * Insert rows into collection 'movel'.
 * Primary: uses custom server batch endpoint (/api/custom/movel/batch) in chunks of 50 for ultra-fast and reliable import.
 * Fallback: sequential individual creations with retry on 429.
 */
export async function insertMovelBatch(
  rows: MovelInsertItem[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  const BATCH_CHUNK_SIZE = 50
  let insertedTotal = 0
  let useBatchEndpoint = true

  // Try custom batch endpoint first
  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE)

    if (useBatchEndpoint) {
      try {
        const response = await pb.send<{ inserted: number; errors: string[] }>(
          '/api/custom/movel/batch',
          {
            method: 'POST',
            body: { items: chunk },
            requestKey: null,
          },
        )

        insertedTotal += response.inserted || chunk.length
        if (onProgress) {
          onProgress(insertedTotal, rows.length)
        }
        continue
      } catch (batchErr: unknown) {
        const status = (batchErr as { status?: number })?.status
        // If 404/405 (endpoint not ready), fall back to individual inserts for remaining items
        if (status === 404 || status === 405) {
          console.warn(
            'Batch endpoint /api/custom/movel/batch unavailable, switching to individual inserts',
          )
          useBatchEndpoint = false
        } else {
          // If the batch endpoint returned a validation error or failure, throw detailed message
          const msg = extractErrorMessage(batchErr)
          throw new Error(msg)
        }
      }
    }

    // Fallback: Individual inserts with concurrency and retry
    const CONCURRENCY = 3
    const accumulatedErrors: string[] = []

    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      const subChunk = chunk.slice(j, j + CONCURRENCY)
      const results = await Promise.all(
        subChunk.map(async (item) => {
          try {
            await createWithRetry(() =>
              pb.collection('movel').create(
                {
                  arquivo: item.arquivo?.trim() || '',
                  linha: item.linha,
                  loja: item.loja?.trim() || '',
                  vendedor: item.vendedor?.trim() || '',
                  cliente: item.cliente?.trim() || '',
                  dados: item.dados || {},
                },
                { requestKey: null },
              ),
            )
            return { success: true, item, error: null }
          } catch (err) {
            return { success: false, item, error: extractErrorMessage(err) }
          }
        }),
      )

      for (const res of results) {
        if (res.success) {
          insertedTotal++
        } else {
          const fileInfo = res.item.arquivo
            ? `arquivo '${res.item.arquivo}'`
            : 'arquivo desconhecido'
          const lineInfo =
            res.item.linha !== undefined && res.item.linha !== null
              ? `, linha ${res.item.linha}`
              : ''
          const errorDetail = res.error ? ` (${res.error})` : ''
          accumulatedErrors.push(`[Móvel] ${fileInfo}${lineInfo}${errorDetail}`)
        }
      }

      if (onProgress) {
        onProgress(insertedTotal, rows.length)
      }

      await sleep(150)
    }

    if (accumulatedErrors.length > 0) {
      const summary =
        accumulatedErrors.length === 1
          ? `Falha ao importar: ${accumulatedErrors[0]}`
          : `Falha ao importar ${accumulatedErrors.length} registro(s):\n• ${accumulatedErrors.slice(0, 5).join('\n• ')}${
              accumulatedErrors.length > 5
                ? `\n... e mais ${accumulatedErrors.length - 5} falha(s).`
                : ''
            }`
      throw new Error(summary)
    }
  }

  return insertedTotal
}

export interface ResidencialInsertItem {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
  typedFields?: Record<string, string>
}

/**
 * Insert rows into collection 'residencial'.
 * Primary: uses custom server batch endpoint (/api/custom/residencial/batch) in chunks of 50 for ultra-fast and reliable import.
 * Fallback: sequential individual creations with retry on 429.
 */
export async function insertResidencialBatch(
  rows: ResidencialInsertItem[],
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  const BATCH_CHUNK_SIZE = 50
  let insertedTotal = 0
  let useBatchEndpoint = true

  // Try custom batch endpoint first
  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE)

    if (useBatchEndpoint) {
      try {
        const response = await pb.send<{ inserted: number; errors: string[] }>(
          '/api/custom/residencial/batch',
          {
            method: 'POST',
            body: { items: chunk },
            requestKey: null,
          },
        )

        insertedTotal += response.inserted || chunk.length
        if (onProgress) {
          onProgress(insertedTotal, rows.length)
        }
        continue
      } catch (batchErr: unknown) {
        const status = (batchErr as { status?: number })?.status
        // If 404/405 (endpoint not ready), fall back to individual inserts for remaining items
        if (status === 404 || status === 405) {
          console.warn(
            'Batch endpoint /api/custom/residencial/batch unavailable, switching to individual inserts',
          )
          useBatchEndpoint = false
        } else {
          // If the batch endpoint returned a validation error or failure, throw detailed message
          const msg = extractErrorMessage(batchErr)
          throw new Error(msg)
        }
      }
    }

    // Fallback: Individual inserts with concurrency and retry
    const CONCURRENCY = 3
    const accumulatedErrors: string[] = []

    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      const subChunk = chunk.slice(j, j + CONCURRENCY)
      const results = await Promise.all(
        subChunk.map(async (item) => {
          try {
            await createWithRetry(() =>
              pb.collection('residencial').create(
                {
                  arquivo: item.arquivo?.trim() || '',
                  linha: item.linha,
                  loja: item.loja?.trim() || '',
                  vendedor: item.vendedor?.trim() || '',
                  cliente: item.cliente?.trim() || '',
                  dados: item.dados || {},
                  ...(item.typedFields || {}),
                },
                { requestKey: null },
              ),
            )
            return { success: true, item, error: null }
          } catch (err) {
            return { success: false, item, error: extractErrorMessage(err) }
          }
        }),
      )

      for (const res of results) {
        if (res.success) {
          insertedTotal++
        } else {
          const fileInfo = res.item.arquivo
            ? `arquivo '${res.item.arquivo}'`
            : 'arquivo desconhecido'
          const lineInfo =
            res.item.linha !== undefined && res.item.linha !== null
              ? `, linha ${res.item.linha}`
              : ''
          const errorDetail = res.error ? ` (${res.error})` : ''
          accumulatedErrors.push(`[Residencial] ${fileInfo}${lineInfo}${errorDetail}`)
        }
      }

      if (onProgress) {
        onProgress(insertedTotal, rows.length)
      }

      await sleep(150)
    }

    if (accumulatedErrors.length > 0) {
      const summary =
        accumulatedErrors.length === 1
          ? `Falha ao importar: ${accumulatedErrors[0]}`
          : `Falha ao importar ${accumulatedErrors.length} registro(s):\n• ${accumulatedErrors.slice(0, 5).join('\n• ')}${
              accumulatedErrors.length > 5
                ? `\n... e mais ${accumulatedErrors.length - 5} falha(s).`
                : ''
            }`
      throw new Error(summary)
    }
  }

  return insertedTotal
}

/**
 * Delete a single record from 'movel' or 'residencial'.
 */
export async function deleteAnalyticalRow(id: string, aba: RelacionamentoAba): Promise<boolean> {
  invalidateAnalyticalCache()
  const collectionName = aba === 'Móvel' ? 'movel' : 'residencial'
  return await pb.collection(collectionName).delete(id, { requestKey: null })
}

/**
 * Clear all records from both 'movel' and 'residencial' collections (or single aba).
 * Primary: uses server endpoint /api/custom/analytical/clear for instant transactional deletion.
 * Fallback: paginated batch deletion.
 */
export async function clearAllAnalyticalRows(targetAba?: RelacionamentoAba | 'TODAS'): Promise<{
  movelCount: number
  residencialCount: number
}> {
  invalidateAnalyticalCache()

  const target = targetAba || 'TODAS'

  // Try custom backend endpoint first
  try {
    const res = await pb.send<{ success: boolean; movelCount: number; residencialCount: number }>(
      '/api/custom/analytical/clear',
      {
        method: 'POST',
        body: { targetAba: target },
        requestKey: null,
      },
    )
    return {
      movelCount: res.movelCount || 0,
      residencialCount: res.residencialCount || 0,
    }
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status !== 404 && status !== 405) {
      console.warn('Clear custom endpoint returned error, proceeding to fallback:', err)
    }
  }

  // Fallback: paginated individual deletes
  let movelCount = 0
  let residencialCount = 0

  const shouldClearMovel = target === 'TODAS' || target === 'Móvel'
  const shouldClearResidencial = target === 'TODAS' || target === 'Residencial'
  const FETCH_PAGE_SIZE = 50
  const CONCURRENCY = 4
  const DELAY_MS = 150

  // 1. Clear Móvel using throttled individual deletes
  if (shouldClearMovel) {
    try {
      while (true) {
        const page = await pb.collection('movel').getList<{ id: string }>(1, FETCH_PAGE_SIZE, {
          fields: 'id',
          requestKey: null,
        })
        if (!page.items || page.items.length === 0) break

        const items = page.items
        for (let i = 0; i < items.length; i += CONCURRENCY) {
          const chunk = items.slice(i, i + CONCURRENCY)
          await Promise.all(
            chunk.map(async (item) => {
              try {
                await pb.collection('movel').delete(item.id, { requestKey: null })
                movelCount++
              } catch (delErr: unknown) {
                const status = (delErr as { status?: number })?.status
                if (status !== 404) {
                  console.error(`Erro ao deletar id ${item.id} de movel:`, delErr)
                }
              }
            }),
          )

          if (i + CONCURRENCY < items.length) {
            await sleep(DELAY_MS)
          }
        }

        await sleep(DELAY_MS)
        if (page.items.length < FETCH_PAGE_SIZE) break
      }
    } catch (err) {
      console.error('Erro na limpeza da tabela móvel:', err)
      throw new Error('Não foi possível limpar a tabela Móvel.')
    }
  }

  // 2. Clear Residencial using throttled individual deletes
  if (shouldClearResidencial) {
    try {
      while (true) {
        const page = await pb
          .collection('residencial')
          .getList<{ id: string }>(1, FETCH_PAGE_SIZE, {
            fields: 'id',
            requestKey: null,
          })
        if (!page.items || page.items.length === 0) break

        const items = page.items
        for (let i = 0; i < items.length; i += CONCURRENCY) {
          const chunk = items.slice(i, i + CONCURRENCY)
          await Promise.all(
            chunk.map(async (item) => {
              try {
                await pb.collection('residencial').delete(item.id, { requestKey: null })
                residencialCount++
              } catch (delErr: unknown) {
                const status = (delErr as { status?: number })?.status
                if (status !== 404) {
                  console.error(`Erro ao deletar id ${item.id} de residencial:`, delErr)
                }
              }
            }),
          )

          if (i + CONCURRENCY < items.length) {
            await sleep(DELAY_MS)
          }
        }

        await sleep(DELAY_MS)
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
