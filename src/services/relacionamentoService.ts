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
 * Uses the custom backend endpoint or cached memory, preventing massive record downloads.
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
      // 1. Try dedicated high-performance hook endpoint first
      try {
        const response = await pb.send<{ lojas: string[] }>('/api/custom/relacionamento/lojas', {
          method: 'GET',
          requestKey: null,
        })
        if (response && Array.isArray(response.lojas)) {
          cachedLojas = { data: response.lojas, timestamp: Date.now() }
          return response.lojas
        }
      } catch {
        // Fallback to standard SDK queries if custom endpoint is not reached
      }

      // 2. Fallback: Query first page with max batch to avoid 429
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
 * Insert batch of rows into collection 'movel' using transactional endpoint
 * with fallback to serial SDK chunking to prevent rate limits.
 */
export async function insertMovelBatch(
  rows: Array<{
    arquivo?: string
    linha?: number
    loja?: string
    vendedor?: string
    cliente?: string
    dados?: Record<string, unknown>
  }>,
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  const chunkSize = 200 // Up to 200 rows per transaction hook
  let insertedTotal = 0

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)

    try {
      // Send chunk to high-speed backend hook
      const response = await pb.send<{ success?: boolean; inserted?: number }>(
        '/api/custom/relacionamento/batch',
        {
          method: 'POST',
          body: {
            collection: 'movel',
            rows: chunk,
          },
          requestKey: null,
        },
      )
      insertedTotal += response?.inserted ?? chunk.length
    } catch (err) {
      console.warn(
        'Backend custom batch falhou, usando inserção sequencial segura para evitar 429:',
        err,
      )
      // Safe serial fallback: insert 1 by 1 with pause between requests to strictly prevent 429
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j]
        await pb.collection('movel').create(
          {
            arquivo: item.arquivo?.trim() || '',
            linha: item.linha,
            loja: item.loja?.trim() || '',
            vendedor: item.vendedor?.trim() || '',
            cliente: item.cliente?.trim() || '',
            dados: item.dados || {},
          },
          { requestKey: null },
        )
        insertedTotal++
        if (onProgress && (j + 1) % 5 === 0) {
          onProgress(insertedTotal, rows.length)
        }
        // 120ms pause between individual creates to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }

    if (onProgress) {
      onProgress(insertedTotal, rows.length)
    }
  }

  return insertedTotal
}

/**
 * Insert batch of rows into collection 'residencial' using transactional endpoint
 */
export async function insertResidencialBatch(
  rows: Array<{
    arquivo?: string
    linha?: number
    loja?: string
    vendedor?: string
    cliente?: string
    dados?: Record<string, unknown>
    typedFields?: Record<string, string>
  }>,
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0
  invalidateAnalyticalCache()

  const chunkSize = 200
  let insertedTotal = 0

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)

    try {
      const response = await pb.send<{ success?: boolean; inserted?: number }>(
        '/api/custom/relacionamento/batch',
        {
          method: 'POST',
          body: {
            collection: 'residencial',
            rows: chunk,
          },
          requestKey: null,
        },
      )
      insertedTotal += response?.inserted ?? chunk.length
    } catch (err) {
      console.warn(
        'Backend custom batch falhou, usando inserção sequencial segura para evitar 429:',
        err,
      )
      // Safe serial fallback: insert 1 by 1 with pause between requests to strictly prevent 429
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j]
        await pb.collection('residencial').create(
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
        )
        insertedTotal++
        if (onProgress && (j + 1) % 5 === 0) {
          onProgress(insertedTotal, rows.length)
        }
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }

    if (onProgress) {
      onProgress(insertedTotal, rows.length)
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
 * Uses fast server-side truncate endpoint to prevent hundreds of DELETE requests.
 */
export async function clearAllAnalyticalRows(targetAba?: RelacionamentoAba | 'TODAS'): Promise<{
  movelCount: number
  residencialCount: number
}> {
  invalidateAnalyticalCache()

  // 1. Try high-performance custom hook endpoint first
  try {
    const res = await pb.send<{
      success: boolean
      movelCount: number
      residencialCount: number
    }>('/api/custom/relacionamento/clear', {
      method: 'POST',
      body: {
        target: targetAba || 'TODAS',
      },
      requestKey: null,
    })
    if (res && res.success) {
      return {
        movelCount: res.movelCount || 0,
        residencialCount: res.residencialCount || 0,
      }
    }
  } catch (err) {
    console.warn(
      'Backend custom clear endpoint indisponível ou falhou, iniciando fallback seguro:',
      err,
    )
  }

  // 2. Safe Fallback via SDK: Delete sequentially in small batches with pauses
  // to strictly prevent 429 "Too Many Requests" rate limiter
  let movelCount = 0
  let residencialCount = 0

  const shouldClearMovel = !targetAba || targetAba === 'TODAS' || targetAba === 'Móvel'
  const shouldClearResidencial = !targetAba || targetAba === 'TODAS' || targetAba === 'Residencial'

  if (shouldClearMovel) {
    try {
      while (true) {
        const page = await pb.collection('movel').getList<{ id: string }>(1, 50, {
          fields: 'id',
          requestKey: null,
        })
        if (!page.items || page.items.length === 0) break

        for (const item of page.items) {
          try {
            await pb.collection('movel').delete(item.id, { requestKey: null })
            movelCount++
            // 60ms safe pause between requests to respect rate limit
            await new Promise((resolve) => setTimeout(resolve, 60))
          } catch (delErr: unknown) {
            const status = (delErr as { status?: number })?.status
            if (status === 404) {
              // Already deleted, proceed
              continue
            }
            if (status === 429) {
              // Rate limit encountered: back off for 1.5s then retry once
              await new Promise((resolve) => setTimeout(resolve, 1500))
              await pb.collection('movel').delete(item.id, { requestKey: null })
              movelCount++
            } else {
              throw delErr
            }
          }
        }

        if (page.items.length < 50) break
      }
    } catch (err) {
      console.error('Erro no fallback de limpeza da collection movel:', err)
      throw new Error('Não foi possível limpar a tabela Móvel.')
    }
  }

  if (shouldClearResidencial) {
    try {
      while (true) {
        const page = await pb.collection('residencial').getList<{ id: string }>(1, 50, {
          fields: 'id',
          requestKey: null,
        })
        if (!page.items || page.items.length === 0) break

        for (const item of page.items) {
          try {
            await pb.collection('residencial').delete(item.id, { requestKey: null })
            residencialCount++
            await new Promise((resolve) => setTimeout(resolve, 60))
          } catch (delErr: unknown) {
            const status = (delErr as { status?: number })?.status
            if (status === 404) {
              continue
            }
            if (status === 429) {
              await new Promise((resolve) => setTimeout(resolve, 1500))
              await pb.collection('residencial').delete(item.id, { requestKey: null })
              residencialCount++
            } else {
              throw delErr
            }
          }
        }

        if (page.items.length < 50) break
      }
    } catch (err) {
      console.error('Erro no fallback de limpeza da collection residencial:', err)
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
