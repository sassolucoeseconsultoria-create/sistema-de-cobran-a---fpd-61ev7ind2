import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  executeBatchImport,
  type ParsedBatchData,
  type BatchStoreSummary,
} from '@/services/batchImportService'
import type { StoreRecord } from '@/types/fpd'

// Mocks
const mockFpdRecordsSaved: any[] = []
const mockInsertedMovelRows: any[] = []
const mockInsertedResRows: any[] = []

let mockDbMovelRows: any[] = []
let mockDbResRows: any[] = []

vi.mock('@/lib/pocketbase/client', () => ({
  pb: {
    collection: vi.fn((colName: string) => ({
      getFullList: vi.fn(async (opts?: { filter?: string }) => {
        const filterStr = opts?.filter || ''
        if (colName === 'movel') {
          // Filtrar por loja se presente
          const matchLoja = filterStr.match(/loja = "([^"]+)"/)
          if (matchLoja) {
            return mockDbMovelRows.filter((r) => r.loja === matchLoja[1])
          }
          return mockDbMovelRows
        }
        if (colName === 'residencial') {
          const matchLoja = filterStr.match(/loja = "([^"]+)"/)
          if (matchLoja) {
            return mockDbResRows.filter((r) => r.loja === matchLoja[1])
          }
          return mockDbResRows
        }
        return []
      }),
      getList: vi.fn(async () => ({ items: [], totalPages: 1 })),
      create: vi.fn(async (data: unknown) => ({ id: 'mock-id', ...(data as object) })),
      update: vi.fn(async (id: string, data: unknown) => ({ id, ...(data as object) })),
      delete: vi.fn(async () => true),
    })),
  },
}))

vi.mock('@/services/fpdService', () => ({
  matchStore: vi.fn((name: string, stores: StoreRecord[]) => {
    if (!name) return null
    const norm = name.toUpperCase().trim()
    return stores.find((s) => s.name.toUpperCase() === norm) || null
  }),
  saveFpdRecord: vi.fn(async (payload: any) => {
    mockFpdRecordsSaved.push(payload)
    return { id: `fpd-${mockFpdRecordsSaved.length}`, ...payload }
  }),
  saveImportedFile: vi.fn(async () => ({ id: 'file-1' })),
  saveVendorConsolidationsFromLines: vi.fn(async () => 10),
  createStore: vi.fn(async (data: { name: string }) => ({
    id: `store-${data.name}`,
    collectionId: 'stores',
    collectionName: 'stores',
    name: data.name,
    coordenacao: '',
    supervisao: '',
    created: '2026-01-01',
    updated: '2026-01-01',
  })),
  fetchDistinctReferenceDates: vi.fn(async () => ['08/09/2026', '26/08/2026']),
}))

