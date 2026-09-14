import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isRateLimitError,
  extractRetryAfterMs,
  executeWithRateLimitRetry,
  mapWithConcurrency,
} from '@/lib/pocketbase/rateLimiter'
import { insertMovelBatch, insertResidencialBatch } from '@/services/relacionamentoService'
import { executeBatchImport, type ParsedBatchData } from '@/services/batchImportService'
import pb from '@/lib/pocketbase/client'

// Mock pocketbase
vi.mock('@/lib/pocketbase/client', () => {
  const collectionMock = {
    getList: vi.fn(),
    getFullList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  return {
    default: {
      collection: vi.fn(() => collectionMock),
      send: vi.fn(),
    },
  }
})

describe('Rate Limiter & 429 Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects 429 errors from various shapes', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true)
    expect(isRateLimitError({ statusCode: 429 })).toBe(true)
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true)
    expect(isRateLimitError(new Error('Too Many Requests.'))).toBe(true)
    expect(isRateLimitError(new Error('Rate limit exceeded'))).toBe(true)
    expect(isRateLimitError({ status: 500, message: 'Internal Server Error' })).toBe(false)
    expect(isRateLimitError(null)).toBe(false)
  })

  it('extracts Retry-After header correctly', () => {
    const errWithHeaderObj = {
      response: {
        headers: { 'retry-after': '2' },
      },
    }
    expect(extractRetryAfterMs(errWithHeaderObj)).toBe(2000)

    const errWithHeadersMap = {
      response: {
        headers: new Headers({ 'retry-after': '3' }),
      },
    }
    expect(extractRetryAfterMs(errWithHeadersMap)).toBe(3000)

    expect(extractRetryAfterMs({})).toBeNull()
  })

  it('retries when action throws 429 and succeeds upon subsequent attempt', async () => {
    let callCount = 0
    const mockAction = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 2) {
        const error = new Error('Too Many Requests.')
        ;(error as unknown as { status: number }).status = 429
        throw error
      }
      return 'success-result'
    })

    const throttledEvents: number[] = []
    const result = await executeWithRateLimitRetry(mockAction, {
      maxRetries: 4,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
      onThrottled: (attempt) => throttledEvents.push(attempt),
    })

    expect(result).toBe('success-result')
    expect(callCount).toBe(3)
    expect(throttledEvents).toEqual([1, 2])
  })

  it('mapWithConcurrency processes all items even with transient 429 errors', async () => {
    const items = [1, 2, 3, 4, 5]
    const failureTracker = new Set<number>()

    const worker = vi.fn().mockImplementation(async (item: number) => {
      if (!failureTracker.has(item) && (item === 2 || item === 4)) {
        failureTracker.add(item)
        const error = new Error('Too Many Requests.')
        ;(error as unknown as { status: number }).status = 429
        throw error
      }
      return item * 10
    })

    const results = await mapWithConcurrency(items, worker, {
      concurrency: 2,
      pacingMs: 5,
      retryOptions: {
        maxRetries: 3,
        initialBackoffMs: 10,
      },
    })

    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(worker).toHaveBeenCalledTimes(7) // 5 items + 2 retries for items 2 and 4
  })

  it('insertMovelBatch retries on 429 and preserves all records', async () => {
    const mockCol = pb.collection('movel') as unknown as {
      getList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }

    mockCol.getList.mockResolvedValue({ items: [], totalPages: 1 })

    let attempts = 0
    mockCol.create.mockImplementation(async (payload) => {
      attempts++
      if (attempts === 1) {
        const err = new Error('Too Many Requests.')
        ;(err as unknown as { status: number }).status = 429
        throw err
      }
      return { id: `rec-${attempts}`, ...payload }
    })

    const rows = [
      {
        arquivo: 'test.xlsx',
        linha: 1,
        loja: 'LOJA TESTE',
        vendedor: 'VENDEDOR A',
        cliente: 'CLIENTE A',
        ocorrencias: 'Fatura(s) Paga(s)',
      },
      {
        arquivo: 'test.xlsx',
        linha: 2,
        loja: 'LOJA TESTE',
        vendedor: 'VENDEDOR B',
        cliente: 'CLIENTE B',
        ocorrencias: 'Pendente',
      },
    ]

    const inserted = await insertMovelBatch(rows)
    expect(inserted).toBe(2)
    // 1st item failed once with 429, then retried and passed; 2nd item passed directly -> 3 create calls
    expect(attempts).toBe(3)
  })

  it('insertResidencialBatch retries on 429 and finishes successfully', async () => {
    const mockCol = pb.collection('residencial') as unknown as {
      getList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }

    mockCol.getList.mockResolvedValue({ items: [], totalPages: 1 })

    let attempts = 0
    mockCol.create.mockImplementation(async (payload) => {
      attempts++
      if (attempts === 1) {
        const err = new Error('Too Many Requests.')
        ;(err as unknown as { status: number }).status = 429
        throw err
      }
      return { id: `rec-res-${attempts}`, ...payload }
    })

    const rows = [
      {
        arquivo: 'test_res.xlsx',
        linha: 1,
        loja: 'LOJA TESTE',
        vendedor: 'VENDEDOR RES',
        cliente: 'CLIENTE RES',
        ocorrencias: 'Pendente',
      },
    ]

    const inserted = await insertResidencialBatch(rows)
    expect(inserted).toBe(1)
    expect(attempts).toBe(2)
  })

  it('executeBatchImport recovers from 429 on fpd_records or vendor_consolidations and completes all stores', async () => {
    const mockFpdCol = pb.collection('fpd_records') as unknown as {
      getList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    const mockFilesCol = pb.collection('imported_files') as unknown as {
      getList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    const mockVendorCol = pb.collection('vendor_consolidations') as unknown as {
      getFullList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    const mockMovelCol = pb.collection('movel') as unknown as {
      getList: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
    }
    const mockStoresCol = pb.collection('stores') as unknown as {
      getFullList: ReturnType<typeof vi.fn>
    }

    mockStoresCol.getFullList.mockResolvedValue([
      { id: 'store-1', name: 'LOJA 1' },
      { id: 'store-2', name: 'LOJA 2' },
    ])
    mockFilesCol.getList.mockResolvedValue({ items: [], totalPages: 1 })
    mockFilesCol.create.mockResolvedValue({ id: 'file-1' })
    mockFpdCol.getList.mockResolvedValue({ items: [], totalPages: 1 })
    mockMovelCol.getList.mockResolvedValue({ items: [], totalPages: 1 })
    mockMovelCol.create.mockResolvedValue({ id: 'm-1' })
    mockVendorCol.getFullList.mockResolvedValue([])

    // Simulate 429 on fpd_records.create first attempt
    let fpdAttempts = 0
    mockFpdCol.create.mockImplementation(async (payload) => {
      fpdAttempts++
      if (fpdAttempts === 1) {
        const err = new Error('Too Many Requests.')
        ;(err as unknown as { status: number }).status = 429
        throw err
      }
      return { id: `fpd-${fpdAttempts}`, ...payload }
    })

    // Simulate 429 on vendor_consolidations.create first attempt
    let vendorAttempts = 0
    mockVendorCol.create.mockImplementation(async (payload) => {
      vendorAttempts++
      if (vendorAttempts === 1) {
        const err = new Error('Too Many Requests.')
        ;(err as unknown as { status: number }).status = 429
        throw err
      }
      return { id: `vend-${vendorAttempts}`, ...payload }
    })

    const parsedBatch: ParsedBatchData = {
      fileName: 'lote_teste.xlsx',
      importType: 'movel',
      targetSheetName: 'Móvel',
      totalValidRows: 2,
      totalExpurgadasRows: 0,
      storeSummaries: [
        {
          rawStoreName: 'LOJA 1',
          canonicalStoreName: 'LOJA 1',
          storeId: 'store-1',
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
        {
          rawStoreName: 'LOJA 2',
          canonicalStoreName: 'LOJA 2',
          storeId: 'store-2',
          totalLinhas: 1,
          fatura_paga: 0,
          envio_fatura: 1,
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
          linha: 1,
          loja: 'LOJA 1',
          vendedor: 'VEND 1',
          cliente: 'CLI 1',
          ocorrencias: 'Fatura(s) Paga(s)',
          dados: {},
        },
        {
          linha: 2,
          loja: 'LOJA 2',
          vendedor: 'VEND 2',
          cliente: 'CLI 2',
          ocorrencias: 'Enviado Fatura',
          dados: {},
        },
      ],
      vendorLines: [
        {
          loja: 'LOJA 1',
          vendedor: 'VEND 1',
          status: 'fatura_paga',
          quantidade: 1,
        },
        {
          loja: 'LOJA 2',
          vendedor: 'VEND 2',
          status: 'envio_fatura',
          quantidade: 1,
        },
      ],
    }

    const result = await executeBatchImport(parsedBatch, '26/08/2026', [
      { id: 'store-1', name: 'LOJA 1', collectionId: 'stores', collectionName: 'stores' },
      { id: 'store-2', name: 'LOJA 2', collectionId: 'stores', collectionName: 'stores' },
    ])

    expect(result.storesCount).toBe(2)
    expect(result.totalFpdUpdated).toBe(2)
    expect(result.totalVendorSaved).toBe(2)
    expect(result.totalAnalyticalInserted).toBe(2)
    expect(fpdAttempts).toBe(3) // 1 failed + 2 successful
    expect(vendorAttempts).toBe(3) // 1 failed + 2 successful
  })
})
