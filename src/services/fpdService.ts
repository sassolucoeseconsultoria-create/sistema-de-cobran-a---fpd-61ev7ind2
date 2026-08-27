import pb from '@/lib/pocketbase/client'
import type {
  StoreRecord,
  FpdRecord,
  ImportedFileRecord,
  VendorConsolidationRecord,
  ParsedVendorLine,
} from '@/types/fpd'

export async function fetchStores(): Promise<StoreRecord[]> {
  return await pb.collection('stores').getFullList<StoreRecord>({
    sort: 'name',
  })
}

export async function createStore(data: {
  name: string
  coordenacao?: string
  supervisao?: string
}): Promise<StoreRecord> {
  return await pb.collection('stores').create<StoreRecord>({
    name: data.name.trim(),
    coordenacao: data.coordenacao?.trim() || '',
    supervisao: data.supervisao?.trim() || '',
  })
}

export async function updateStore(
  id: string,
  data: Partial<{
    name: string
    coordenacao: string
    supervisao: string
  }>,
): Promise<StoreRecord> {
  return await pb.collection('stores').update<StoreRecord>(id, data)
}

export async function deleteStore(id: string): Promise<boolean> {
  return await pb.collection('stores').delete(id)
}

export async function findStoreByName(name: string): Promise<StoreRecord | null> {
  const normalized = name.trim()
  try {
    const list = await pb.collection('stores').getList<StoreRecord>(1, 1, {
      filter: `name = "${normalized.replace(/"/g, '\\"')}"`,
    })
    return list.items[0] || null
  } catch {
    return null
  }
}

export async function fetchFpdRecords(): Promise<FpdRecord[]> {
  return await pb.collection('fpd_records').getFullList<FpdRecord>({
    sort: '-importado_em,-created',
    expand: 'store',
  })
}

export async function fetchFpdRecordsByStore(storeId: string): Promise<FpdRecord[]> {
  return await pb.collection('fpd_records').getFullList<FpdRecord>({
    filter: `store = "${storeId}"`,
    sort: '-importado_em,-created',
  })
}

const toSafeInt = (val: unknown): number => {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.round(val))
  }
  const parsed = Number(val)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

export async function saveFpdRecord(data: {
  storeId: string
  referente?: string
  total_linhas?: number
  envio_fatura?: number
  pendente?: number
  fatura_paga?: number
  sem_contato?: number
  promessa_pagto?: number
  cancelados?: number
  nao_tratados?: number
  contato_realizado?: number
  outros?: number
}): Promise<FpdRecord> {
  // Check if a record already exists for this store + referente (if referente provided)
  let existingId: string | null = null
  if (data.referente) {
    try {
      const existing = await pb.collection('fpd_records').getList<FpdRecord>(1, 1, {
        filter: `store = "${data.storeId}" && referente = "${data.referente.replace(/"/g, '\\"')}"`,
      })
      if (existing.items.length > 0) {
        existingId = existing.items[0].id
      }
    } catch {
      // ignore
    }
  }

  const payload = {
    store: data.storeId,
    referente: data.referente?.trim() || '',
    total_linhas: toSafeInt(data.total_linhas),
    envio_fatura: toSafeInt(data.envio_fatura),
    pendente: toSafeInt(data.pendente),
    fatura_paga: toSafeInt(data.fatura_paga),
    sem_contato: toSafeInt(data.sem_contato),
    promessa_pagto: toSafeInt(data.promessa_pagto),
    cancelados: toSafeInt(data.cancelados),
    nao_tratados: toSafeInt(data.nao_tratados),
    contato_realizado: toSafeInt(data.contato_realizado),
    outros: toSafeInt(data.outros),
  }

  if (existingId) {
    return await pb.collection('fpd_records').update<FpdRecord>(existingId, payload)
  }
  return await pb.collection('fpd_records').create<FpdRecord>(payload)
}

