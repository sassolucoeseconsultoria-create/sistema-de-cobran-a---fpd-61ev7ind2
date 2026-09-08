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

export async function findStoreByName(
  name: string,
  storesCache?: StoreRecord[],
): Promise<StoreRecord | null> {
  const storesList = storesCache || (await fetchStores())
  return matchStore(name, storesList)
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

export async function fetchDistinctReferenceDates(): Promise<string[]> {
  try {
    const [files, fpdRecords, vendorRecords, movelRecords, resRecords] = await Promise.all([
      fetchImportedFiles().catch(() => []),
      fetchFpdRecords().catch(() => []),
      fetchVendorConsolidations().catch(() => []),
      pb
        .collection('movel')
        .getFullList<{ data_referencia?: string }>({
          fields: 'data_referencia',
          filter: 'data_referencia != "" && data_referencia != null',
          requestKey: null,
        })
        .catch(() => []),
      pb
        .collection('residencial')
        .getFullList<{ data_referencia?: string }>({
          fields: 'data_referencia',
          filter: 'data_referencia != "" && data_referencia != null',
          requestKey: null,
        })
        .catch(() => []),
    ])

    const set = new Set<string>()

    for (const f of files) {
      if (f.reference_date && f.reference_date.trim() !== '') {
        set.add(f.reference_date.trim())
      } else if (f.data_referencia && f.data_referencia.trim() !== '') {
        set.add(f.data_referencia.trim())
      }
    }

    for (const r of fpdRecords) {
      if (r.referente && r.referente.trim() !== '') {
        set.add(r.referente.trim())
      }
    }

    for (const v of vendorRecords) {
      if (v.data_referencia && v.data_referencia.trim() !== '') {
        set.add(v.data_referencia.trim())
      }
    }

    for (const m of movelRecords) {
      if (m.data_referencia && m.data_referencia.trim() !== '') {
        set.add(m.data_referencia.trim())
      }
    }

    for (const res of resRecords) {
      if (res.data_referencia && res.data_referencia.trim() !== '') {
        set.add(res.data_referencia.trim())
      }
    }

    // Sort descending by parsed date (DD/MM/YYYY) or string
    return Array.from(set).sort((a, b) => {
      const partsA = a.split('/')
      const partsB = b.split('/')
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(
          Number(partsA[2]),
          Number(partsA[1]) - 1,
          Number(partsA[0]),
        ).getTime()
        const dateB = new Date(
          Number(partsB[2]),
          Number(partsB[1]) - 1,
          Number(partsB[0]),
        ).getTime()
        if (!isNaN(dateA) && !isNaN(dateB)) {
          return dateB - dateA
        }
      }
      return b.localeCompare(a)
    })
  } catch {
    return []
  }
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

/**
 * Normalizes text by stripping accents, lowering case, removing punctuation,
 * and collapsing whitespace.
 */
export function normalizeStoreString(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Simplifies a store name token by removing common noise/filler terms
 * and unifying variations like "boullevard" <-> "boulevard", etc.
 */
export function simplifyStoreTokens(str: string): string[] {
  const norm = normalizeStoreString(str)
  if (!norm) return []

  const tokens = norm
    .split(' ')
    .map((t) => {
      // Unify known typos / variations
      if (t === 'boullevard' || t === 'boulevard') return 'boulevard'
      if (t === 'shopping') return '' // strip shopping for fuzzy token comparisons
      if (t === 'goiania' || t === 'gyn') return '' // strip goiania / city name variations
      return t
    })
    .filter((t) => t.length > 0)

  return tokens
}

/**
 * Robust store matcher that handles:
 * 1. Accents removal
 * 2. Case insensitivity
 * 3. Permutations / extra keywords like "SHOPPING", "GOIANIA", "BOULLEVARD"/"BOULEVARD", "JK SHOPPING" / "SHOPPING JK"
 */
export function matchStore(inputStoreName: string, storesList: StoreRecord[]): StoreRecord | null {
  if (!inputStoreName || !storesList || storesList.length === 0) return null

  const inputNorm = normalizeStoreString(inputStoreName)
  if (!inputNorm) return null

  // Pass 1: Exact normalized match
  for (const s of storesList) {
    if (normalizeStoreString(s.name) === inputNorm) {
      return s
    }
  }

  // Pass 2: Normalized contains (one contains the other)
  for (const s of storesList) {
    const sNorm = normalizeStoreString(s.name)
    if (inputNorm.includes(sNorm) || sNorm.includes(inputNorm)) {
      return s
    }
  }

  // Pass 3: Match with noise stripped ("shopping", "goiania", "celnet", "boullevard" -> "boulevard")
  const inputSimplified = normalizeStoreString(
    inputNorm
      .replace(/\bboullevard\b/g, 'boulevard')
      .replace(/\bshopping\b/g, '')
      .replace(/\bgoiania\b/g, '')
      .replace(/\bcelnet\b/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )

  if (inputSimplified.length >= 2) {
    for (const s of storesList) {
      const sSimplified = normalizeStoreString(
        normalizeStoreString(s.name)
          .replace(/\bboullevard\b/g, 'boulevard')
          .replace(/\bshopping\b/g, '')
          .replace(/\bgoiania\b/g, '')
          .replace(/\bcelnet\b/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )

      if (sSimplified === inputSimplified) {
        return s
      }
      if (
        sSimplified.length >= 3 &&
        (inputSimplified.includes(sSimplified) || sSimplified.includes(inputSimplified))
      ) {
        return s
      }
    }
  }

  // Pass 4: Token-set overlap (e.g. "CELNET SHOPPING JK" tokens ["celnet", "jk"] vs "CELNET JK SHOPPING" ["celnet", "jk"])
  const inputTokens = simplifyStoreTokens(inputStoreName)
  if (inputTokens.length > 0) {
    let bestMatch: StoreRecord | null = null
    let bestScore = 0

    for (const s of storesList) {
      const sTokens = simplifyStoreTokens(s.name)
      if (sTokens.length === 0) continue

      // Count intersection
      const intersection = inputTokens.filter((t) => sTokens.includes(t))
      const score = (intersection.length * 2) / (inputTokens.length + sTokens.length)

      // If all meaningful tokens in the smaller set match the larger set
      const allInputInStore = inputTokens.every((t) => sTokens.includes(t))
      const allStoreInInput = sTokens.every((t) => inputTokens.includes(t))

      if ((allInputInStore || allStoreInInput) && intersection.length >= 1) {
        if (score > bestScore) {
          bestScore = score
          bestMatch = s
        }
      } else if (score > bestScore && score >= 0.5) {
        bestScore = score
        bestMatch = s
      }
    }

    if (bestMatch) {
      return bestMatch
    }
  }

  return null
}

export async function saveVendorConsolidationsFromLines(
  vendorLines: ParsedVendorLine[],
  referenceDate?: string,
  storesCache?: StoreRecord[],
): Promise<number> {
  if (!vendorLines || vendorLines.length === 0) return 0

  const storesList = storesCache || (await fetchStores())

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
    const rawLoja = (line.loja || '').trim()

    // 4. Remover linha dummy de cabeçalho da planilha (vendedor = "VENDEDOR" e loja = "LOJA")
    const normVendedor = normalizeStoreString(rawVendedor)
    const normLoja = normalizeStoreString(rawLoja)
    if (
      (normVendedor === 'vendedor' && normLoja === 'loja') ||
      (normVendedor === 'vendedor' && !rawLoja) ||
      (normVendedor === 'vendedor' && normLoja === 'vendedor')
    ) {
      console.log('[saveVendorConsolidationsFromLines] Descartando linha de cabeçalho dummy:', {
        vendedor: rawVendedor,
        loja: rawLoja,
      })
      continue
    }

    const vendedor = rawVendedor.toUpperCase() || 'NÃO INFORMADO'
    const loja = rawLoja.toUpperCase()
    const key = `${vendedor}__${loja}`

    let existing = map.get(key)
    if (!existing) {
      // Find supervision from store using fuzzy normalized matching
      let supervisao = ''
      if (rawLoja) {
        const matchedStore = matchStore(rawLoja, storesList)
        if (matchedStore) {
          supervisao = matchedStore.supervisao || ''
          console.log(
            `[saveVendorConsolidationsFromLines] Matched Loja "${rawLoja}" -> Cadastrada: "${matchedStore.name}", Supervisão: "${supervisao || 'SEM SUPERVISÃO'}"`,
          )
        } else {
          console.warn(
            `[saveVendorConsolidationsFromLines] Loja não encontrada no cadastro para "${rawLoja}". Supervisão ficará vazia.`,
          )
        }
      }

      existing = {
        vendedor: rawVendedor.toUpperCase() || 'NÃO INFORMADO',
        loja: rawLoja.toUpperCase(),
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

  // Now for each aggregated vendor, check if a record with same vendedor + loja + data_referencia exists
  const existingRecords = await fetchVendorConsolidations()
  const existingMap = new Map<string, VendorConsolidationRecord>()
  for (const r of existingRecords) {
    const k = `${r.vendedor.trim().toUpperCase()}__${(r.loja || '').trim().toUpperCase()}__${(r.data_referencia || '').trim()}`
    existingMap.set(k, r)
  }

  let savedCount = 0
  for (const [, item] of map.entries()) {
    const matchKey = `${item.vendedor.trim().toUpperCase()}__${item.loja.trim().toUpperCase()}__${(item.data_referencia || '').trim()}`
    const existing = existingMap.get(matchKey)
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
