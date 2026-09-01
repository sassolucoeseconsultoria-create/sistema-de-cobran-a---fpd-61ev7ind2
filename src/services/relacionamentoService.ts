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
 * Helper to inspect batch send response items and format error details with file and row info.
 */
function extractBatchErrors<T extends { arquivo?: string; linha?: number }>(
  batchResponse: unknown,
  chunk: T[],
  collectionName: 'Móvel' | 'Residencial',
): string[] {
  const errors: string[] = []
  if (Array.isArray(batchResponse)) {
    batchResponse.forEach((item, idx) => {
      if (!item) return
      // Check if item indicates error (status >= 400 or code >= 400 or has error field)
      const status = Number(item.status || item.code || 0)
      const isError = status >= 400 || item.error || item.message
      if (isError) {
        const row = chunk[idx]
        const fileInfo = row?.arquivo ? `arquivo '${row.arquivo}'` : `arquivo desconhecido`
        const lineInfo =
          row?.linha !== undefined && row?.linha !== null ? `, linha ${row.linha}` : ''
        const errorDetail =
          typeof item.message === 'string'
            ? `: ${item.message}`
            : item.data && typeof item.data === 'object'
              ? `: ${JSON.stringify(item.data)}`
              : ''
        errors.push(`[${collectionName}] ${fileInfo}${lineInfo}${errorDetail}`)
      }
    })
  }
  return errors
}

/**
 * Insert batch of rows into collection 'movel' using native PocketBase createBatch.
 * Chunks into max 50 rows per batch HTTP request (1 request per 50 rows).
 * Accurately tracks and reports any failed rows by file name and line number.
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

  const CHUNK_SIZE = 50 // Native PocketBase /api/batch max chunk size
  let insertedTotal = 0
  const accumulatedErrors: string[] = []

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const batch = pb.createBatch()

    for (const item of chunk) {
      batch.collection('movel').create({
        arquivo: item.arquivo?.trim() || '',
        linha: item.linha,
        loja: item.loja?.trim() || '',
        vendedor: item.vendedor?.trim() || '',
        cliente: item.cliente?.trim() || '',
        dados: item.dados || {},
      })
    }

    try {
      const results = await batch.send()
      const chunkErrors = extractBatchErrors(results, chunk, 'Móvel')
      if (chunkErrors.length > 0) {
        accumulatedErrors.push(...chunkErrors)
      } else {
        insertedTotal += chunk.length
      }
    } catch (err: unknown) {
      // If batch.send() itself threw an error (e.g. batch validation failure or network)
      const errObj = err as { status?: number; message?: string; response?: { data?: unknown } }
      const firstRow = chunk[0]
      const fileInfo = firstRow?.arquivo ? `arquivo '${firstRow.arquivo}'` : 'arquivo'
      const lineRange =
        chunk.length === 1
          ? `linha ${firstRow?.linha ?? 1}`
          : `linhas ${chunk[0]?.linha ?? 1} a ${chunk[chunk.length - 1]?.linha ?? chunk.length}`
      const detail = errObj?.message ? ` (${errObj.message})` : ''
      accumulatedErrors.push(`[Móvel] Falha no lote: ${fileInfo}, ${lineRange}${detail}`)
    }

    if (onProgress) {
      onProgress(insertedTotal, rows.length)
    }
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

  return insertedTotal
}

/**
 * Insert batch of rows into collection 'residencial' using native PocketBase createBatch.
 * Chunks into max 50 rows per batch HTTP request (1 request per 50 rows).
 * Accurately tracks and reports any failed rows by file name and line number.
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

  const CHUNK_SIZE = 50
  let insertedTotal = 0
  const accumulatedErrors: string[] = []

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const batch = pb.createBatch()

    for (const item of chunk) {
      batch.collection('residencial').create({
        arquivo: item.arquivo?.trim() || '',
        linha: item.linha,
        loja: item.loja?.trim() || '',
        vendedor: item.vendedor?.trim() || '',
        cliente: item.cliente?.trim() || '',
        dados: item.dados || {},
        ...(item.typedFields || {}),
      })
    }

    try {
      const results = await batch.send()
      const chunkErrors = extractBatchErrors(results, chunk, 'Residencial')
      if (chunkErrors.length > 0) {
        accumulatedErrors.push(...chunkErrors)
      } else {
        insertedTotal += chunk.length
      }
    } catch (err: unknown) {
      const errObj = err as { status?: number; message?: string; response?: { data?: unknown } }
      const firstRow = chunk[0]
      const fileInfo = firstRow?.arquivo ? `arquivo '${firstRow.arquivo}'` : 'arquivo'
      const lineRange =
        chunk.length === 1
          ? `linha ${firstRow?.linha ?? 1}`
          : `linhas ${chunk[0]?.linha ?? 1} a ${chunk[chunk.length - 1]?.linha ?? chunk.length}`
      const detail = errObj?.message ? ` (${errObj.message})` : ''
      accumulatedErrors.push(`[Residencial] Falha no lote: ${fileInfo}, ${lineRange}${detail}`)
    }

    if (onProgress) {
      onProgress(insertedTotal, rows.length)
    }
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
 * Uses native PocketBase createBatch to delete in chunks of 50 IDs per single HTTP request.
 */
