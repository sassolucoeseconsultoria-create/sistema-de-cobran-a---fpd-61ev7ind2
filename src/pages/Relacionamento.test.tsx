import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    fetchDistinctAnalyticalLojas: vi
      .fn()
      .mockResolvedValue(['CELNET AGUAS CLARA', 'CELNET MATRIZ PLANALTINA DF']),
    insertMovelBatch: vi.fn(),
    insertResidencialBatch: vi.fn(),
    invalidateAnalyticalCache: vi.fn(),
  }
})

// Mock fpdService
vi.mock('@/services/fpdService', () => {
  return {
    fetchStores: vi.fn().mockResolvedValue([
      { id: 'store_1', name: 'CELNET AGUAS CLARA' },
      { id: 'store_2', name: 'CELNET MATRIZ PLANALTINA DF' },
    ]),
    matchStore: vi.fn((name) => {
      if (name?.includes('AGUAS')) return { id: 'store_1', name: 'CELNET AGUAS CLARA' }
      if (name?.includes('PLANALTINA'))
        return { id: 'store_2', name: 'CELNET MATRIZ PLANALTINA DF' }
      return null
    }),
  }
})

describe('Relacionamento - Filtro de Loja e Totais nos Badges', () => {
  const createMockAuth = () => ({
    user: {
      id: 'usr_adm',
      collectionId: 'users',
      collectionName: 'users',
      email: 'adm@celnet.com.br',
      name: 'Administrador',
      role: 'ADM' as const,
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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue(createMockAuth())

    // Mock collection getList and getFullList
    const mockMovel = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        const filter = options?.filter || ''
        // If filter is specific to a loja without records (e.g. CELNET PLANALTINA GO or 0 records)
        if (filter.includes('CELNET PLANALTINA GO')) {
          return Promise.resolve({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            perPage: 25,
          })
        }
        if (filter.includes('CELNET AGUAS CLARA')) {
          return Promise.resolve({
            items: [
              {
                id: 'm1',
                linha: 2,
                loja: 'CELNET AGUAS CLARA',
                cliente: 'Cliente Teste Aguas',
                vendedor: 'Vendedor Teste',
                ocorrencias: 'Não Tratados',
                dados: {},
              },
            ],
            totalItems: 15,
            totalPages: 1,
            page: 1,
            perPage: 25,
          })
        }
        // Total global or default
        return Promise.resolve({
          items: [
            {
              id: 'm2',
              linha: 1,
              loja: 'CELNET MATRIZ PLANALTINA DF',
              cliente: 'Cliente Planaltina',
              vendedor: 'Vendedor 2',
              ocorrencias: 'Não Tratados',
              dados: {},
            },
          ],
          totalItems: 147,
          totalPages: 6,
          page: 1,
          perPage: 25,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([]),
    }

    const mockResidencial = {
      getList: vi.fn().mockImplementation((page, perPage, options) => {
        const filter = options?.filter || ''
        if (filter.includes('CELNET PLANALTINA GO')) {
          return Promise.resolve({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            perPage: 25,
          })
        }
        if (filter.includes('CELNET AGUAS CLARA')) {
          return Promise.resolve({
            items: [
              {
                id: 'r1',
                linha: 2,
                loja: 'CELNET AGUAS CLARA',
                cliente: 'Cliente Residencial Aguas',
                vendedor: 'Vendedor Res',
                ocorrencias: 'Fatura(s) Paga(s)',
                dados: {},
              },
            ],
            totalItems: 6,
            totalPages: 1,
            page: 1,
            perPage: 25,
          })
        }
        return Promise.resolve({
          items: [],
          totalItems: 98,
          totalPages: 4,
          page: 1,
          perPage: 25,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return mockMovel as any
      if (name === 'residencial') return mockResidencial as any
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })
  })

  it('exibe contagens corretas ao selecionar loja específica nos badges e na tabela', async () => {
    const user = userEvent.setup()
    render(<Relacionamento />)

    // Initially when "Todas as Lojas" is active, totals are 147 and 98
    await waitFor(() => {
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
    })

    // Badges should reflect the global counts initially
    await waitFor(() => {
      expect(screen.getByText('147')).toBeDefined()
      expect(screen.getByText('98')).toBeDefined()
    })

    // Now select "CELNET AGUAS CLARA" in the loja selector
    const storeSelectTrigger = screen.getByRole('combobox', { name: /loja:/i })
    expect(storeSelectTrigger).toBeDefined()
    await user.click(storeSelectTrigger)

    const option = await screen.findByRole('option', { name: /CELNET AGUAS CLARA/i })
    await user.click(option)

    // The badge for Móvel should now update to 15 (count of Aguas Clara in Móvel)
    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined()
    })

    // Verify Clientes Móvel table displays the row for Aguas Clara
    await waitFor(() => {
      expect(screen.getByText('Cliente Teste Aguas')).toBeDefined()
    })
  })

  it('mostra 0 nos badges e estado vazio quando loja não possui registros', async () => {
    // Add a store with 0 records to distinct analytical lojas
    const { fetchDistinctAnalyticalLojas } = await import('@/services/relacionamentoService')
    vi.mocked(fetchDistinctAnalyticalLojas).mockResolvedValueOnce([
      'CELNET AGUAS CLARA',
      'CELNET MATRIZ PLANALTINA DF',
      'CELNET PLANALTINA GO',
    ])

    const user = userEvent.setup()
    render(<Relacionamento />)

    await waitFor(() => {
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
    })

    const storeSelectTrigger = screen.getByRole('combobox', { name: /loja:/i })
    await user.click(storeSelectTrigger)

    const option = await screen.findByRole('option', { name: /CELNET PLANALTINA GO/i })
    await user.click(option)

    // Móvel badge should now be 0
    await waitFor(() => {
      expect(screen.getByText('0')).toBeDefined()
    })

    // Table should show empty message
    await waitFor(() => {
      expect(screen.getByText(/nenhum cliente móvel encontrado/i)).toBeDefined()
    })
  })
})
