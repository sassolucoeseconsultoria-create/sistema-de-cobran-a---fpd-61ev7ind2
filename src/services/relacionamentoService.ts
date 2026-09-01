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

/**
 * Lists rows from the 'movel' and 'residencial' collections with filtering and pagination.
 */
export async function fetchAnalyticalRows(
  params: FetchAnalyticalParams = {},
): Promise<FetchAnalyticalResult> {
  const page = params.page || 1
  const perPage = params.perPage || 25
  const selectedAba = params.aba || 'TODAS'

  const filterParts: string[] = []

  if (params.loja && params.loja !== 'TODAS' && params.loja.trim() !== '') {
    filterParts.push(`loja = "${params.loja.replace(/"/g, '\\"')}"`)
  }

  if (params.search && params.search.trim() !== '') {
    const s = params.search.trim().replace(/"/g, '\\"')
    filterParts.push(`(loja ~ "${s}" || arquivo ~ "${s}" || vendedor ~ "${s}" || cliente ~ "${s}")`)
  }

  const filterStr = filterParts.length > 0 ? filterParts.join(' && ') : undefined
  const sortStr = params.sort || '-created'

  if (selectedAba === 'Móvel') {
    const res = await pb.collection('movel').getList<MovelRecord>(page, perPage, {
      filter: filterStr,
      sort: sortStr,
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

  // When 'TODAS': Fetch counts or items from both
  const [resMovel, resResidencial] = await Promise.all([
    pb.collection('movel').getList<MovelRecord>(1, Math.min(perPage, 50), {
      filter: filterStr,
      sort: sortStr,
    }),
    pb.collection('residencial').getList<ResidencialRecord>(1, Math.min(perPage, 50), {
      filter: filterStr,
      sort: sortStr,
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

  const startIndex = (page - 1) * perPage
  const paginatedItems = merged.slice(startIndex, startIndex + perPage)

  return {
    items: paginatedItems,
    totalItems,
    totalPages,
    page,
    perPage,
    totalMovel: resMovel.totalItems,
    totalResidencial: resResidencial.totalItems,
  }
}

/**
 * Fetch distinct store names from both 'movel' and 'residencial' collections for filtering.
 */
export async function fetchDistinctAnalyticalLojas(): Promise<string[]> {
  try {
    const [recordsMovel, recordsResidencial] = await Promise.all([
      pb.collection('movel').getFullList<MovelRecord>({
        fields: 'loja',
        sort: 'loja',
      }),
      pb.collection('residencial').getFullList<ResidencialRecord>({
        fields: 'loja',
        sort: 'loja',
      }),
    ])

    const lojasSet = new Set<string>()
    for (const r of recordsMovel) {
      if (r.loja && r.loja.trim()) lojasSet.add(r.loja.trim())
    }
    for (const r of recordsResidencial) {
      if (r.loja && r.loja.trim()) lojasSet.add(r.loja.trim())
    }

    return Array.from(lojasSet).sort((a, b) => a.localeCompare(b))
  } catch (err) {
    console.error('Erro ao buscar lojas analíticas:', err)
    return []
  }
}

/**
 * Insert batch of rows into collection 'movel'
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
  const batchSize = 25
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    await Promise.all(
      chunk.map((item) =>
        pb.collection('movel').create({
          arquivo: item.arquivo?.trim() || '',
          linha: item.linha,
          loja: item.loja?.trim() || '',
          vendedor: item.vendedor?.trim() || '',
          cliente: item.cliente?.trim() || '',
          dados: item.dados || {},
        }),
      ),
    )
    inserted += chunk.length
    if (onProgress) onProgress(inserted, rows.length)
  }

  return inserted
}

/**
 * Insert batch of rows into collection 'residencial'
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
  const batchSize = 25
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    await Promise.all(
      chunk.map((item) => {
        const payload: Record<string, unknown> = {
          arquivo: item.arquivo?.trim() || '',
          linha: item.linha,
          loja: item.loja?.trim() || '',
          vendedor: item.vendedor?.trim() || '',
          cliente: item.cliente?.trim() || '',
          dados: item.dados || {},
          ...(item.typedFields || {}),
        }
        return pb.collection('residencial').create(payload)
      }),
    )
    inserted += chunk.length
    if (onProgress) onProgress(inserted, rows.length)
  }

  return inserted
}

/**
 * Delete a single record from 'movel' or 'residencial'.
 */
export async function deleteAnalyticalRow(id: string, aba: RelacionamentoAba): Promise<boolean> {
  const collectionName = aba === 'Móvel' ? 'movel' : 'residencial'
  return await pb.collection(collectionName).delete(id)
}

/**
 * Clear all records from both 'movel' and 'residencial' collections (or single aba).
 */
export async function clearAllAnalyticalRows(targetAba?: RelacionamentoAba | 'TODAS'): Promise<{
  movelCount: number
  residencialCount: number
}> {
  let movelCount = 0
  let residencialCount = 0

  if (!targetAba || targetAba === 'TODAS' || targetAba === 'Móvel') {
    const movelRecords = await pb.collection('movel').getFullList<{ id: string }>({
      fields: 'id',
    })
    const batchSize = 30
    for (let i = 0; i < movelRecords.length; i += batchSize) {
      const batch = movelRecords.slice(i, i + batchSize)
      await Promise.all(batch.map((r) => pb.collection('movel').delete(r.id)))
    }
    movelCount = movelRecords.length
  }

  if (!targetAba || targetAba === 'TODAS' || targetAba === 'Residencial') {
    const resRecords = await pb.collection('residencial').getFullList<{ id: string }>({
      fields: 'id',
    })
    const batchSize = 30
    for (let i = 0; i < resRecords.length; i += batchSize) {
      const batch = resRecords.slice(i, i + batchSize)
      await Promise.all(batch.map((r) => pb.collection('residencial').delete(r.id)))
    }
    residencialCount = resRecords.length
  }

  return { movelCount, residencialCount }
}

// Backward compatibility exports for existing codebase referencing relacionamentoService
export {
  fetchAnalyticalRows as fetchRelacionamentoRows,
  fetchDistinctAnalyticalLojas as fetchDistinctRelacionamentoLojas,
  deleteAnalyticalRow as deleteRelacionamentoRow,
}
