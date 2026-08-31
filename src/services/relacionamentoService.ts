import pb from '@/lib/pocketbase/client'
import type { RelacionamentoRecord, RelacionamentoAba } from '@/types/fpd'

export interface FetchRelacionamentoParams {
  page?: number
  perPage?: number
  search?: string
  aba?: RelacionamentoAba | 'TODAS'
  loja?: string
  sort?: string
}

export interface FetchRelacionamentoResult {
  items: RelacionamentoRecord[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

/**
 * Lists rows from the 'relacionamento' collection with filtering and pagination.
 */
export async function fetchRelacionamentoRows(
  params: FetchRelacionamentoParams = {},
): Promise<FetchRelacionamentoResult> {
  const page = params.page || 1
  const perPage = params.perPage || 50
  const filterParts: string[] = []

  if (params.aba && params.aba !== 'TODAS') {
    filterParts.push(`aba = "${params.aba.replace(/"/g, '\\"')}"`)
  }

  if (params.loja && params.loja !== 'TODAS' && params.loja.trim() !== '') {
    filterParts.push(`loja = "${params.loja.replace(/"/g, '\\"')}"`)
  }

  if (params.search && params.search.trim() !== '') {
    const s = params.search.trim().replace(/"/g, '\\"')
    filterParts.push(`(loja ~ "${s}" || arquivo ~ "${s}")`)
  }

  const result = await pb
    .collection('relacionamento')
    .getList<RelacionamentoRecord>(page, perPage, {
      filter: filterParts.length > 0 ? filterParts.join(' && ') : undefined,
      sort: params.sort || '-created',
    })

  return {
    items: result.items,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    page: result.page,
    perPage: result.perPage,
  }
}

/**
 * Fetch distinct store names from the 'relacionamento' collection for filtering.
 */
export async function fetchDistinctRelacionamentoLojas(): Promise<string[]> {
  try {
    const records = await pb.collection('relacionamento').getFullList<RelacionamentoRecord>({
      fields: 'loja',
      sort: 'loja',
    })
    const lojasSet = new Set<string>()
    for (const r of records) {
      if (r.loja && r.loja.trim()) {
        lojasSet.add(r.loja.trim())
      }
    }
    return Array.from(lojasSet).sort((a, b) => a.localeCompare(b))
  } catch (err) {
    console.error('Erro ao buscar lojas de relacionamento:', err)
    return []
  }
}

/**
 * Create a single analítica line record.
 */
export async function createRelacionamentoRow(data: {
  aba: RelacionamentoAba
  loja?: string
  arquivo?: string
  linha?: number
  dados?: Record<string, unknown>
}): Promise<RelacionamentoRecord> {
  return await pb.collection('relacionamento').create<RelacionamentoRecord>({
    aba: data.aba,
    loja: data.loja?.trim() || '',
    arquivo: data.arquivo?.trim() || '',
    linha: data.linha,
    dados: data.dados || {},
  })
}

/**
 * Delete a single analítica line record.
 */
export async function deleteRelacionamentoRow(id: string): Promise<boolean> {
  return await pb.collection('relacionamento').delete(id)
}

/**
 * Clear all records from the 'relacionamento' collection.
 */
export async function clearAllRelacionamentoRows(): Promise<number> {
  const records = await pb.collection('relacionamento').getFullList<RelacionamentoRecord>({
    fields: 'id',
  })

  const batchSize = 20
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    await Promise.all(batch.map((r) => pb.collection('relacionamento').delete(r.id)))
  }

  return records.length
}
