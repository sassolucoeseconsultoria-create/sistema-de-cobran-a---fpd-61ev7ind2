import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeBatchImport } from '@/services/batchImportService'
import type { StoreRecord } from '@/types/fpd'
import { pb } from '@/lib/pocketbase/client'
import { saveFpdRecord, saveVendorConsolidationsFromLines } from '@/services/fpdService'

// Mock pocketbase & services
vi.mock('@/lib/pocketbase/client', () => {
  const mockCollection = vi.fn((_name: string) => ({
    getFullList: vi.fn(),
    getList: vi.fn(async () => ({ items: [], totalPages: 1 })),
    create: vi.fn(async (data: unknown) => ({ id: 'mock-id', ...(data as object) })),
    update: vi.fn(async (id: string, data: unknown) => ({ id, ...(data as object) })),
    delete: vi.fn(async () => true),
  }))
  return {
    pb: {
      collection: mockCollection,
    },
  }
})

vi.mock('@/services/fpdService', () => ({
  matchStore: vi.fn((name: string, stores: StoreRecord[]) => {
    if (!name) return null
    const norm = name.toUpperCase().trim()
    return stores.find((s) => s.name.toUpperCase().trim() === norm) || null
  }),
  saveFpdRecord: vi.fn(async (data: unknown) => ({ id: 'fpd-mock-id', ...(data as object) })),
  saveImportedFile: vi.fn(async () => ({ id: 'file-mock-id' })),
  saveVendorConsolidationsFromLines: vi.fn(async () => 10),
  createStore: vi.fn(async (data: { name: string }) => ({
    id: `store-${Math.random().toString(36).substring(2, 7)}`,
    collectionId: 'stores',
    collectionName: 'stores',
    name: data.name,
    coordenacao: '',
    supervisao: '',
    created: '2026-01-01',
    updated: '2026-01-01',
  })),
  fetchStores: vi.fn(async () => []),
  fetchDistinctReferenceDates: vi.fn(async () => ['08/09/2026']),
}))

vi.mock('@/services/relacionamentoService', () => ({
  insertMovelBatch: vi.fn(async (rows: unknown[]) => rows.length),
  insertResidencialBatch: vi.fn(async (rows: unknown[]) => rows.length),
}))

