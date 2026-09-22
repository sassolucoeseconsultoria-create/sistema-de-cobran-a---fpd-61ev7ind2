import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reconsolidarLojaReferencia } from '@/services/relacionamentoService'
import pb from '@/lib/pocketbase/client'
import * as fpdService from '@/services/fpdService'
import type { StoreRecord } from '@/types/fpd'

// Mock PocketBase client
vi.mock('@/lib/pocketbase/client', () => {
  const mockCollection = vi.fn()
  return {
    default: {
      collection: mockCollection,
    },
    pb: {
      collection: mockCollection,
    },
    isSessionExpiredError: vi.fn(() => false),
  }
})

describe('reconsolidarLojaReferencia — Automação de Agregados Lojas -> Supervisão, Coordenação e ADM', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-alfa-id',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET PLANALTINA DF',
      coordenacao: 'COORD DF',
      supervisao: 'SUPERVISAO DF',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'store-beta-id',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'COORD DF',
      supervisao: 'SUPERVISAO AGUAS',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(fpdService, 'fetchStores').mockResolvedValue(mockStores)
    vi.spyOn(fpdService, 'saveFpdRecord').mockResolvedValue({ id: 'fpd-rec-1' } as any)
  })

  it('reconsolida com filtro tolerante a espaço residual de data e variantes de loja', async () => {
    const movelWithSpaceRef = [
      {
        id: 'm-space-1',
        loja: 'PLANALTINA', // variante curta
        vendedor: 'VENDEDOR DF',
        ocorrencias: 'Fatura(s) Paga(s)',
        data_referencia: '08/09/2026 ', // espaço residual do Excel
        dados: { Numero: '61991119999' },
      },
    ]

    const mockMovelGetFullList = vi.fn().mockResolvedValue(movelWithSpaceRef)
    const mockResGetFullList = vi.fn().mockResolvedValue([])

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return { getFullList: mockMovelGetFullList } as any
      if (name === 'residencial') return { getFullList: mockResGetFullList } as any
      if (name === 'vendor_consolidations') {
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
          create: vi.fn().mockResolvedValue({ id: 'v1' }),
        } as any
      }
      return {} as any
    })

    const result = await reconsolidarLojaReferencia('PLANALTINA', '08/09/2026')
    expect(result.success).toBe(true)

    // Verifica que a query usou cláusula com variantes de loja e tolerância a espaço
    expect(mockMovelGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining('08/09/2026'),
      }),
    )

    // Verifica que saveFpdRecord foi chamado para a loja correspondente com 1 linha processada
    expect(fpdService.saveFpdRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-alfa-id',
        referente: '08/09/2026',
        total_linhas: 1,
        fatura_paga: 1,
        accumulate: false,
      }),
    )
  })

  it('reconsolida agregados de fpd_records e vendor_consolidations para uma loja e referência', async () => {
    const movelRows = [
      {
        id: 'm1',
        loja: 'CELNET PLANALTINA DF',
        vendedor: 'VENDEDOR JOAO',
        ocorrencias: 'Fatura(s) Paga(s)',
        data_referencia: '10/09/2026',
        dados: { Numero: '61991110001' },
      },
      {
        id: 'm2',
        loja: 'CELNET PLANALTINA DF',
        vendedor: 'VENDEDOR JOAO',
        ocorrencias: 'Enviado Fatura(s)',
        data_referencia: '10/09/2026',
        dados: { Numero: '61991110002' },
      },
      {
        id: 'm3',
        loja: 'CELNET PLANALTINA DF',
        vendedor: 'VENDEDOR MARIA',
        ocorrencias: 'Promessa de Pagto.',
        data_referencia: '10/09/2026',
        dados: { Numero: '61991110003' },
      },
    ]

    const residencialRows = [
      {
        id: 'r1',
        loja: 'CELNET PLANALTINA DF',
        vendedor: 'VENDEDOR JOAO',
        ocorrencias: 'Cancelados',
        nr_contrato: 'CTR-001',
        data_referencia: '10/09/2026',
        dados: { NR_CONTRATO: 'CTR-001' },
      },
      {
        id: 'r2',
        loja: 'CELNET PLANALTINA DF',
        vendedor: 'VENDEDOR MARIA',
        ocorrencias: 'Pendente',
        nr_contrato: 'CTR-002',
        data_referencia: '10/09/2026',
        dados: { NR_CONTRATO: 'CTR-002' },
      },
    ]

    const mockVendorCol = {
      getFullList: vi.fn().mockResolvedValue([
        {
          id: 'v-joao-id',
          vendedor: 'VENDEDOR JOAO',
          loja: 'CELNET PLANALTINA DF',
          supervisao: 'SUPERVISAO DF',
          data_referencia: '10/09/2026',
          total_linhas: 5,
        },
      ]),
      update: vi.fn().mockResolvedValue({ id: 'v-joao-id' }),
      create: vi.fn().mockResolvedValue({ id: 'v-maria-id' }),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') {
        return {
          getFullList: vi.fn().mockResolvedValue(movelRows),
        } as any
      }
      if (name === 'residencial') {
        return {
          getFullList: vi.fn().mockResolvedValue(residencialRows),
        } as any
      }
      if (name === 'vendor_consolidations') {
        return mockVendorCol as any
      }
      return {} as any
    })

    const result = await reconsolidarLojaReferencia('CELNET PLANALTINA DF', '10/09/2026')

    expect(result.success).toBe(true)
    expect(result.fpdUpdated).toBe(true)
    expect(result.vendorsUpdated).toBe(2)

    // Verificar saveFpdRecord (accumulate: false, totais recalculados)
    expect(fpdService.saveFpdRecord).toHaveBeenCalledWith({
      storeId: 'store-alfa-id',
      referente: '10/09/2026',
      total_linhas: 5,
      fatura_paga: 1,
      envio_fatura: 1,
      promessa_pagto: 1,
      cancelados: 1,
      pendente: 1,
      sem_contato: 0,
      contato_realizado: 0,
      nao_tratados: 0,
      outros: 0,
      accumulate: false,
    })

    // Verificar vendor_consolidations (JOAO atualizado, MARIA criada)
    expect(mockVendorCol.update).toHaveBeenCalledWith(
      'v-joao-id',
      expect.objectContaining({
        vendedor: 'VENDEDOR JOAO',
        total_linhas: 3,
        fatura_paga: 1,
        envio_fatura: 1,
        cancelados: 1,
      }),
      expect.anything(),
    )

    expect(mockVendorCol.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendedor: 'VENDEDOR MARIA',
        total_linhas: 2,
        promessa_pagto: 1,
        pendente: 1,
      }),
      expect.anything(),
    )
  })

  it('suporta 80+ linhas distribuídas com paginação completa (batch: 2000) e deduplicação canônica', async () => {
    // 50 linhas móvel + 35 linhas residencial = 85 linhas (acima da paginação padrão de 30 ou 50)
    // Com algumas duplicatas de número/contrato para testar deduplicação
    const movel80 = Array.from({ length: 50 }, (_, i) => ({
      id: `m-80-${i}`,
      loja: 'CELNET AGUAS CLARAS',
      vendedor: `VENDEDOR ${(i % 4) + 1}`,
      ocorrencias: i % 2 === 0 ? 'Fatura(s) Paga(s)' : 'Não Tratados',
      data_referencia: '15/09/2026',
      dados: {
        // Gera duplicatas para os últimos 5 registros
        Numero: `619888800${i >= 45 ? 44 : i}`,
      },
    }))

    const res80 = Array.from({ length: 35 }, (_, i) => ({
      id: `r-80-${i}`,
      loja: 'CELNET AGUAS CLARAS',
      vendedor: `VENDEDOR ${(i % 3) + 1}`,
      ocorrencias: 'Enviado Fatura(s)',
      nr_contrato: `CTR-80-${i >= 30 ? 29 : i}`,
      data_referencia: '15/09/2026',
      dados: { NR_CONTRATO: `CTR-80-${i >= 30 ? 29 : i}` },
    }))

    const mockVendorCol = {
      getFullList: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    }

    const movelGetFullList = vi.fn().mockResolvedValue(movel80)
    const resGetFullList = vi.fn().mockResolvedValue(res80)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return { getFullList: movelGetFullList } as any
      if (name === 'residencial') return { getFullList: resGetFullList } as any
      if (name === 'vendor_consolidations') return mockVendorCol as any
      return {} as any
    })

    const result = await reconsolidarLojaReferencia('CELNET AGUAS CLARAS', '15/09/2026')

    expect(result.success).toBe(true)

    // Validar que foi passado batch: 2000 em ambas as chamadas getFullList
    expect(movelGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: 2000,
      }),
    )
    expect(resGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: 2000,
      }),
    )

    // 50 móvel (com 5 duplicatas -> 45 únicos) + 35 residencial (com 5 duplicatas -> 30 únicos) = 75 linhas únicas
    expect(fpdService.saveFpdRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-beta-id',
        referente: '15/09/2026',
        total_linhas: 75,
        accumulate: false,
      }),
    )
  })

  it('não falha e não bloqueia se ocorrer erro (best-effort)', async () => {
    vi.mocked(pb.collection).mockImplementation(() => {
      throw new Error('Network error')
    })

    const result = await reconsolidarLojaReferencia('CELNET PLANALTINA DF', '10/09/2026')
    expect(result.success).toBe(false)
  })

  it('ignora quando loja ou referência forem valores sentinela ("TODAS" ou "NONE")', async () => {
    const res1 = await reconsolidarLojaReferencia('TODAS', '10/09/2026')
    expect(res1.success).toBe(false)
    expect(fpdService.saveFpdRecord).not.toHaveBeenCalled()

    const res2 = await reconsolidarLojaReferencia('CELNET PLANALTINA DF', 'TODAS')
    expect(res2.success).toBe(false)
    expect(fpdService.saveFpdRecord).not.toHaveBeenCalled()

    const res3 = await reconsolidarLojaReferencia('CELNET PLANALTINA DF', 'NONE')
    expect(res3.success).toBe(false)
    expect(fpdService.saveFpdRecord).not.toHaveBeenCalled()
  })
})