export async function deleteFpdRecord(id: string): Promise<boolean> {
  return await pb.collection('fpd_records').delete(id)
}

export async function clearAllFpdRecords(): Promise<number> {
  const records = await pb.collection('fpd_records').getFullList<FpdRecord>({
    fields: 'id',
  })

  // Delete in batches of 10 to avoid excessive parallel requests
  const batchSize = 10
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    await Promise.all(batch.map((r) => pb.collection('fpd_records').delete(r.id)))
  }

  return records.length
}

export async function saveImportedFile(data: {
  storeId?: string
  storeName?: string
  fileName: string
  referenceDate?: string
  total_linhas?: number
  enviado_faturas?: number
  envio_fatura?: number
  pendente?: number
  fatura_paga?: number
  sem_contato?: number
  promessa_pagto?: number
  cancelados?: number
  nao_tratados?: number
  contato_realizado?: number
  outros?: number
}): Promise<ImportedFileRecord> {
  const enviadoVal = toSafeInt(
    data.enviado_faturas !== undefined ? data.enviado_faturas : data.envio_fatura,
  )

  const payload = {
    store: data.storeId || null,
    store_name: data.storeName || '',
    file_name: data.fileName,
    reference_date: data.referenceDate?.trim() || '',
    total_linhas: toSafeInt(data.total_linhas),
    enviado_faturas: enviadoVal,
    envio_fatura: enviadoVal,
    pendente: toSafeInt(data.pendente),
    fatura_paga: toSafeInt(data.fatura_paga),
    sem_contato: toSafeInt(data.sem_contato),
    promessa_pagto: toSafeInt(data.promessa_pagto),
    cancelados: toSafeInt(data.cancelados),
    nao_tratados: toSafeInt(data.nao_tratados),
    contato_realizado: toSafeInt(data.contato_realizado),
    outros: toSafeInt(data.outros),
  }

  return await pb.collection('imported_files').create<ImportedFileRecord>(payload)
}

export async function fetchImportedFiles(): Promise<ImportedFileRecord[]> {
  return await pb.collection('imported_files').getFullList<ImportedFileRecord>({
    sort: '-created',
    expand: 'store',
  })
}

export async function getImportedFiles(): Promise<ImportedFileRecord[]> {
  return fetchImportedFiles()
}

export async function deleteImportedFile(id: string): Promise<boolean> {
  return await pb.collection('imported_files').delete(id)
}

export async function clearAllImportedFiles(): Promise<number> {
  const files = await pb.collection('imported_files').getFullList<ImportedFileRecord>({
    fields: 'id',
  })

  const batchSize = 10
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    await Promise.all(batch.map((f) => pb.collection('imported_files').delete(f.id)))
  }

  return files.length
}

export async function fetchVendorConsolidations(): Promise<VendorConsolidationRecord[]> {
  return await pb.collection('vendor_consolidations').getFullList<VendorConsolidationRecord>({
    sort: '-total_linhas,vendedor',
  })
}

export async function clearAllVendorConsolidations(): Promise<number> {
  const records = await pb
    .collection('vendor_consolidations')
    .getFullList<VendorConsolidationRecord>({
      fields: 'id',
    })

  const batchSize = 10
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    await Promise.all(batch.map((r) => pb.collection('vendor_consolidations').delete(r.id)))
  }

  return records.length
}

