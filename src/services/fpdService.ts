import pb from '@/lib/pocketbase/client'
import type { StoreRecord, FpdRecord, ImportedFileRecord } from '@/types/fpd'

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

export async function clearAllStores(): Promise<number> {
  // First, remove all FPD records and imported files associated with stores
  await clearAllFpdRecords()
  await clearAllImportedFiles()

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
