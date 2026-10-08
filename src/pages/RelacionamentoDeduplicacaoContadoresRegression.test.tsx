import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Relacionamento } from './Relacionamento'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'

// Mock pocketbase client
vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

// Mock relacionamentoService
vi.mock('@/services/relacionamentoService', () => {
  return {
    fetchDistinctAnalyticalLojas: vi.fn().mockResolvedValue(['CELNET AGUAS CLARAS']),
    insertMovelBatch: vi.fn(),
    insertResidencialBatch: vi.fn(),
    invalidateAnalyticalCache: vi.fn(),
    clearAllAnalyticalRows: vi.fn(),
  }
})

// Mock mensagensService
vi.mock('@/services/mensagensService', () => {
  return {
    fetchMensagensPorFaixa: vi.fn().mockResolvedValue([]),
  }
})

// Mock fpdService
vi.mock('@/services/fpdService', () => {
  return {
    fetchStores: vi.fn().mockResolvedValue([{ id: 'st_aguas', name: 'CELNET AGUAS CLARAS' }]),
    matchStore: vi.fn((name: string, stores: any[]) => {
      if (!name || !stores) return null
      return (
        stores.find((s) => s.name === name || s.name.includes(name) || name.includes(s.name)) ||
        null
      )
    }),
    normalizeStoreString: (str: unknown) => {
      if (!str) return ''
      return String(str).toLowerCase().trim()
    },
  }
})

