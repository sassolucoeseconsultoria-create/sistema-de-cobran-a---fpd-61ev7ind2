import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseBatchXlsxFile,
  findBatchSheetName,
  executeBatchImport,
  type BatchStoreSummary,
} from './batchImportService'
import type { StoreRecord } from '@/types/fpd'

// Mock pocketbase & services called by executeBatchImport
vi.mock('@/services/fpdService', () => ({
  matchStore: vi.fn((name: string, stores: StoreRecord[]) => {
    if (!name) return null
    const norm = name.toUpperCase().trim()
    if (norm.includes('AGUAS CLARA')) {
      return stores.find((s) => s.name.toUpperCase().includes('AGUAS CLARAS')) || null
    }
    if (norm.includes('PARK SHOPPING')) {
      return stores.find((s) => s.name.toUpperCase().includes('PARK SHOPPING')) || null
    }
    if (norm.includes('PLANALTINA')) {
      return stores.find((s) => s.name.toUpperCase().includes('PLANALTINA')) || null
    }
    return stores.find((s) => s.name.toUpperCase() === norm) || null
  }),
  saveFpdRecord: vi.fn(async () => ({ id: 'fpd-1' })),
  saveImportedFile: vi.fn(async () => ({ id: 'file-1' })),
  saveVendorConsolidationsFromLines: vi.fn(async () => 5),
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
  fetchDistinctReferenceDates: vi.fn(async () => ['26/08/2026']),
}))

vi.mock('@/services/relacionamentoService', () => ({
  insertMovelBatch: vi.fn(async (rows: unknown[], onProgress?: (i: number, t: number) => void) => {
    if (onProgress) onProgress(rows.length, rows.length)
    return rows.length
  }),
  insertResidencialBatch: vi.fn(
    async (rows: unknown[], onProgress?: (i: number, t: number) => void) => {
      if (onProgress) onProgress(rows.length, rows.length)
      return rows.length
    },
  ),
}))

