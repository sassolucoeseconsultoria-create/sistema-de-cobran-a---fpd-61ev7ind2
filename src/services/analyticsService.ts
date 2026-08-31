import pb from '@/lib/pocketbase/client'
import type { AnalyticLayoutRecord, AnalyticLayoutColumn, AnalyticRowRecord } from '@/types/fpd'

export async function fetchAnalyticLayouts(): Promise<AnalyticLayoutRecord[]> {
  return await pb.collection('analytic_layouts').getFullList<AnalyticLayoutRecord>({
    sort: 'nome',
  })
}

export async function getAnalyticLayoutById(id: string): Promise<AnalyticLayoutRecord> {
  return await pb.collection('analytic_layouts').getOne<AnalyticLayoutRecord>(id)
}

export async function createAnalyticLayout(data: {
  nome: string
  descricao?: string
  colunas: AnalyticLayoutColumn[]
}): Promise<AnalyticLayoutRecord> {
  return await pb.collection('analytic_layouts').create<AnalyticLayoutRecord>({
    nome: data.nome.trim(),
    descricao: data.descricao?.trim() || '',
    colunas: data.colunas || [],
  })
}

export async function updateAnalyticLayout(
  id: string,
  data: Partial<{
    nome: string
    descricao: string
    colunas: AnalyticLayoutColumn[]
  }>,
): Promise<AnalyticLayoutRecord> {
  return await pb.collection('analytic_layouts').update<AnalyticLayoutRecord>(id, data)
}

export async function deleteAnalyticLayout(id: string): Promise<boolean> {
  return await pb.collection('analytic_layouts').delete(id)
}

export async function fetchAnalyticRows(params: {
  layoutId: string
  page?: number
  perPage?: number
  filterOrigem?: string
  filterAba?: string
  search?: string
}): Promise<{
  items: AnalyticRowRecord[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}> {
  const page = params.page || 1
  const perPage = params.perPage || 50

  const filterParts: string[] = [`layout_id = "${params.layoutId}"`]

  if (params.filterOrigem) {
    filterParts.push(`origem = "${params.filterOrigem.replace(/"/g, '\\"')}"`)
  }

  if (params.filterAba && params.filterAba !== 'TODAS') {
    filterParts.push(`aba = "${params.filterAba.replace(/"/g, '\\"')}"`)
  }

  const result = await pb.collection('analytic_rows').getList<AnalyticRowRecord>(page, perPage, {
    filter: filterParts.join(' && '),
    sort: '-created,origem,numero_linha',
  })

  return {
    items: result.items,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    page: result.page,
    perPage: result.perPage,
  }
}

export async function fetchAllAnalyticRowsForExport(params: {
  layoutId: string
  filterOrigem?: string
  filterAba?: string
}): Promise<AnalyticRowRecord[]> {
  const filterParts: string[] = [`layout_id = "${params.layoutId}"`]

  if (params.filterOrigem) {
    filterParts.push(`origem = "${params.filterOrigem.replace(/"/g, '\\"')}"`)
  }

  if (params.filterAba && params.filterAba !== 'TODAS') {
    filterParts.push(`aba = "${params.filterAba.replace(/"/g, '\\"')}"`)
  }

  return await pb.collection('analytic_rows').getFullList<AnalyticRowRecord>({
    filter: filterParts.join(' && '),
    sort: 'origem,aba,numero_linha',
  })
}

export async function fetchAnalyticRowOrigins(layoutId: string): Promise<string[]> {
  // Query rows for this layout to extract unique origins
  const rows = await pb.collection('analytic_rows').getFullList<AnalyticRowRecord>({
    filter: `layout_id = "${layoutId}"`,
    fields: 'origem',
  })

  const originsSet = new Set<string>()
  for (const r of rows) {
    if (r.origem) originsSet.add(r.origem)
  }
  return Array.from(originsSet).sort()
}

export async function deleteAnalyticRowsByOrigin(
  layoutId: string,
  origem: string,
): Promise<number> {
  const rows = await pb.collection('analytic_rows').getFullList<AnalyticRowRecord>({
    filter: `layout_id = "${layoutId}" && origem = "${origem.replace(/"/g, '\\"')}"`,
    fields: 'id',
  })

  const batchSize = 10
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await Promise.all(batch.map((r) => pb.collection('analytic_rows').delete(r.id)))
  }

  return rows.length
}

export async function clearAllAnalyticRowsForLayout(layoutId: string): Promise<number> {
  const rows = await pb.collection('analytic_rows').getFullList<AnalyticRowRecord>({
    filter: `layout_id = "${layoutId}"`,
    fields: 'id',
  })

  const batchSize = 10
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await Promise.all(batch.map((r) => pb.collection('analytic_rows').delete(r.id)))
  }

  return rows.length
}

export async function insertAnalyticRowsBatch(
  rows: Array<{
    layout_id: string
    origem: string
    aba: string
    numero_linha: number
    valores: Record<string, string | number | null>
  }>,
  onProgress?: (inserted: number, total: number) => void,
): Promise<number> {
  if (!rows || rows.length === 0) return 0

  const batchSize = 15
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await Promise.all(
      batch.map((row) =>
        pb.collection('analytic_rows').create({
          layout_id: row.layout_id,
          origem: row.origem,
          aba: row.aba,
          numero_linha: row.numero_linha,
          valores: row.valores,
        }),
      ),
    )
    inserted += batch.length
    if (onProgress) {
      onProgress(inserted, rows.length)
    }
  }

  return inserted
}