describe('Inadimplência - Alinhamento com Total Deduplicado Canônico (Regressão 30/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Logado como Administrador para ver todas as lojas e referências
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_adm_dedup',
        collectionId: 'users',
        collectionName: 'users',
        email: 'adm@celnet.com.br',
        name: 'Administrador Dedup',
        role: 'ADM',
        lojas: [],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  it('exibe contadores deduplicados canônicos: base com 2 linhas Móvel com mesmo número e 2 Residencial com contratos distintos → total da Inadimplência exibe 3 (1 Móvel + 2 Residencial), e não 4', async () => {
    // Cenário do teste exigido:
    // 2 linhas Móvel com o mesmo número (ex: 61981112233) -> deduplicado = 1
    // 2 linhas Residencial com contratos distintos (CTR_101 e CTR_102) -> deduplicado = 2
    // Contador Móvel = 1
    // Contador Residencial = 2
    // Total Geral Inadimplência (Móvel + Residencial) = 3 (não 4 bruto)

    const movelRecords = [
      {
        id: 'm_row_1',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        vendedor: 'VENDEDOR A',
        data_referencia: '30/09/2026',
        ocorrencias: 'Não Tratados',
        dados: {
          Numero: '61981112233',
          Linha: '61981112233',
        },
      },
      {
        id: 'm_row_2',
        linha: 3,
        loja: 'CELNET AGUAS CLARAS',
        vendedor: 'VENDEDOR A',
        data_referencia: '30/09/2026',
        ocorrencias: 'Não Tratados',
        dados: {
          Numero: '61981112233', // MESMO NÚMERO -> duplicata canônica
          Linha: '61981112233',
        },
      },
    ]

    const residencialRecords = [
      {
        id: 'r_row_1',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        nr_contrato: 'CTR_101',
        vendedor: 'VENDEDOR B',
        data_referencia: '30/09/2026',
        ocorrencias: 'Não Tratados',
        dados: {
          NR_CONTRATO: 'CTR_101',
        },
      },
      {
        id: 'r_row_2',
        linha: 3,
        loja: 'CELNET AGUAS CLARAS',
        nr_contrato: 'CTR_102', // CONTRATO DISTINTO
        vendedor: 'VENDEDOR B',
        data_referencia: '30/09/2026',
        ocorrencias: 'Não Tratados',
        dados: {
          NR_CONTRATO: 'CTR_102',
        },
      },
    ]

    const mockMovelCol = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        return Promise.resolve({
          items: movelRecords,
          totalItems: 2, // 2 linhas físicas brutas
          totalPages: 1,
          page: 1,
          perPage,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    const mockResidencialCol = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        return Promise.resolve({
          items: residencialRecords,
          totalItems: 2, // 2 linhas físicas brutas
          totalPages: 1,
          page: 1,
          perPage,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return mockMovelCol as any
      if (name === 'residencial') return mockResidencialCol as any
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    render(<Relacionamento />)

    // Aguarda carregamento inicial
    await waitFor(() => {
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
      expect(screen.getByText('Clientes Residencial')).toBeDefined()
    })

    // Contador de Móvel deve ser deduplicado = 1 (mesmo número em 2 linhas)
    // Contador de Residencial deve ser = 2 (contratos distintos)
    await waitFor(() => {
      const movelBadge = screen.getByRole('button', { name: /Clientes Móvel/i })
      const resBadge = screen.getByRole('button', { name: /Clientes Residencial/i })

      expect(movelBadge.textContent).toContain('1')
      expect(resBadge.textContent).toContain('2')
    })

    // Total deduplicado exibido na tela deve ser 3 (1 + 2), e NÃO 4 (2 + 2 brutos)
    await waitFor(() => {
      // O banner superior "Total de Clientes" deve somar 3
      expect(screen.getByText('3')).toBeDefined()
      // Não deve exibir 4 no total consolidado
      expect(screen.queryByText('4')).toBeNull()
    })
  })

  it('ignora linhas com chave vazia/não extraível sem inflar os contadores de clientes', async () => {
    // Linhas com número vazio / contrato vazio não devem ser contadas
    const movelRecords = [
      {
        id: 'm_empty_1',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        vendedor: 'VENDEDOR A',
        data_referencia: '30/09/2026',
        dados: {}, // sem chave
      },
      {
        id: 'm_valid_1',
        linha: 3,
        loja: 'CELNET AGUAS CLARAS',
        vendedor: 'VENDEDOR A',
        data_referencia: '30/09/2026',
        dados: { Numero: '61981119999' },
      },
    ]

    const residencialRecords = [
      {
        id: 'r_empty_1',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        nr_contrato: '',
        dados: {},
      },
      {
        id: 'r_valid_1',
        linha: 3,
        loja: 'CELNET AGUAS CLARAS',
        nr_contrato: 'CTR_999',
        dados: { NR_CONTRATO: 'CTR_999' },
      },
    ]

    const mockMovelCol = {
      getList: vi.fn().mockResolvedValue({
        items: movelRecords,
        totalItems: 2,
        totalPages: 1,
        page: 1,
        perPage: 500,
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    const mockResidencialCol = {
      getList: vi.fn().mockResolvedValue({
        items: residencialRecords,
        totalItems: 2,
        totalPages: 1,
        page: 1,
        perPage: 500,
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return mockMovelCol as any
      if (name === 'residencial') return mockResidencialCol as any
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    render(<Relacionamento />)

    // Apenas as linhas com chave válida devem ser contadas (1 Móvel e 1 Residencial = total 2)
    await waitFor(() => {
      const movelBadge = screen.getByRole('button', { name: /Clientes Móvel/i })
      const resBadge = screen.getByRole('button', { name: /Clientes Residencial/i })

      expect(movelBadge.textContent).toContain('1')
      expect(resBadge.textContent).toContain('1')
      expect(screen.getByText('2')).toBeDefined()
    })
  })

  it('exclui linhas com loja vazia da contagem da Inadimplência via filtro (loja != "" && loja != null)', async () => {
    // 3 linhas no banco com referência 30/09/2026:
    // 1 Móvel válida com loja
    // 1 Residencial válida com loja
    // 1 Residencial com contrato válido mas loja vazia (caso das 26 linhas)
    const movelRecords = [
      {
        id: 'm_com_loja',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        vendedor: 'VENDEDOR A',
        data_referencia: '30/09/2026',
        dados: { Numero: '61981110001' },
      },
    ]

    const residencialRecords = [
      {
        id: 'r_com_loja',
        linha: 2,
        loja: 'CELNET AGUAS CLARAS',
        nr_contrato: 'CTR_COM_LOJA',
        vendedor: 'VENDEDOR B',
        data_referencia: '30/09/2026',
        dados: { NR_CONTRATO: 'CTR_COM_LOJA' },
      },
      {
        id: 'r_sem_loja',
        linha: 3,
        loja: '', // LOJA VAZIA
        nr_contrato: 'CTR_SEM_LOJA',
        vendedor: '',
        data_referencia: '30/09/2026',
        dados: { NR_CONTRATO: 'CTR_SEM_LOJA' },
      },
    ]

    let movelFilterReceived = ''
    let resFilterReceived = ''

    const mockMovelCol = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        movelFilterReceived = options?.filter || ''
        return Promise.resolve({
          items: movelRecords,
          totalItems: movelRecords.length,
          totalPages: 1,
          page: 1,
          perPage,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    const mockResidencialCol = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        resFilterReceived = options?.filter || ''
        // Se o filtro exclui loja vazia, só retorna r_com_loja
        const filtered = options?.filter?.includes('loja != ""')
          ? residencialRecords.filter((r) => !!r.loja)
          : residencialRecords
        return Promise.resolve({
          items: filtered,
          totalItems: filtered.length,
          totalPages: 1,
          page: 1,
          perPage,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '30/09/2026' }]),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return mockMovelCol as any
      if (name === 'residencial') return mockResidencialCol as any
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    render(<Relacionamento />)

    // O filtro de PocketBase DEVE conter (loja != "" && loja != null)
    await waitFor(() => {
      expect(movelFilterReceived).toContain('loja != "" && loja != null')
      expect(resFilterReceived).toContain('loja != "" && loja != null')
    })

    // Contadores: 1 Móvel + 1 Residencial = 2 total (a linha sem loja foi eliminada)
    await waitFor(() => {
      const movelBadge = screen.getByRole('button', { name: /Clientes Móvel/i })
      const resBadge = screen.getByRole('button', { name: /Clientes Residencial/i })

      expect(movelBadge.textContent).toContain('1')
      expect(resBadge.textContent).toContain('1')
      expect(screen.getByText('2')).toBeDefined()
    })
  })
})
