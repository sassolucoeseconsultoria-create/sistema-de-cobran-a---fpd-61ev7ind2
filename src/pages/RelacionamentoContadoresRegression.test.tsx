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
    fetchDistinctAnalyticalLojas: vi
      .fn()
      .mockResolvedValue([
        'CELNET CALL NOVA SUIÇA',
        'CELNET CALL JK',
        'CELNET ILHA RESIDENCIAL GAMA DF',
      ]),
    insertMovelBatch: vi.fn(),
    insertResidencialBatch: vi.fn(),
    invalidateAnalyticalCache: vi.fn(),
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
    fetchStores: vi.fn().mockResolvedValue([
      { id: 'st_call_ns', name: 'CELNET CALL NOVA SUIÇA' },
      { id: 'st_call_jk', name: 'CELNET CALL JK' },
      { id: 'st_ilha_gama', name: 'CELNET ILHA RESIDENCIAL GAMA DF' },
      { id: 'st_aguas', name: 'CELNET AGUAS CLARA' },
    ]),
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

describe('RelacionamentoContadoresRegression - Perfis não-ADM com vínculo por NOME', () => {
  let mockMovelGetList: any
  let mockResidencialGetList: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockMovelGetList = vi.fn().mockImplementation((page, perPage, options) => {
      const filter = options?.filter || ''
      // Se não tiver acesso, retorna 0
      if (filter === '__NO_ACCESS__') {
        return Promise.resolve({
          items: [],
          totalItems: 0,
          totalPages: 1,
          page: 1,
          perPage: 25,
        })
      }
      // Se contiver CELNET CALL ou CELNET ILHA, retorna contagem > 0
      if (filter.includes('CELNET CALL') || filter.includes('CELNET ILHA RESIDENCIAL GAMA DF')) {
        return Promise.resolve({
          items: [
            {
              id: 'm1',
              linha: 2,
              loja: 'CELNET CALL NOVA SUIÇA',
              cliente: 'Cliente Call 1',
              vendedor: 'Vendedor 1',
              ocorrencias: 'Não Tratados',
              dados: {},
            },
          ],
          totalItems: 42,
          totalPages: 2,
          page: 1,
          perPage: 25,
        })
      }

      return Promise.resolve({
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        perPage: 25,
      })
    })

    mockResidencialGetList = vi.fn().mockImplementation((page, perPage, options) => {
      const filter = options?.filter || ''
      if (filter === '__NO_ACCESS__') {
        return Promise.resolve({
          items: [],
          totalItems: 0,
          totalPages: 1,
          page: 1,
          perPage: 25,
        })
      }
      if (filter.includes('CELNET CALL') || filter.includes('CELNET ILHA RESIDENCIAL GAMA DF')) {
        return Promise.resolve({
          items: [
            {
              id: 'r1',
              linha: 10,
              loja: 'CELNET CALL NOVA SUIÇA',
              cliente: 'Cliente Res 1',
              vendedor: 'Vendedor 1',
              ocorrencias: 'Não Tratados',
              dados: {},
            },
          ],
          totalItems: 18,
          totalPages: 1,
          page: 1,
          perPage: 25,
        })
      }

      return Promise.resolve({
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        perPage: 25,
      })
    })

    const mockMovel = {
      getList: mockMovelGetList,
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '10/09/2026' }]),
    }

    const mockResidencial = {
      getList: mockResidencialGetList,
      getFullList: vi.fn().mockResolvedValue([{ data_referencia: '10/09/2026' }]),
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

  it('(1) perfil Supervisor com vínculo por NOME vê contadores > 0', async () => {
    // Supervisor com loja vinculada por NOME (não por ID de 15 chars)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_sup_call',
        collectionId: 'users',
        collectionName: 'users',
        email: 'supervisor.call@celnet.com.br',
        name: 'Supervisor Call',
        role: 'Supervisor',
        lojas: ['CELNET CALL NOVA SUIÇA'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(<Relacionamento />)

    // Aguarda carregar e verifica se badges exibem os totais > 0 (42 móvel e 18 residencial)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('18')).toBeDefined()
    })
  })

  it('(2) variante de nome ("CELNET CALL NOVA SUIÇA" para vínculo "CELNET CALL") casa corretamente', async () => {
    // Supervisor cadastrado com "CELNET CALL", deve casar com "CELNET CALL NOVA SUIÇA"
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_sup_call_parent',
        collectionId: 'users',
        collectionName: 'users',
        email: 'supervisor.call@celnet.com.br',
        name: 'Supervisor Call Broad',
        role: 'Supervisor',
        lojas: ['CELNET CALL'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(<Relacionamento />)

    // Badges devem exibir > 0 (42 móvel e 18 residencial)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('18')).toBeDefined()
    })
  })

  it('(3) contadores não zeram prematuramente enquanto o escopo carrega e são calculados após a chegada das lojas', async () => {
    // Simula atraso na resolução de fetchStores e analytical lojas
    const { fetchStores } = await import('@/services/fpdService')
    let resolveStoresPromise: any
    const storesPromise = new Promise<any[]>((resolve) => {
      resolveStoresPromise = resolve
    })
    vi.mocked(fetchStores).mockReturnValueOnce(storesPromise)

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_sup_delayed',
        collectionId: 'users',
        collectionName: 'users',
        email: 'supervisor.delayed@celnet.com.br',
        name: 'Supervisor Delayed',
        role: 'Supervisor',
        lojas: ['CELNET ILHA RESIDENCIAL GAMA DF'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(<Relacionamento />)

    // Inicialmente durante o carregamento, não deve ter chamado getList com __NO_ACCESS__
    expect(mockMovelGetList).not.toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ filter: '__NO_ACCESS__' }),
    )

    // Agora resolve o carregamento das lojas
    resolveStoresPromise([{ id: 'st_ilha_gama', name: 'CELNET ILHA RESIDENCIAL GAMA DF' }])

    // Após resolução, os contadores devem ser buscados e refletir 42 e 18
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('18')).toBeDefined()
    })
  })
})
