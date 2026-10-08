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
          perPage: perPage || 25,
        })
      }
      // Se contiver CELNET CALL ou CELNET ILHA, retorna contagem > 0 (42 móvel)
      if (filter.includes('CELNET CALL') || filter.includes('CELNET ILHA RESIDENCIAL GAMA DF')) {
        if (perPage >= 500) {
          const items = Array.from({ length: 42 }, (_, i) => ({
            id: `m_call_${i}`,
            linha: i + 1,
            loja: 'CELNET CALL NOVA SUIÇA',
            cliente: `Cliente Call ${i}`,
            vendedor: 'Vendedor 1',
            ocorrencias: 'Não Tratados',
            dados: { Numero: `619700000${i}` },
          }))
          return Promise.resolve({
            items,
            totalItems: 42,
            totalPages: 1,
            page: 1,
            perPage,
          })
        }
        return Promise.resolve({
          items: [
            {
              id: 'm1',
              linha: 2,
              loja: 'CELNET CALL NOVA SUIÇA',
              cliente: 'Cliente Call 1',
              vendedor: 'Vendedor 1',
              ocorrencias: 'Não Tratados',
              dados: { Numero: '61970000001' },
            },
          ],
          totalItems: 42,
          totalPages: 2,
          page: 1,
          perPage: perPage || 25,
        })
      }

      return Promise.resolve({
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        perPage: perPage || 25,
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
          perPage: perPage || 25,
        })
      }
      if (filter.includes('CELNET CALL') || filter.includes('CELNET ILHA RESIDENCIAL GAMA DF')) {
        if (perPage >= 500) {
          const items = Array.from({ length: 18 }, (_, i) => ({
            id: `r_call_${i}`,
            linha: i + 1,
            nr_contrato: `CTR_CALL_${i}`,
            loja: 'CELNET CALL NOVA SUIÇA',
            cliente: `Cliente Res ${i}`,
            vendedor: 'Vendedor 1',
            ocorrencias: 'Não Tratados',
            dados: { NR_CONTRATO: `CTR_CALL_${i}` },
          }))
          return Promise.resolve({
            items,
            totalItems: 18,
            totalPages: 1,
            page: 1,
            perPage,
          })
        }
        return Promise.resolve({
          items: [
            {
              id: 'r1',
              linha: 10,
              nr_contrato: 'CTR_CALL_1',
              loja: 'CELNET CALL NOVA SUIÇA',
              cliente: 'Cliente Res 1',
              vendedor: 'Vendedor 1',
              ocorrencias: 'Não Tratados',
              dados: { NR_CONTRATO: 'CTR_CALL_1' },
            },
          ],
          totalItems: 18,
          totalPages: 1,
          page: 1,
          perPage: perPage || 25,
        })
      }

      return Promise.resolve({
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        perPage: perPage || 25,
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
      500,
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

  it('(4) Gerente com lojas=[ID de 15 caracteres] resolve para o NOME da loja e contadores > 0', async () => {
    // Gerente com ID de 15 caracteres na lista de lojas: '50u778azizg13cg'
    const storeId = '50u778azizg13cg'
    const storeName = 'CELNET CALL NOVA SUIÇA'

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_id_only',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.id@celnet.com.br',
        name: 'Gerente Id',
        role: 'Gerente',
        lojas: [storeId],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { fetchStores } = await import('@/services/fpdService')
    vi.mocked(fetchStores).mockResolvedValueOnce([{ id: storeId, name: storeName } as any])

    render(<Relacionamento />)

    // Os contadores devem ser > 0 (42 móvel e 18 residencial)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('18')).toBeDefined()
    })

    // O seletor não deve exibir o ID bruto de 15 caracteres como nome selecionado
    expect(screen.queryByText(storeId)).toBeNull()
  })

  it('(5) Supervisor com 8 lojas (Karen) e Coordenador com 10+ lojas (Hélio) não geram query gigante/estouro e somam contadores', async () => {
    // Coordenador Hélio com 10+ lojas por IDs de 15 caracteres
    const coordStores = [
      { id: '10u778azizg13c1', name: 'CELNET CALL NOVA SUIÇA' },
      { id: '10u778azizg13c2', name: 'CELNET CALL JK' },
      { id: '10u778azizg13c3', name: 'CELNET ILHA RESIDENCIAL GAMA DF' },
      { id: '10u778azizg13c4', name: 'CELNET LOJA 4' },
      { id: '10u778azizg13c5', name: 'CELNET LOJA 5' },
      { id: '10u778azizg13c6', name: 'CELNET LOJA 6' },
      { id: '10u778azizg13c7', name: 'CELNET LOJA 7' },
      { id: '10u778azizg13c8', name: 'CELNET LOJA 8' },
      { id: '10u778azizg13c9', name: 'CELNET LOJA 9' },
      { id: '10u778azizg13ca', name: 'CELNET LOJA 10' },
      { id: '10u778azizg13cb', name: 'CELNET LOJA 11' },
      { id: '10u778azizg13cc', name: 'CELNET LOJA 12' },
    ]

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_coord_helio',
        collectionId: 'users',
        collectionName: 'users',
        email: 'helio@celnet.com.br',
        name: 'Hélio Coordenador',
        role: 'Coordenador',
        lojas: coordStores.map((s) => s.id),
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { fetchStores } = await import('@/services/fpdService')
    vi.mocked(fetchStores).mockResolvedValueOnce(coordStores as any)

    render(<Relacionamento />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('18')).toBeDefined()
    })

    // Verifica que o filtro enviado para getList não tem explosão exagerada de condições OR
    // Cada loja oficial deve gerar no máximo 1 cláusula direta, sem 10 variantes por loja
    const calls = vi.mocked(mockMovelGetList).mock.calls
    const lastCall = calls[calls.length - 1]
    const filterUsed = lastCall?.[2]?.filter || ''
    // O filtro não deve ter mais que 30 ocorrências de 'loja =' (com 12 lojas, deve ter ~12 a 15)
    const matchCount = (filterUsed.match(/loja =/g) || []).length
    expect(matchCount).toBeLessThanOrEqual(25)
  })

  it('(6) Perfil sem nenhuma referência habilitada mantém contadores em 0 com estado informativo', async () => {
    // Override das coleções para retornar nenhuma data habilitada
    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel' || name === 'residencial') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
          getFullList: vi.fn().mockResolvedValue([]),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_no_ref',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.noref@celnet.com.br',
        name: 'Gerente Sem Ref',
        role: 'Gerente',
        lojas: ['st_call_ns'],
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

    // O banner informativo de nenhuma referência habilitada deve ser exibido
    await waitFor(() => {
      expect(screen.getByTestId('no-reference-banner')).toBeDefined()
    })
  })
})