describe('batchImportService', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-ac',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'COORD 1',
      supervisao: 'SUPER 1',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-ps',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET PARK SHOPPING',
      coordenacao: 'COORD 2',
      supervisao: 'SUPER 2',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-pl',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET PLANALTINA DF',
      coordenacao: 'COORD 1',
      supervisao: 'SUPER 3',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  describe('findBatchSheetName', () => {
    it('detects sheet named Móvel or Celular for movel type', () => {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['test']]), 'Resumo')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['test']]), 'Aba Móvel 2026')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['test']]), 'Residencial')

      expect(findBatchSheetName(wb, 'movel')).toBe('Aba Móvel 2026')
      expect(findBatchSheetName(wb, 'residencial')).toBe('Residencial')
    })

    it('falls back to single sheet if only one sheet exists', () => {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['test']]), 'Dados Consolidados')

      expect(findBatchSheetName(wb, 'movel')).toBe('Dados Consolidados')
      expect(findBatchSheetName(wb, 'residencial')).toBe('Dados Consolidados')
    })
  })

  describe('parseBatchXlsxFile - Multi-Loja Móvel', () => {
    it('correctly parses multi-store Móvel sheet, groups by canonical store, extracts vendors, and purges empty occurrences', async () => {
      // Columns: LOJA, VENDEDOR, CLIENTE, CPF, OCORRÊNCIAS
      const header = ['LOJA', 'VENDEDOR', 'CLIENTE', 'CPF', 'OCORRÊNCIAS']
      const rows = [
        // Store 1: AGUAS CLARA (variant of AGUAS CLARAS)
        ['CELNET AGUAS CLARA', 'JOÃO SILVA', 'CLIENTE 1', '111.111.111-11', 'FATURA PAGA'],
        ['CELNET AGUAS CLARA', 'JOÃO SILVA', 'CLIENTE 2', '222.222.222-22', 'ENVIADO FATURA'],
        ['CELNET AGUAS CLARAS', 'MARIA SOUZA', 'CLIENTE 3', '333.333.333-33', 'PROMESSA DE PAGTO.'],
        ['CELNET AGUAS CLARA', 'MARIA SOUZA', 'CLIENTE 4', '444.444.444-44', ''], // EMPTY -> PURGED
        // Store 2: PARK SHOPPING
        ['CELNET PARK SHOPPING', 'CARLOS LIMA', 'CLIENTE 5', '555.555.555-55', 'SEM CONTATO'],
        ['CELNET PARK SHOPPING', 'CARLOS LIMA', 'CLIENTE 6', '666.666.666-66', 'CANCELADO'],
        ['CELNET PARK SHOPPING', 'ANA COSTA', 'CLIENTE 7', '777.777.777-77', '   '], // WHITESPACE -> PURGED
        // Store 3: NOVA LOJA NÃO CADASTRADA
        ['CELNET NOVA LOJA', 'PEDRO SANTOS', 'CLIENTE 8', '888.888.888-88', 'PENDENTE'],
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Móvel')

      const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([u8], 'BASE_GERAL_MOVEL_TODAS_LOJAS.xlsx')

      const parsed = await parseBatchXlsxFile(file, 'movel', mockStores)

      expect(parsed.fileName).toBe('BASE_GERAL_MOVEL_TODAS_LOJAS.xlsx')
      expect(parsed.importType).toBe('movel')
      expect(parsed.targetSheetName).toBe('Móvel')
      expect(parsed.totalValidRows).toBe(6) // 8 total - 2 empty/whitespace = 6 valid
      expect(parsed.totalExpurgadasRows).toBe(2)

      // Check store breakdown
      expect(parsed.storeSummaries.length).toBe(3)

      const aguasClarasSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET AGUAS CLARAS',
      )
      expect(aguasClarasSummary).toBeDefined()
      expect(aguasClarasSummary?.storeId).toBe('store-ac')
      expect(aguasClarasSummary?.totalLinhas).toBe(3)
      expect(aguasClarasSummary?.fatura_paga).toBe(1)
      expect(aguasClarasSummary?.envio_fatura).toBe(1)
      expect(aguasClarasSummary?.promessa_pagto).toBe(1)

      const parkShoppingSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET PARK SHOPPING',
      )
      expect(parkShoppingSummary).toBeDefined()
      expect(parkShoppingSummary?.totalLinhas).toBe(2)
      expect(parkShoppingSummary?.sem_contato).toBe(1)
      expect(parkShoppingSummary?.cancelados).toBe(1)

      const novaLojaSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET NOVA LOJA',
      )
      expect(novaLojaSummary).toBeDefined()
      expect(novaLojaSummary?.totalLinhas).toBe(1)
      expect(novaLojaSummary?.pendente).toBe(1)

      // Check vendor lines
      expect(parsed.vendorLines).toHaveLength(6)
      expect(parsed.vendorLines[0].loja).toBe('CELNET AGUAS CLARAS')
      expect(parsed.vendorLines[0].vendedor).toBe('JOÃO SILVA')
      expect(parsed.vendorLines[0].status).toBe('fatura_paga')

      // Check analytical rows (must also exclude the 2 purged rows)
      expect(parsed.analyticalRows).toHaveLength(6)
    })
  })

  describe('parseBatchXlsxFile - Multi-Loja Residencial', () => {
    it('correctly parses multi-store Residencial sheet with standard columns and custom typed fields', async () => {
      // Header for Residencial
      const header = [
        'CANAL',
        'CLIENTE',
        'CPF',
        'FONE',
        'FATURA',
        'OCORRÊNCIAS',
        'LOJA',
        'VENDEDOR',
      ]
      const rows = [
        [
          'Agente Autorizado',
          'RESIDENCIAL CLIENTE 1',
          '11122233344',
          '61999998888',
          'Em Aberto',
          'FATURA PAGA',
          'CELNET PLANALTINA DF',
          'ROBERTO CARLOS',
        ],
        [
          'Agente Autorizado',
          'RESIDENCIAL CLIENTE 2',
          '55566677788',
          '61988887777',
          'Em Aberto',
          'CONTATO REALIZADO',
          'CELNET AGUAS CLARA',
          'LUCIA HELENA',
        ],
        [
          'Agente Autorizado',
          'RESIDENCIAL CLIENTE 3',
          '99988877766',
          '61977776666',
          'Em Aberto',
          '', // Empty -> purged
          'CELNET AGUAS CLARA',
          'LUCIA HELENA',
        ],
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Residencial')

      const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([u8], 'BASE_GERAL_RESIDENCIAL.xlsx')

      const parsed = await parseBatchXlsxFile(file, 'residencial', mockStores)

      expect(parsed.importType).toBe('residencial')
      expect(parsed.totalValidRows).toBe(2)
      expect(parsed.totalExpurgadasRows).toBe(1)
      expect(parsed.storeSummaries.length).toBe(2)

      const planaltina = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET PLANALTINA DF',
      )
      expect(planaltina).toBeDefined()
      expect(planaltina?.fatura_paga).toBe(1)
      expect(planaltina?.totalLinhas).toBe(1)

      const aguasClaras = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET AGUAS CLARAS',
      )
      expect(aguasClaras).toBeDefined()
      expect(aguasClaras?.contato_realizado).toBe(1)
      expect(aguasClaras?.totalLinhas).toBe(1)
    })

    it('correctly parses Residencial sheet when status is in INDICADOR or PREVENTIVA FPD instead of OCORRENCIAS', async () => {
      const header = ['LOJA', 'CLIENTE', 'INDICADOR', 'VENDEDOR']
      const rows = [
        ['CELNET PLANALTINA DF', 'CLIENTE 1', 'Fatura Paga', 'VENDEDOR 1'],
        ['CELNET AGUAS CLARA', 'CLIENTE 2', 'Enviado Fatura', 'VENDEDOR 2'],
        ['CELNET AGUAS CLARA', 'CLIENTE 3', '', 'VENDEDOR 3'], // empty -> expurgada
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Residencial')

      const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([u8], 'BASE_PREVENTIVA_INDICADOR.xlsx')

      const parsed = await parseBatchXlsxFile(file, 'residencial', mockStores)

      expect(parsed.totalValidRows).toBe(2)
      expect(parsed.totalExpurgadasRows).toBe(1)

      const planaltina = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET PLANALTINA DF',
      )
      expect(planaltina?.fatura_paga).toBe(1)
      expect(planaltina?.totalLinhas).toBe(1)

      const aguasClaras = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET AGUAS CLARAS',
      )
      expect(aguasClaras?.envio_fatura).toBe(1)
      expect(aguasClaras?.totalLinhas).toBe(1)
    })
  })

  describe('executeBatchImport', () => {
    it('executes full batch workflow for Móvel: creates missing stores, saves imported_files, updates fpd_records, updates vendor_consolidations and inserts movel rows', async () => {
      const summaryStore1: BatchStoreSummary = {
        rawStoreName: 'CELNET AGUAS CLARA',
        canonicalStoreName: 'CELNET AGUAS CLARAS',
        storeId: 'store-ac',
        totalLinhas: 10,
        fatura_paga: 7,
        envio_fatura: 2,
        promessa_pagto: 1,
        sem_contato: 0,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
        vendorLinesCount: 10,
        analyticalRowsCount: 10,
      }

      const summaryStore2: BatchStoreSummary = {
        rawStoreName: 'CELNET NOVA LOJA',
        canonicalStoreName: 'CELNET NOVA LOJA',
        storeId: undefined, // will be created
        totalLinhas: 5,
        fatura_paga: 3,
        envio_fatura: 1,
        promessa_pagto: 0,
        sem_contato: 1,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
        vendorLinesCount: 5,
        analyticalRowsCount: 5,
      }

      const parsedData = {
        fileName: 'LOTE_MOVEL.xlsx',
        importType: 'movel' as const,
        targetSheetName: 'Móvel',
        totalValidRows: 15,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryStore1, summaryStore2],
        analyticalRows: [
          {
            linha: 2,
            loja: 'CELNET AGUAS CLARA',
            vendedor: 'VENDEDOR 1',
            cliente: 'CLIENTE 1',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
          },
        ],
        vendorLines: [
          {
            loja: 'CELNET AGUAS CLARAS',
            vendedor: 'VENDEDOR 1',
            status: 'fatura_paga' as const,
            quantidade: 1,
          },
        ],
      }

      const onProgress = vi.fn()
      const result = await executeBatchImport(parsedData, '20/08/2026', mockStores, onProgress)

      expect(result.storesCount).toBe(2)
      expect(result.totalFpdUpdated).toBe(2)
      expect(result.totalVendorSaved).toBe(5)
      expect(result.totalAnalyticalInserted).toBe(1)
      expect(onProgress).toHaveBeenCalled()
    })

    it('propagates the specified reference date (not today) to analytical items, imported_files, fpd_records and vendor consolidations', async () => {
      const { saveImportedFile, saveFpdRecord, saveVendorConsolidationsFromLines } =
        await import('@/services/fpdService')
      const { insertMovelBatch, insertResidencialBatch } =
        await import('@/services/relacionamentoService')

      vi.clearAllMocks()

      const summaryStore: BatchStoreSummary = {
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
      }

      const explicitDate = '26/08/2026'

      // 1. Móvel test
      const parsedMovel = {
        fileName: 'LOTE_MOVEL.xlsx',
        importType: 'movel' as const,
        targetSheetName: 'Móvel',
        totalValidRows: 1,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryStore],
        analyticalRows: [
          {
            linha: 2,
            loja: 'CELNET AGUAS CLARAS',
            vendedor: 'VENDEDOR TESTE',
            cliente: 'CLIENTE TESTE',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
          },
        ],
        vendorLines: [
          {
            loja: 'CELNET AGUAS CLARAS',
            vendedor: 'VENDEDOR TESTE',
            status: 'fatura_paga' as const,
            quantidade: 1,
          },
        ],
      }

      await executeBatchImport(parsedMovel, explicitDate, mockStores)

      // Verify saveImportedFile got explicit referenceDate
      expect(saveImportedFile).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceDate: explicitDate,
        }),
      )

      // Verify saveFpdRecord got explicit referente
      expect(saveFpdRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          referente: explicitDate,
        }),
      )

      // Verify saveVendorConsolidationsFromLines got explicit reference date
      expect(saveVendorConsolidationsFromLines).toHaveBeenCalledWith(
        expect.any(Array),
        explicitDate,
        expect.any(Array),
      )

      // Verify insertMovelBatch received items with data_referencia === explicitDate
      expect(insertMovelBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data_referencia: explicitDate,
          }),
        ]),
        expect.any(Function),
      )

      // 2. Residencial test
      vi.clearAllMocks()

      const parsedResidencial = {
        fileName: 'LOTE_RESIDENCIAL.xlsx',
        importType: 'residencial' as const,
        targetSheetName: 'Residencial',
        totalValidRows: 1,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryStore],
        analyticalRows: [
          {
            linha: 2,
            loja: 'CELNET AGUAS CLARAS',
            vendedor: 'VENDEDOR TESTE RES',
            cliente: 'CLIENTE TESTE RES',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
            typedFields: {},
          },
        ],
        vendorLines: [],
      }

      await executeBatchImport(parsedResidencial, explicitDate, mockStores)
    })

    it('resolves empty loja in residential items to canonical batch store instead of empty string', async () => {
      const { insertResidencialBatch } = await import('@/services/relacionamentoService')
      vi.clearAllMocks()

      const summaryStore: BatchStoreSummary = {
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
        vendorLinesCount: 0,
        analyticalRowsCount: 1,
      }

      const parsedResidencial = {
        fileName: 'LOTE_RESIDENCIAL_SEM_LOJA.xlsx',
        importType: 'residencial' as const,
        targetSheetName: 'Residencial',
        totalValidRows: 1,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryStore],
        analyticalRows: [
          {
            linha: 2,
            loja: '', // Empty loja
            vendedor: 'VENDEDOR TESTE',
            cliente: 'CLIENTE TESTE',
            ocorrencias: 'Não Tratados',
            dados: {},
            typedFields: {},
          },
        ],
        vendorLines: [],
      }

      const explicitDate = '08/09/2026'
      await executeBatchImport(parsedResidencial, explicitDate, mockStores)

      expect(insertResidencialBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            loja: 'CELNET AGUAS CLARAS',
            data_referencia: '08/09/2026',
          }),
        ]),
        expect.any(Function),
      )

      expect(insertResidencialBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data_referencia: explicitDate,
          }),
        ]),
        expect.any(Function),
      )
    })

    it('falls back to the most recent reference date from backend when empty date is passed, never new Date()', async () => {
      const { fetchDistinctReferenceDates, saveImportedFile } =
        await import('@/services/fpdService')
      const { insertMovelBatch } = await import('@/services/relacionamentoService')

      vi.clearAllMocks()

      const summaryStore: BatchStoreSummary = {
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
      }

      const parsedMovel = {
        fileName: 'LOTE_MOVEL.xlsx',
        importType: 'movel' as const,
        targetSheetName: 'Móvel',
        totalValidRows: 1,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryStore],
        analyticalRows: [
          {
            linha: 2,
            loja: 'CELNET AGUAS CLARAS',
            vendedor: 'VENDEDOR 1',
            cliente: 'CLIENTE 1',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
          },
        ],
        vendorLines: [],
      }

      // Empty string passed
      await executeBatchImport(parsedMovel, '', mockStores)

      expect(fetchDistinctReferenceDates).toHaveBeenCalled()
      expect(saveImportedFile).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceDate: '26/08/2026',
        }),
      )
      expect(insertMovelBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data_referencia: '26/08/2026',
          }),
        ]),
        expect.any(Function),
      )
    })

    it('cenário com arquivo misto CELNET NOVA SUIÇA.xlsx e variações de ocorrências (case e status não catalogados): todas as linhas entram no consolidado da loja da linha e somam total_linhas', async () => {
      const storesForTest: StoreRecord[] = [
        {
          id: 'store-fisica-ns',
          collectionId: 'stores',
          collectionName: 'stores',
          name: 'CELNET NOVA SUIÇA',
          coordenacao: 'COORD 1',
          supervisao: 'SUPER 1',
          created: '2026-01-01',
          updated: '2026-01-01',
        },
        {
          id: 'store-call-ns',
          collectionId: 'stores',
          collectionName: 'stores',
          name: 'CELNET CALL NOVA SUIÇA',
          coordenacao: 'CALL',
          supervisao: 'CALL',
          created: '2026-01-01',
          updated: '2026-01-01',
        },
      ]

      // Header com LOJA, VENDEDOR, CLIENTE, CPF, OCORRÊNCIAS
      const header = ['LOJA', 'VENDEDOR', 'CLIENTE', 'CPF', 'OCORRÊNCIAS']
      const rows = [
        // Loja física: ocorrências variadas em case e pontuação
        ['CELNET NOVA SUIÇA', 'VENDEDOR 1', 'CLIENTE 1', '111.111.111-11', 'Pendente'],
        ['CELNET NOVA SUIÇA', 'VENDEDOR 1', 'CLIENTE 2', '222.222.222-22', 'pendente'],
        ['CELNET NOVA SUIÇA', 'VENDEDOR 2', 'CLIENTE 3', '333.333.333-33', 'Contato Realizado'],
        ['CELNET NOVA SUIÇA', 'VENDEDOR 2', 'CLIENTE 4', '444.444.444-44', 'FATURA(S) PAGA(S)'],
        [
          'CELNET NOVA SUIÇA',
          'VENDEDOR 3',
          'CLIENTE 5',
          '555.555.555-55',
          'STATUS DESCONHECIDO NOVO',
        ],
        // Loja CALL: ocorrências variadas
        ['CELNET CALL NOVA SUIÇA', 'AGENTE CALL 1', 'CLIENTE 6', '666.666.666-66', 'Pendente'],
        [
          'CELNET CALL NOVA SUIÇA',
          'AGENTE CALL 1',
          'CLIENTE 7',
          '777.777.777-77',
          'CONTATO REALIZADO',
        ],
        ['CELNET CALL NOVA SUIÇA', 'AGENTE CALL 2', 'CLIENTE 8', '888.888.888-88', 'Fatura Paga'],
        [
          'CELNET CALL NOVA SUIÇA',
          'AGENTE CALL 2',
          'CLIENTE 9',
          '999.999.999-99',
          'OUTRA OCORRENCIA RARA',
        ],
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Móvel')

      const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([u8], 'CELNET NOVA SUIÇA.xlsx')

      const parsed = await parseBatchXlsxFile(file, 'movel', storesForTest)

      // Todas as 9 linhas devem ser válidas e contabilizadas (nenhuma expurgada pois todas têm ocorrência preenchida)
      expect(parsed.totalValidRows).toBe(9)
      expect(parsed.totalExpurgadasRows).toBe(0)
      expect(parsed.analyticalRows).toHaveLength(9)

      // Verificar divisão por loja
      const fisicaSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET NOVA SUIÇA',
      )
      expect(fisicaSummary).toBeDefined()
      expect(fisicaSummary?.totalLinhas).toBe(5)
      expect(fisicaSummary?.pendente).toBe(2) // 'Pendente' e 'pendente'
      expect(fisicaSummary?.contato_realizado).toBe(1)
      expect(fisicaSummary?.fatura_paga).toBe(1)
      expect(fisicaSummary?.nao_tratados).toBe(1) // 'STATUS DESCONHECIDO NOVO' fallback

      const callSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET CALL NOVA SUIÇA',
      )
      expect(callSummary).toBeDefined()
      expect(callSummary?.totalLinhas).toBe(4)
      expect(callSummary?.pendente).toBe(1)
      expect(callSummary?.contato_realizado).toBe(1)
      expect(callSummary?.fatura_paga).toBe(1)
      expect(callSummary?.nao_tratados).toBe(1) // 'OUTRA OCORRENCIA RARA' fallback

      // Soma dos totais de linhas de todas as lojas deve ser exatamente 9
      const totalSomaLojas = parsed.storeSummaries.reduce((acc, s) => acc + s.totalLinhas, 0)
      expect(totalSomaLojas).toBe(9)
      expect(totalSomaLojas).toBe(parsed.totalValidRows)
    })

    it('cenário com arquivo contendo linhas de loja física e linhas de loja CALL/ILHA: deve isolar CALL de loja física e somar totais com consistência', async () => {
      const { saveFpdRecord, saveVendorConsolidationsFromLines } =
        await import('@/services/fpdService')

      const storesWithBoth: StoreRecord[] = [
        {
          id: 'store-fisica-1',
          collectionId: 'stores',
          collectionName: 'stores',
          name: 'CELNET NOVA SUIÇA',
          coordenacao: 'Karen',
          supervisao: 'Karen',
          created: '2026-01-01',
          updated: '2026-01-01',
        },
        {
          id: 'store-call-1',
          collectionId: 'stores',
          collectionName: 'stores',
          name: 'CELNET CALL NOVA SUIÇA',
          coordenacao: '',
          supervisao: '',
          created: '2026-01-01',
          updated: '2026-01-01',
        },
      ]

      const summaryFisica: BatchStoreSummary = {
        rawStoreName: 'CELNET NOVA SUIÇA',
        canonicalStoreName: 'CELNET NOVA SUIÇA',
        storeId: 'store-fisica-1',
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
        vendorLinesCount: 1,
        analyticalRowsCount: 2,
      }

      const summaryCall: BatchStoreSummary = {
        rawStoreName: 'CELNET CALL NOVA SUIÇA',
        canonicalStoreName: 'CELNET CALL NOVA SUIÇA',
        storeId: 'store-call-1',
        totalLinhas: 3,
        fatura_paga: 0,
        envio_fatura: 0,
        promessa_pagto: 0,
        sem_contato: 0,
        cancelados: 0,
        pendente: 3,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
        vendorLinesCount: 1,
        analyticalRowsCount: 3,
      }

      const parsedMultiStoreData = {
        fileName: 'CELNET NOVA SUIÇA.xlsx',
        importType: 'movel' as const,
        targetSheetName: 'Móvel',
        totalValidRows: 5,
        totalExpurgadasRows: 0,
        storeSummaries: [summaryFisica, summaryCall],
        analyticalRows: [
          // 2 linhas da loja física
          {
            linha: 2,
            loja: 'CELNET NOVA SUIÇA',
            vendedor: 'VENDEDOR FISICO',
            cliente: 'CLIENTE 1',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
          },
          {
            linha: 3,
            loja: 'CELNET NOVA SUIÇA',
            vendedor: 'VENDEDOR FISICO',
            cliente: 'CLIENTE 2',
            ocorrencias: 'Fatura(s) Paga(s)',
            dados: {},
          },
          // 3 linhas da loja CALL
          {
            linha: 4,
            loja: 'CELNET CALL NOVA SUIÇA',
            vendedor: 'VENDEDOR CALL',
            cliente: 'CLIENTE CALL 1',
            ocorrencias: 'Pendente',
            dados: {},
          },
          {
            linha: 5,
            loja: 'CELNET CALL NOVA SUIÇA',
            vendedor: 'VENDEDOR CALL',
            cliente: 'CLIENTE CALL 2',
            ocorrencias: 'Pendente',
            dados: {},
          },
          {
            linha: 6,
            loja: 'CELNET CALL NOVA SUIÇA',
            vendedor: 'VENDEDOR CALL',
            cliente: 'CLIENTE CALL 3',
            ocorrencias: 'Pendente',
            dados: {},
          },
        ],
        vendorLines: [
          {
            vendedor: 'VENDEDOR FISICO',
            loja: 'CELNET NOVA SUIÇA',
            status: 'fatura_paga' as const,
            quantidade: 2,
          },
          {
            vendedor: 'VENDEDOR CALL',
            loja: 'CELNET CALL NOVA SUIÇA',
            status: 'pendente' as const,
            quantidade: 3,
          },
        ],
      }

      const result = await executeBatchImport(parsedMultiStoreData, '26/08/2026', storesWithBoth)

      expect(result.storesCount).toBe(2)
      expect(result.totalFpdUpdated).toBe(2)
      expect(result.totalAnalyticalInserted).toBe(5)

      // saveFpdRecord deve ter sido chamado para ambas as lojas separadamente com seus respectivos storeIds
      expect(saveFpdRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-fisica-1',
          total_linhas: 2,
          fatura_paga: 2,
        }),
      )
      expect(saveFpdRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-call-1',
          total_linhas: 3,
          pendente: 3,
        }),
      )

      // saveVendorConsolidationsFromLines deve receber linhas com lojas isoladas
      expect(saveVendorConsolidationsFromLines).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            loja: 'CELNET NOVA SUIÇA',
            vendedor: 'VENDEDOR FISICO',
          }),
          expect.objectContaining({
            loja: 'CELNET CALL NOVA SUIÇA',
            vendedor: 'VENDEDOR CALL',
          }),
        ]),
        '26/08/2026',
        expect.any(Array),
      )
    })

    it('processes Preventiva FPD Residencial batch with multiple status columns faithfully without dumping into nao_tratados', async () => {
      const headers = [
        'NR ANO MES',
        'LOJA',
        'VENDEDOR',
        'CLIENTE',
        'CPF',
        'FATURA',
        'PAGO',
        'VLR PAGO',
        'INDICADOR',
        'PREVENTIVA FPD',
        'VIROU FPD',
        'DSC_STATUS_CONTRATO',
      ]
      const rows = [
        headers,
        [
          202605,
          'CELNET MATRIZ PLANALTINA DF',
          'VENDEDOR 1',
          'CLIENTE 1',
          '111',
          'Paga',
          1,
          '50.00',
          'Preventiva FPD',
          1,
          0,
          'CONECTADO',
        ],
        [
          202605,
          'CELNET MATRIZ PLANALTINA DF',
          'VENDEDOR 2',
          'CLIENTE 2',
          '222',
          'Em Aberto',
          0,
          '',
          'Virou FPD',
          0,
          1,
          'CONECTADO',
        ],
        [
          202605,
          'CELNET DF PLAZA',
          'VENDEDOR 3',
          'CLIENTE 3',
          '333',
          'Em Aberto',
          0,
          '',
          '',
          0,
          0,
          'DESCONECTADO',
        ],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Residencial')

      const wbBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([wbBuf], 'Preventiva FPD Safra de Maio-Julho-26 - base 08-09-26.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const parsed = await parseBatchXlsxFile(file, 'residencial', [
        { id: 'store-1', name: 'CELNET MATRIZ PLANALTINA DF', coordenacao: '', supervisao: '' },
        { id: 'store-2', name: 'CELNET DF PLAZA', coordenacao: '', supervisao: '' },
      ] as any)

      // Total valid rows: 3
      expect(parsed.totalValidRows).toBe(3)
      expect(parsed.totalExpurgadasRows).toBe(0)

      // Check analyticalRows
      expect(parsed.analyticalRows).toHaveLength(3)
      expect(parsed.analyticalRows[0].ocorrencias).toBe('Fatura(s) Paga(s)')
      expect(parsed.analyticalRows[1].ocorrencias).toBe('Pendente')
      expect(parsed.analyticalRows[2].ocorrencias).toBe('Cancelados')

      // Check storeSummaries
      const planaltina = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET MATRIZ PLANALTINA DF',
      )
      expect(planaltina).toBeDefined()
      expect(planaltina?.totalLinhas).toBe(2)
      expect(planaltina?.fatura_paga).toBe(1)
      expect(planaltina?.pendente).toBe(1)
      expect(planaltina?.nao_tratados).toBe(0)

      const dfPlaza = parsed.storeSummaries.find((s) => s.canonicalStoreName === 'CELNET DF PLAZA')
      expect(dfPlaza).toBeDefined()
      expect(dfPlaza?.totalLinhas).toBe(1)
      expect(dfPlaza?.cancelados).toBe(1)
      expect(dfPlaza?.nao_tratados).toBe(0)
    })

    it('faithful to spreadsheet: batch residencial with status column as "Não Tratados" preserves nao_tratados in storeSummary', async () => {
      const headers = [
        'LOJA',
        'VENDEDOR',
        'STATUS',
        'FATURA',
        'PAGO',
        'VLR PAGO',
        'INDICADOR',
        'VIROU FPD',
      ]
      const rows = [
        headers,
        [
          'CELNET SHOPPING JK',
          'ADELMA VIEIRA',
          'Não Tratados',
          'Em Aberto',
          '0',
          '0',
          'Virou FPD',
          '1',
        ],
        [
          'CELNET SHOPPING JK',
          'ADELMA VIEIRA',
          'Não Tratados',
          'Paga',
          '1',
          '150',
          'Virou FPD',
          '1',
        ],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Residencial')
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([buffer], 'batch_res.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const parsed = await parseBatchXlsxFile(file, 'residencial', mockStores as any)
      const jkSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET SHOPPING JK',
      )
      expect(jkSummary).toBeDefined()
      expect(jkSummary?.totalLinhas).toBe(2)
      expect(jkSummary?.pendente).toBe(0)
      expect(jkSummary?.fatura_paga).toBe(0)
      expect(jkSummary?.nao_tratados).toBe(2)
    })

    it('multi-field fallback: batch residencial with empty status column applies multi-field derivation in storeSummary', async () => {
      const headers = [
        'LOJA',
        'VENDEDOR',
        'STATUS',
        'FATURA',
        'PAGO',
        'VLR PAGO',
        'INDICADOR',
        'VIROU FPD',
      ]
      const rows = [
        headers,
        [
          'CELNET SHOPPING JK',
          'ADELMA VIEIRA',
          '', // status vazio -> derivação multi-campo
          'Em Aberto',
          '0',
          '0',
          'Virou FPD',
          '1',
        ],
        [
          'CELNET SHOPPING JK',
          'ADELMA VIEIRA',
          '', // status vazio -> derivação multi-campo (pago=1, vlr_pago>0)
          'Paga',
          '1',
          '150',
          'Virou FPD',
          '1',
        ],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Residencial')
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const file = new File([buffer], 'batch_res_fallback.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const parsed = await parseBatchXlsxFile(file, 'residencial', mockStores as any)
      const jkSummary = parsed.storeSummaries.find(
        (s) => s.canonicalStoreName === 'CELNET SHOPPING JK',
      )
      expect(jkSummary).toBeDefined()
      expect(jkSummary?.totalLinhas).toBe(2)
      expect(jkSummary?.pendente).toBe(1)
      expect(jkSummary?.fatura_paga).toBe(1)
      expect(jkSummary?.nao_tratados).toBe(0)
    })
  })
})