describe('Reconstrução e Paridade FPD (>30 linhas, paginação completa e consolidação de todas as lojas)', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-loja-a',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'LOJA ALFA',
      coordenacao: 'COORD ALFA',
      supervisao: 'SUPER ALFA',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-loja-b',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'LOJA BETA',
      coordenacao: 'COORD BETA',
      supervisao: 'SUPER BETA',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-loja-c',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'LOJA GAMA',
      coordenacao: 'COORD GAMA',
      supervisao: 'SUPER GAMA',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processa mais de 30 linhas por coleção (ex.: 80 linhas em 3 lojas), garantindo que TODAS as linhas sejam somadas nos fpd_records e no ranking de vendedores', async () => {
    // Cenário:
    // Loja Alfa: 25 linhas Móvel + 15 linhas Residencial = 40 linhas
    // Loja Beta: 20 linhas Móvel + 10 linhas Residencial = 30 linhas
    // Loja Gama: 10 linhas Móvel + 0 linhas Residencial = 10 linhas
    // Total Geral = 80 linhas (> 30 linhas, evitando corte de página padrão de 30)

    const movelRecords = [
      // 25 linhas Alfa
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `m-alfa-${i}`,
        loja: 'LOJA ALFA',
        vendedor: `VENDEDOR A${i % 3}`,
        ocorrencias: i % 2 === 0 ? 'Fatura Paga' : 'Envio de Fatura',
        dados: { Numero: `619910000${i < 10 ? '0' + i : i}` },
        data_referencia: '08/09/2026',
      })),
      // 20 linhas Beta
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `m-beta-${i}`,
        loja: 'LOJA BETA',
        vendedor: `VENDEDOR B${i % 2}`,
        ocorrencias: 'Promessa de Pagto',
        dados: { Numero: `619920000${i < 10 ? '0' + i : i}` },
        data_referencia: '08/09/2026',
      })),
      // 10 linhas Gama
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `m-gama-${i}`,
        loja: 'LOJA GAMA',
        vendedor: 'VENDEDOR G1',
        ocorrencias: 'Sem Contato',
        dados: { Numero: `619930000${i < 10 ? '0' + i : i}` },
        data_referencia: '08/09/2026',
      })),
    ]

    const residencialRecords = [
      // 15 linhas Alfa
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `r-alfa-${i}`,
        loja: 'LOJA ALFA',
        vendedor: `VENDEDOR A${i % 2}`,
        ocorrencias: 'Contato Realizado',
        nr_contrato: `CTR-ALFA-${1000 + i}`,
        dados: { NR_CONTRATO: `CTR-ALFA-${1000 + i}` },
        typedFields: {},
        data_referencia: '08/09/2026',
      })),
      // 10 linhas Beta
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `r-beta-${i}`,
        loja: 'LOJA BETA',
        vendedor: 'VENDEDOR B0',
        ocorrencias: 'Pendente',
        nr_contrato: `CTR-BETA-${2000 + i}`,
        dados: { NR_CONTRATO: `CTR-BETA-${2000 + i}` },
        typedFields: {},
        data_referencia: '08/09/2026',
      })),
    ]

    const getFullListMock = vi.fn().mockImplementation((options?: { filter?: string }) => {
      const filter = options?.filter || ''
      if (filter.includes('movel') || filter.includes('data_referencia = "08/09/2026"')) {
        // Mock getFullList returns all records
        return Promise.resolve(movelRecords)
      }
      return Promise.resolve([])
    })

    const collectionMock = vi.fn().mockImplementation((name: string) => {
      if (name === 'movel') {
        return {
          getFullList: vi.fn(async () => movelRecords),
        }
      }
      if (name === 'residencial') {
        return {
          getFullList: vi.fn(async () => residencialRecords),
        }
      }
      if (name === 'vendor_consolidations') {
        return {
          getFullList: vi.fn(async () => []),
          delete: vi.fn(async () => true),
        }
      }
      return {
        getFullList: getFullListMock,
        delete: vi.fn(async () => true),
      }
    })

    vi.mocked(pb.collection).mockImplementation(collectionMock as unknown as typeof pb.collection)

    const parsedData = {
      fileName: 'IMPORT_MULTI_LOJAS_80_LINHAS.xlsx',
      importType: 'movel' as const,
      targetSheetName: 'Móvel',
      totalValidRows: movelRecords.length,
      totalExpurgadasRows: 0,
      storeSummaries: [
        {
          rawStoreName: 'LOJA ALFA',
          canonicalStoreName: 'LOJA ALFA',
          storeId: 'store-loja-a',
          totalLinhas: 25,
          fatura_paga: 13,
          envio_fatura: 12,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 0,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
          vendorLinesCount: 25,
          analyticalRowsCount: 25,
        },
      ],
      analyticalRows: movelRecords.map((m, idx) => ({
        linha: idx + 2,
        loja: m.loja,
        vendedor: m.vendedor,
        cliente: `Cliente ${idx}`,
        ocorrencias: m.ocorrencias,
        dados: m.dados,
      })),
      vendorLines: [],
    }

    const result = await executeBatchImport(parsedData, '08/09/2026', mockStores)

    // Todas as 3 lojas que possuem dados no banco devem ser consolidadas
    expect(result.storesCount).toBe(3)
    expect(result.totalFpdUpdated).toBe(3)

    // Validar chamadas de saveFpdRecord
    const savedCalls = vi.mocked(saveFpdRecord).mock.calls
    expect(savedCalls.length).toBe(3)

    const alfaCall = savedCalls.find((c) => c[0].storeId === 'store-loja-a')
    const betaCall = savedCalls.find((c) => c[0].storeId === 'store-loja-b')
    const gamaCall = savedCalls.find((c) => c[0].storeId === 'store-loja-c')

    expect(alfaCall).toBeDefined()
    expect(betaCall).toBeDefined()
    expect(gamaCall).toBeDefined()

    // Paridade estrita:
    // Alfa: 25 móvel + 15 residencial = 40
    expect(alfaCall![0].total_linhas).toBe(40)
    // Beta: 20 móvel + 10 residencial = 30
    expect(betaCall![0].total_linhas).toBe(30)
    // Gama: 10 móvel + 0 residencial = 10
    expect(gamaCall![0].total_linhas).toBe(10)

    // Soma total de todos os fpd_records deve ser exatamente 80
    const sumTotalLinhasFpd = savedCalls.reduce((acc, c) => acc + (c[0].total_linhas || 0), 0)
    expect(sumTotalLinhasFpd).toBe(80)

    // Validar que o ranking de vendedores recebeu todas as 80 linhas
    expect(saveVendorConsolidationsFromLines).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ loja: 'LOJA ALFA' }),
        expect.objectContaining({ loja: 'LOJA BETA' }),
        expect.objectContaining({ loja: 'LOJA GAMA' }),
      ]),
      '08/09/2026',
      expect.any(Array),
    )

    const vendorCall = vi.mocked(saveVendorConsolidationsFromLines).mock.calls[0]
    expect(vendorCall[0].length).toBe(80)
  })

  it('deduplica corretamente Móvel e Residencial garantindo paridade soma(fpd_records) = contagem deduplicada', async () => {
    // 5 linhas móvel com duplicatas de número (3 únicos)
    const movelWithDups = [
      {
        id: 'm1',
        loja: 'LOJA ALFA',
        vendedor: 'V1',
        ocorrencias: 'Fatura Paga',
        dados: { Numero: '61999990001' },
      },
      {
        id: 'm2',
        loja: 'LOJA ALFA',
        vendedor: 'V1',
        ocorrencias: 'Fatura Paga',
        dados: { Numero: '61999990001' }, // dupe
      },
      {
        id: 'm3',
        loja: 'LOJA ALFA',
        vendedor: 'V1',
        ocorrencias: 'Fatura Paga',
        dados: { Numero: '61999990002' },
      },
      {
        id: 'm4',
        loja: 'LOJA BETA',
        vendedor: 'V2',
        ocorrencias: 'Envio de Fatura',
        dados: { Numero: '61999990003' },
      },
      {
        id: 'm5',
        loja: 'LOJA BETA',
        vendedor: 'V2',
        ocorrencias: 'Envio de Fatura',
        dados: { Numero: '61999990003' }, // dupe
      },
    ]

    // 4 linhas residencial com duplicatas de contrato (2 únicos)
    const resWithDups = [
      {
        id: 'r1',
        loja: 'LOJA ALFA',
        vendedor: 'V1',
        ocorrencias: 'Promessa de Pagto',
        nr_contrato: 'CTR-001',
        dados: { NR_CONTRATO: 'CTR-001' },
      },
      {
        id: 'r2',
        loja: 'LOJA ALFA',
        vendedor: 'V1',
        ocorrencias: 'Promessa de Pagto',
        nr_contrato: 'CTR-001', // dupe
        dados: { NR_CONTRATO: 'CTR-001' },
      },
      {
        id: 'r3',
        loja: 'LOJA BETA',
        vendedor: 'V2',
        ocorrencias: 'Cancelados',
        nr_contrato: 'CTR-002',
        dados: { NR_CONTRATO: 'CTR-002' },
      },
      {
        id: 'r4',
        loja: 'LOJA BETA',
        vendedor: 'V2',
        ocorrencias: 'Cancelados',
        nr_contrato: 'CTR-002', // dupe
        dados: { NR_CONTRATO: 'CTR-002' },
      },
    ]

    vi.mocked(pb.collection).mockImplementation(((name: string) => {
      if (name === 'movel') return { getFullList: vi.fn(async () => movelWithDups) }
      if (name === 'residencial') return { getFullList: vi.fn(async () => resWithDups) }
      if (name === 'vendor_consolidations') {
        return {
          getFullList: vi.fn(async () => []),
          delete: vi.fn(async () => true),
        }
      }
      return { getFullList: vi.fn(async () => []), delete: vi.fn(async () => true) }
    }) as unknown as typeof pb.collection)

    const parsedData = {
      fileName: 'DEDUP_TEST.xlsx',
      importType: 'movel' as const,
      targetSheetName: 'Móvel',
      totalValidRows: movelWithDups.length,
      totalExpurgadasRows: 0,
      storeSummaries: [],
      analyticalRows: [],
      vendorLines: [],
    }

    await executeBatchImport(parsedData, '08/09/2026', mockStores)

    const savedCalls = vi.mocked(saveFpdRecord).mock.calls
    const sumTotalLinhasFpd = savedCalls.reduce((acc, c) => acc + (c[0].total_linhas || 0), 0)

    // Total deduplicado: 3 móvel + 2 residencial = 5 clientes únicos
    expect(sumTotalLinhasFpd).toBe(5)

    const alfaCall = savedCalls.find((c) => c[0].storeId === 'store-loja-a')
    const betaCall = savedCalls.find((c) => c[0].storeId === 'store-loja-b')

    // Alfa: 2 móvel únicos + 1 residencial único = 3
    expect(alfaCall![0].total_linhas).toBe(3)
    // Beta: 1 móvel único + 1 residencial único = 2
    expect(betaCall![0].total_linhas).toBe(2)
  })
})