export async function saveVendorConsolidationsFromLines(
  vendorLines: ParsedVendorLine[],
  referenceDate?: string,
  storesCache?: StoreRecord[],
): Promise<number> {
  if (!vendorLines || vendorLines.length === 0) return 0

  const storesList = storesCache || (await fetchStores())
  const storeMap = new Map<string, StoreRecord>()
  for (const s of storesList) {
    storeMap.set(s.name.trim().toUpperCase(), s)
  }

  // Aggregate by key: `${vendedor.trim().toUpperCase()}__${loja.trim().toUpperCase()}`
  type AggregatedVendor = {
    vendedor: string
    loja: string
    supervisao: string
    data_referencia: string
    total_linhas: number
    fatura_paga: number
    envio_fatura: number
    promessa_pagto: number
    sem_contato: number
    cancelados: number
    pendente: number
    contato_realizado: number
    outros: number
    nao_tratados: number
  }

  const map = new Map<string, AggregatedVendor>()

  for (const line of vendorLines) {
    const rawVendedor = (line.vendedor || '').trim()
    const vendedor = rawVendedor.toUpperCase() || 'NÃO INFORMADO'
    const loja = (line.loja || '').trim().toUpperCase()
    const key = `${vendedor}__${loja}`

    let existing = map.get(key)
    if (!existing) {
      // Find supervision from store
      let supervisao = ''
      if (loja) {
        const matchedStore =
          storeMap.get(loja) ||
          Array.from(storeMap.values()).find(
            (s) =>
              s.name.trim().toUpperCase() === loja ||
              loja.includes(s.name.trim().toUpperCase()) ||
              s.name.trim().toUpperCase().includes(loja),
          )
        if (matchedStore && matchedStore.supervisao) {
          supervisao = matchedStore.supervisao
        }
      }

      existing = {
        vendedor: rawVendedor.toUpperCase() || 'NÃO INFORMADO',
        loja: (line.loja || '').trim().toUpperCase(),
        supervisao,
        data_referencia: referenceDate?.trim() || '',
        total_linhas: 0,
        fatura_paga: 0,
        envio_fatura: 0,
        promessa_pagto: 0,
        sem_contato: 0,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        outros: 0,
        nao_tratados: 0,
      }
      map.set(key, existing)
    }

    const qty = Math.max(0, Math.round(line.quantidade || 1))
    existing.total_linhas += qty
    if (line.status in existing) {
      ;(existing as Record<string, unknown>)[line.status] =
        (((existing as Record<string, unknown>)[line.status] as number) || 0) + qty
    }
  }

  // Now for each aggregated vendor, check if a record with same vendedor + loja (+ referenceDate if present) exists
  const existingRecords = await fetchVendorConsolidations()
  const existingMap = new Map<string, VendorConsolidationRecord>()
  for (const r of existingRecords) {
    const k = `${r.vendedor.trim().toUpperCase()}__${(r.loja || '').trim().toUpperCase()}`
    existingMap.set(k, r)
  }

  let savedCount = 0
  for (const [key, item] of map.entries()) {
    const existing = existingMap.get(key)
    const payload = {
      vendedor: item.vendedor,
      loja: item.loja,
      supervisao: item.supervisao,
      data_referencia: item.data_referencia,
      total_linhas: item.total_linhas,
      fatura_paga: item.fatura_paga,
      envio_fatura: item.envio_fatura,
      promessa_pagto: item.promessa_pagto,
      sem_contato: item.sem_contato,
      cancelados: item.cancelados,
      pendente: item.pendente,
      contato_realizado: item.contato_realizado,
      outros: item.outros,
      nao_tratados: item.nao_tratados,
    }

    if (existing) {
      await pb.collection('vendor_consolidations').update(existing.id, payload)
    } else {
      await pb.collection('vendor_consolidations').create(payload)
    }
    savedCount++
  }

  return savedCount
}

export async function clearAllStores(): Promise<number> {
  // First, remove all FPD records, imported files, and vendor consolidations
  await clearAllFpdRecords()
  await clearAllImportedFiles()
  await clearAllVendorConsolidations()

  const stores = await pb.collection('stores').getFullList<StoreRecord>({
    fields: 'id',
  })

  const batchSize = 10
  for (let i = 0; i < stores.length; i += batchSize) {
    const batch = stores.slice(i, i + batchSize)
    await Promise.all(batch.map((s) => pb.collection('stores').delete(s.id)))
  }

  return stores.length
}