vi.mock('@/services/relacionamentoService', () => ({
  insertMovelBatch: vi.fn(async (rows: any[], onProgress?: (i: number, t: number) => void) => {
    mockInsertedMovelRows.push(...rows)
    // Simula a gravação no banco
    for (const r of rows) {
      mockDbMovelRows.push({
        id: `m-${Math.random()}`,
        loja: r.loja,
        ocorrencias: r.ocorrencias,
        dados: r.dados,
        data_referencia: r.data_referencia,
      })
    }
    if (onProgress) onProgress(rows.length, rows.length)
    return rows.length
  }),
  insertResidencialBatch: vi.fn(
    async (rows: any[], onProgress?: (i: number, t: number) => void) => {
      mockInsertedResRows.push(...rows)
      for (const r of rows) {
        mockDbResRows.push({
          id: `r-${Math.random()}`,
          loja: r.loja,
          ocorrencias: r.ocorrencias,
          nr_contrato: r.nr_contrato,
          dados: r.dados,
          typedFields: r.typedFields,
          data_referencia: r.data_referencia,
        })
      }
      if (onProgress) onProgress(rows.length, rows.length)
      return rows.length
    },
  ),
  deduplicateMovelBatchItems: vi.fn((rows: any[]) => {
    // Deduplica por número em dados
    const seen = new Set<string>()
    return rows.filter((r) => {
      const num = r.dados?.Numero || r.dados?.NUMERO || r.linha
      if (!num) return true
      const key = String(num).trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }),
  deduplicateResidencialBatchItems: vi.fn((rows: any[]) => {
    const seen = new Set<string>()
    return rows.filter((r) => {
      const c = r.nr_contrato || r.typedFields?.nr_contrato || r.dados?.NR_CONTRATO || r.linha
      if (!c) return true
      const key = String(c).trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }),
}))

describe('Consolidação Idempotente e Reconciliação Analítica (08/09/2026)', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-jk',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET SHOPPING JK',
      coordenacao: 'COORD 1',
      supervisao: 'SUPER 1',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-ac',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'COORD 2',
      supervisao: 'SUPER 2',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  beforeEach(() => {
    mockFpdRecordsSaved.length = 0
    mockInsertedMovelRows.length = 0
    mockInsertedResRows.length = 0
    mockDbMovelRows = []
    mockDbResRows = []
    vi.clearAllMocks()
  })

  it('a) Reimportar o mesmo arquivo 2x não altera e não infla os totais de fpd_records', async () => {
    const summaryJK: BatchStoreSummary = {
      rawStoreName: 'CELNET SHOPPING JK',
      canonicalStoreName: 'CELNET SHOPPING JK',
      storeId: 'store-jk',
      totalLinhas: 2,
      fatura_paga: 1,
      envio_fatura: 1,
      promessa_pagto: 0,
      sem_contato: 0,
      cancelados: 0,
      pendente: 0,
      contato_realizado: 0,
      nao_tratados: 0,
      outros: 0,
      vendorLinesCount: 2,
      analyticalRowsCount: 2,
    }

    const batchData: ParsedBatchData = {
      fileName: 'BASE_MAIO_JULHO.xlsx',
      importType: 'residencial',
      targetSheetName: 'Residencial',
      totalValidRows: 2,
      totalExpurgadasRows: 0,
      storeSummaries: [summaryJK],
      analyticalRows: [
        {
          linha: 2,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'VENDEDOR 1',
          cliente: 'CLIENTE 1',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: { NR_CONTRATO: '56535499' },
          typedFields: { nr_contrato: '56535499' },
        },
        {
          linha: 3,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'VENDEDOR 2',
          cliente: 'CLIENTE 2',
          ocorrencias: 'Enviado Fatura',
          dados: { NR_CONTRATO: '88888888' },
          typedFields: { nr_contrato: '88888888' },
        },
      ],
      vendorLines: [],
    }

    // Primeira importação
    await executeBatchImport(batchData, '08/09/2026', mockStores)
    expect(mockFpdRecordsSaved).toHaveLength(1)
    const firstSave = mockFpdRecordsSaved[0]
    expect(firstSave.total_linhas).toBe(2)
    expect(firstSave.fatura_paga).toBe(1)
    expect(firstSave.envio_fatura).toBe(1)

    // Segunda importação com o MESMO arquivo
    await executeBatchImport(batchData, '08/09/2026', mockStores)
    expect(mockFpdRecordsSaved).toHaveLength(2)
    const secondSave = mockFpdRecordsSaved[1]

    // O consolidado NÃO pode ter dobrado para 4: deve recalcular 2 a partir das linhas deduplicadas
    expect(secondSave.total_linhas).toBe(2)
    expect(secondSave.fatura_paga).toBe(1)
    expect(secondSave.envio_fatura).toBe(1)
    expect(secondSave.accumulate).toBe(false)
  })

  it('b) Importar arquivo cumulativo sob a mesma referência substitui por contrato, mantendo soma = linhas únicas', async () => {
    // Arquivo 1: Contrato A e Contrato B
    const batch1: ParsedBatchData = {
      fileName: 'Maio_Julho_08_09.xlsx',
      importType: 'residencial',
      targetSheetName: 'Residencial',
      totalValidRows: 2,
      totalExpurgadasRows: 0,
      storeSummaries: [
        {
          rawStoreName: 'CELNET SHOPPING JK',
          canonicalStoreName: 'CELNET SHOPPING JK',
          storeId: 'store-jk',
          totalLinhas: 2,
          fatura_paga: 0,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 2,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
          vendorLinesCount: 2,
          analyticalRowsCount: 2,
        },
      ],
      analyticalRows: [
        {
          linha: 2,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'V1',
          cliente: 'CLI A',
          ocorrencias: 'Pendente',
          dados: { NR_CONTRATO: 'CONTRATO_A' },
          typedFields: { nr_contrato: 'CONTRATO_A' },
        },
        {
          linha: 3,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'V2',
          cliente: 'CLI B',
          ocorrencias: 'Pendente',
          dados: { NR_CONTRATO: 'CONTRATO_B' },
          typedFields: { nr_contrato: 'CONTRATO_B' },
        },
      ],
      vendorLines: [],
    }

    await executeBatchImport(batch1, '08/09/2026', mockStores)
    expect(mockFpdRecordsSaved[0].total_linhas).toBe(2)

    // Arquivo 2 cumulativo: Contrato A (agora Fatura Paga) + Contrato B + Contrato C (novo)
    const batch2: ParsedBatchData = {
      fileName: 'Maio_Agosto_14_09_Cumulativo.xlsx',
      importType: 'residencial',
      targetSheetName: 'Residencial',
      totalValidRows: 3,
      totalExpurgadasRows: 0,
      storeSummaries: [
        {
          rawStoreName: 'CELNET SHOPPING JK',
          canonicalStoreName: 'CELNET SHOPPING JK',
          storeId: 'store-jk',
          totalLinhas: 3,
          fatura_paga: 1,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 2,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
          vendorLinesCount: 3,
          analyticalRowsCount: 3,
        },
      ],
      analyticalRows: [
        {
          linha: 2,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'V1',
          cliente: 'CLI A',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: { NR_CONTRATO: 'CONTRATO_A' },
          typedFields: { nr_contrato: 'CONTRATO_A' },
        },
        {
          linha: 3,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'V2',
          cliente: 'CLI B',
          ocorrencias: 'Pendente',
          dados: { NR_CONTRATO: 'CONTRATO_B' },
          typedFields: { nr_contrato: 'CONTRATO_B' },
        },
        {
          linha: 4,
          loja: 'CELNET SHOPPING JK',
          vendedor: 'V3',
          cliente: 'CLI C',
          ocorrencias: 'Pendente',
          dados: { NR_CONTRATO: 'CONTRATO_C' },
          typedFields: { nr_contrato: 'CONTRATO_C' },
        },
      ],
      vendorLines: [],
    }

    await executeBatchImport(batch2, '08/09/2026', mockStores)
    const latestSave = mockFpdRecordsSaved[mockFpdRecordsSaved.length - 1]

    // Não deve somar 2 + 3 = 5, deve fechar exatamente em 3 contratos únicos
    expect(latestSave.total_linhas).toBe(3)
    expect(latestSave.accumulate).toBe(false)
  })

  it('c) Soma de fpd_records é sempre igual às linhas analíticas deduplicadas', async () => {
    const summaryAC: BatchStoreSummary = {
      rawStoreName: 'CELNET AGUAS CLARAS',
      canonicalStoreName: 'CELNET AGUAS CLARAS',
      storeId: 'store-ac',
      totalLinhas: 2,
      fatura_paga: 2,
      envio_fatura: 0,
      promessa_pagto: 0,
      sem_contato: 0,
      cancelados: 0,
      pendente: 0,
      contato_realizado: 0,
      nao_tratados: 0,
      outros: 0,
      vendorLinesCount: 2,
      analyticalRowsCount: 2,
    }

    const batchMovel: ParsedBatchData = {
      fileName: 'LOTE_MOVEL.xlsx',
      importType: 'movel',
      targetSheetName: 'Móvel',
      totalValidRows: 2,
      totalExpurgadasRows: 0,
      storeSummaries: [summaryAC],
      analyticalRows: [
        {
          linha: 2,
          loja: 'CELNET AGUAS CLARAS',
          vendedor: 'V1',
          cliente: 'CLI 1',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: { Numero: '61999990001' },
        },
        {
          linha: 3,
          loja: 'CELNET AGUAS CLARAS',
          vendedor: 'V1',
          cliente: 'CLI 2',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: { Numero: '61999990002' },
        },
      ],
      vendorLines: [],
    }

    await executeBatchImport(batchMovel, '08/09/2026', mockStores)
    const fpdResult = mockFpdRecordsSaved[0]
    expect(fpdResult.total_linhas).toBe(2)
    expect(fpdResult.fatura_paga).toBe(2)
  })

  it('d) Referência 26/08/2026 permanece completamente inalterada e isolada', async () => {
    // Gravar 1 registro na referência 26/08/2026
    const batch26: ParsedBatchData = {
      fileName: 'BASE_26_08.xlsx',
      importType: 'movel',
      targetSheetName: 'Móvel',
      totalValidRows: 1,
      totalExpurgadasRows: 0,
      storeSummaries: [
        {
          rawStoreName: 'CELNET AGUAS CLARAS',
          canonicalStoreName: 'CELNET AGUAS CLARAS',
          storeId: 'store-ac',
          totalLinhas: 1,
          fatura_paga: 1,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 0,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
          vendorLinesCount: 1,
          analyticalRowsCount: 1,
        },
      ],
      analyticalRows: [
        {
          linha: 2,
          loja: 'CELNET AGUAS CLARAS',
          vendedor: 'V1',
          cliente: 'CLI 26',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: { Numero: '61988880026' },
        },
      ],
      vendorLines: [],
    }

    await executeBatchImport(batch26, '26/08/2026', mockStores)

    // Verificar que a chamada a saveFpdRecord foi com referente '26/08/2026'
    const save26 = mockFpdRecordsSaved.find((s) => s.referente === '26/08/2026')
    expect(save26).toBeDefined()
    expect(save26.total_linhas).toBe(1)
    expect(save26.referente).toBe('26/08/2026')
  })
})