export async function clearAllAnalyticalRows(targetAba?: RelacionamentoAba | 'TODAS'): Promise<{
  movelCount: number
  residencialCount: number
}> {
  invalidateAnalyticalCache()

  let movelCount = 0
  let residencialCount = 0

  const shouldClearMovel = !targetAba || targetAba === 'TODAS' || targetAba === 'Móvel'
  const shouldClearResidencial = !targetAba || targetAba === 'TODAS' || targetAba === 'Residencial'
  const BATCH_DELETE_CHUNK = 50

  // 1. Clear Móvel using native batch deletes
  if (shouldClearMovel) {
    try {
      while (true) {
        const page = await pb.collection('movel').getList<{ id: string }>(1, BATCH_DELETE_CHUNK, {
          fields: 'id',
          requestKey: null,
        })
        if (!page.items || page.items.length === 0) break

        const batch = pb.createBatch()
        for (const item of page.items) {
          batch.collection('movel').delete(item.id)
        }

        try {
          await batch.send()
          movelCount += page.items.length
        } catch (batchErr) {
          console.warn('Erro ao deletar lote em Móvel, tentando individualmente:', batchErr)
          for (const item of page.items) {
            try {
              await pb.collection('movel').delete(item.id, { requestKey: null })
              movelCount++
            } catch (delErr: unknown) {
              const status = (delErr as { status?: number })?.status
              if (status !== 404) {
                console.error(`Erro ao deletar id ${item.id} de movel:`, delErr)
              }
            }
          }
        }

        if (page.items.length < BATCH_DELETE_CHUNK) break
      }
    } catch (err) {
      console.error('Erro na limpeza da tabela móvel:', err)
      throw new Error('Não foi possível limpar a tabela Móvel.')
    }
  }

  // 2. Clear Residencial using native batch deletes
  if (shouldClearResidencial) {
    try {
      while (true) {
        const page = await pb
          .collection('residencial')
          .getList<{ id: string }>(1, BATCH_DELETE_CHUNK, {
            fields: 'id',
            requestKey: null,
          })
        if (!page.items || page.items.length === 0) break

        const batch = pb.createBatch()
        for (const item of page.items) {
          batch.collection('residencial').delete(item.id)
        }

        try {
          await batch.send()
          residencialCount += page.items.length
        } catch (batchErr) {
          console.warn('Erro ao deletar lote em Residencial, tentando individualmente:', batchErr)
          for (const item of page.items) {
            try {
              await pb.collection('residencial').delete(item.id, { requestKey: null })
              residencialCount++
            } catch (delErr: unknown) {
              const status = (delErr as { status?: number })?.status
              if (status !== 404) {
                console.error(`Erro ao deletar id ${item.id} de residencial:`, delErr)
              }
            }
          }
        }

        if (page.items.length < BATCH_DELETE_CHUNK) break
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
