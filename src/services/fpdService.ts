import pb from '@/lib/pocketbase/client'
import type { StoreRecord, FpdRecord } from '@/types/fpd'

export async function fetchStores(): Promise<StoreRecord[]> {
  return await pb.collection('stores').getFullList<StoreRecord>({
    sort: 'name',
  })
}

export async function createStore(data: {
  name: string
  coordenacao?: string
  supervisao?: string
  observacao?: string
}): Promise<StoreRecord> {
  return await pb.collection('stores').create<StoreRecord>({
    name: data.name.trim(),
    coordenacao: data.coordenacao?.trim() || '',
    supervisao: data.supervisao?.trim() || '',
    observacao: data.observacao?.trim() || '',
  })
}

export async function updateStore(
  id: string,
  data: Partial<{
    name: string
    coordenacao: string
    supervisao: string
    observacao: string
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

export async function saveFpdRecord(data: {
  storeId: string
  referente?: string
  total_linhas: number
  envio_fatura: number
  pendente: number
  fatura_paga: number
  envia_fatura: number
  sem_contato: number
  promessa_pagto: number
  cancelados: number
  nao_tratados: number
  contato_realizado?: number
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
    total_linhas: data.total_linhas,
    envio_fatura: data.envio_fatura,
    pendente: data.pendente,
    fatura_paga: data.fatura_paga,
    envia_fatura: data.envia_fatura,
    sem_contato: data.sem_contato,
    promessa_pagto: data.promessa_pagto,
    cancelados: data.cancelados,
    nao_tratados: data.nao_tratados,
    contato_realizado: data.contato_realizado ?? 0,
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
