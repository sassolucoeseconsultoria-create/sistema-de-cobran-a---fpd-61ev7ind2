import { describe, it, expect, vi } from 'vitest'
import type { FpdRecord, StoreRecord } from '@/types/fpd'
import {
  buildConsolidatedRow,
  buildComparisonRows,
  computeComparisonSummary,
} from './consolidatedComparison'
import { exportConsolidatedComparisonToXlsx } from './xlsxExport'
import * as XLSX from 'xlsx'

describe('Consolidated Comparison Logic', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-1',
      name: 'CELNET SHOPPING FLAMBOYANT',
      coordenacao: 'Hélio',
      supervisao: 'Daniella',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '2026-08-01',
      updated: '2026-08-01',
    },
    {
      id: 'store-2',
      name: 'CELNET JK SHOPPING',
      coordenacao: 'Valéria',
      supervisao: 'Jéssica',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '2026-08-01',
      updated: '2026-08-01',
    },
    {
      id: 'store-3',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '2026-08-01',
      updated: '2026-08-01',
    },
  ]

  const mockRecords: FpdRecord[] = [
    // Store 1: Present in both 26/08 and 15/08
    {
      id: 'rec-1a',
      store: 'store-1',
      referente: '26/08/2026',
      total_linhas: 50,
      fatura_paga: 20,
      envio_fatura: 10,
      promessa_pagto: 5,
      sem_contato: 5,
      cancelados: 2,
      pendente: 5,
      contato_realizado: 2,
      nao_tratados: 1,
      importado_em: '2026-08-26',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      created: '2026-08-26',
      updated: '2026-08-26',
    },
    {
      id: 'rec-1b',
      store: 'store-1',
      referente: '15/08/2026',
      total_linhas: 45,
      fatura_paga: 15,
      envio_fatura: 8,
      promessa_pagto: 6,
      sem_contato: 6,
      cancelados: 3,
      pendente: 4,
      contato_realizado: 2,
      nao_tratados: 1,
      importado_em: '2026-08-15',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      created: '2026-08-15',
      updated: '2026-08-15',
    },
    // Store 2: Only present in 26/08 (NEW in primary)
    {
      id: 'rec-2a',
      store: 'store-2',
      referente: '26/08/2026',
      total_linhas: 30,
      fatura_paga: 10,
      envio_fatura: 5,
      promessa_pagto: 5,
      sem_contato: 3,
      cancelados: 2,
      pendente: 3,
      contato_realizado: 1,
      nao_tratados: 1,
      importado_em: '2026-08-26',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      created: '2026-08-26',
      updated: '2026-08-26',
    },
    // Store 3: Only present in 15/08 (MISSING in primary)
    {
      id: 'rec-3b',
      store: 'store-3',
      referente: '15/08/2026',
      total_linhas: 25,
      fatura_paga: 8,
      envio_fatura: 5,
      promessa_pagto: 4,
      sem_contato: 3,
      cancelados: 1,
      pendente: 2,
      contato_realizado: 1,
      nao_tratados: 1,
      importado_em: '2026-08-15',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      created: '2026-08-15',
      updated: '2026-08-15',
    },
  ]

  it('buildConsolidatedRow should extract correct values for a reference date', () => {
    const row26 = buildConsolidatedRow(mockStores[0], mockRecords, '26/08/2026')
    expect(row26.hasData).toBe(true)
    expect(row26.totalLinhas).toBe(50)
    expect(row26.faturaPaga).toBe(20)

    const row15 = buildConsolidatedRow(mockStores[0], mockRecords, '15/08/2026')
    expect(row15.hasData).toBe(true)
    expect(row15.totalLinhas).toBe(45)
    expect(row15.faturaPaga).toBe(15)

    const rowNonExistent = buildConsolidatedRow(mockStores[0], mockRecords, '01/01/2020')
    expect(rowNonExistent.hasData).toBe(false)
    expect(rowNonExistent.totalLinhas).toBe(0)
  })

  it('buildComparisonRows should calculate correct diffs between two references', () => {
    const compRows = buildComparisonRows(mockStores, mockRecords, '26/08/2026', '15/08/2026')

    expect(compRows).toHaveLength(3)

    // Store 1: 50 in 26/08 vs 45 in 15/08 => diff +5
    const store1 = compRows.find((r) => r.storeId === 'store-1')!
    expect(store1.hasDataPrimary).toBe(true)
    expect(store1.hasDataCompared).toBe(true)
    expect(store1.isNewInPrimary).toBe(false)
    expect(store1.isMissingInPrimary).toBe(false)
    expect(store1.diff.totalLinhas).toBe(5)
    expect(store1.diff.faturaPaga).toBe(5) // 20 - 15
    expect(store1.diff.envioFatura).toBe(2) // 10 - 8
    expect(store1.diff.cancelados).toBe(-1) // 2 - 3

    // Store 2: 30 in 26/08 vs 0 in 15/08 => NEW
    const store2 = compRows.find((r) => r.storeId === 'store-2')!
    expect(store2.hasDataPrimary).toBe(true)
    expect(store2.hasDataCompared).toBe(false)
    expect(store2.isNewInPrimary).toBe(true)
    expect(store2.isMissingInPrimary).toBe(false)
    expect(store2.diff.totalLinhas).toBe(30)
    expect(store2.diff.faturaPaga).toBe(10)

    // Store 3: 0 in 26/08 vs 25 in 15/08 => MISSING in primary
    const store3 = compRows.find((r) => r.storeId === 'store-3')!
    expect(store3.hasDataPrimary).toBe(false)
    expect(store3.hasDataCompared).toBe(true)
    expect(store3.isNewInPrimary).toBe(false)
    expect(store3.isMissingInPrimary).toBe(true)
    expect(store3.diff.totalLinhas).toBe(-25)
    expect(store3.diff.faturaPaga).toBe(-8)
  })

  it('computeComparisonSummary should aggregate metrics and identify highest increase and decrease', () => {
    const compRows = buildComparisonRows(mockStores, mockRecords, '26/08/2026', '15/08/2026')

    const summary = computeComparisonSummary(compRows, '26/08/2026', '15/08/2026')

    // Store 1: 50 primary, 45 compared
    // Store 2: 30 primary, 0 compared
    // Store 3: 0 primary, 25 compared
    // Total primary = 80, Total compared = 70 => diff = +10
    expect(summary.totalPrimaryLinhas).toBe(80)
    expect(summary.totalComparedLinhas).toBe(70)
    expect(summary.diffLinhas).toBe(10)

    // Highest increase: Store 2 (+30)
    expect(summary.storeWithHighestIncrease?.storeName).toBe('CELNET JK SHOPPING')
    expect(summary.storeWithHighestIncrease?.diff).toBe(30)

    // Highest decrease: Store 3 (-25)
    expect(summary.storeWithHighestDecrease?.storeName).toBe('CELNET AGUAS CLARAS')
    expect(summary.storeWithHighestDecrease?.diff).toBe(-25)
  })

  it('exportConsolidatedComparisonToXlsx generates spreadsheet with comparison columns and correct filename', () => {
    const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

    const compRows = buildComparisonRows(mockStores, mockRecords, '26/08/2026', '15/08/2026')

    const totalsP = {
      totalLinhas: 80,
      faturaPaga: 30,
      envioFatura: 15,
      promessaPagto: 10,
      semContato: 8,
      cancelados: 4,
      pendente: 8,
      contatoRealizado: 3,
      naoTratados: 2,
    }
    const totalsC = {
      totalLinhas: 70,
      faturaPaga: 23,
      envioFatura: 13,
      promessaPagto: 10,
      semContato: 9,
      cancelados: 4,
      pendente: 6,
      contatoRealizado: 3,
      naoTratados: 2,
    }

    exportConsolidatedComparisonToXlsx(compRows, totalsP, totalsC, '26/08/2026', '15/08/2026')

    expect(writeFileSpy).toHaveBeenCalledTimes(1)
    const [wb, filename] = writeFileSpy.mock.calls[0]
    expect(filename).toBe('Consolidado_Comparativo_26-08-2026_vs_15-08-2026.xlsx')
    expect(wb.SheetNames).toContain('Comparativo')

    writeFileSpy.mockRestore()
  })

  it('buildConsolidatedRow trims whitespace when matching referenceFilter (e.g. "08/09/2026 " vs "08/09/2026")', () => {
    const store: StoreRecord = {
      id: 's-trim',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'LOJA TRIM TEST',
      created: '',
      updated: '',
    }
    const recs: FpdRecord[] = [
      {
        id: 'r-trim-1',
        collectionId: 'fpd_records',
        collectionName: 'fpd_records',
        store: 's-trim',
        referente: ' 08/09/2026 ',
        total_linhas: 50,
        fatura_paga: 20,
        envio_fatura: 10,
        promessa_pagto: 5,
        sem_contato: 5,
        cancelados: 2,
        pendente: 5,
        contato_realizado: 1,
        nao_tratados: 2,
        outros: 0,
        importado_em: '',
        created: '',
        updated: '',
      },
    ]

    const row = buildConsolidatedRow(store, recs, '08/09/2026')
    expect(row.hasData).toBe(true)
    expect(row.totalLinhas).toBe(50)
    expect(row.faturaPaga).toBe(20)
  })

  it('buildConsolidatedRow with filter "all" respects allowed dates filter', () => {
    const store = mockStores[0]
    // mockRecords has rec-1a (26/08/2026) and rec-1b (15/08/2026) for store-1.
    // If 26/08/2026 is disabled (allowed: only 15/08/2026), 'all' must pick 15/08/2026.
    const rowOnly15 = buildConsolidatedRow(store, mockRecords, 'all', ['15/08/2026'])
    expect(rowOnly15.hasData).toBe(true)
    expect(rowOnly15.referente).toBe('15/08/2026')
    expect(rowOnly15.totalLinhas).toBe(45)

    // If both allowed, it picks the first/latest (26/08/2026)
    const rowAllAllowed = buildConsolidatedRow(store, mockRecords, 'all', [
      '26/08/2026',
      '15/08/2026',
    ])
    expect(rowAllAllowed.hasData).toBe(true)
    expect(rowAllAllowed.referente).toBe('26/08/2026')
    expect(rowAllAllowed.totalLinhas).toBe(50)

    // If none allowed, it returns empty
    const rowNoneAllowed = buildConsolidatedRow(store, mockRecords, 'all', [])
    expect(rowNoneAllowed.hasData).toBe(false)
  })
})
