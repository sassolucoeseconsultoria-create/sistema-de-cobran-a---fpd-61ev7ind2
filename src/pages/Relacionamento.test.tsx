import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Relacionamento } from './Relacionamento'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { fetchMensagensPorFaixa } from '@/services/mensagensService'

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
    clearAllAnalyticalRows: vi.fn().mockResolvedValue({
      success: true,
      movelCount: 10,
      residencialCount: 5,
    }),
  }
})

// Mock mensagensService
vi.mock('@/services/mensagensService', () => {
  return {
    fetchMensagensPorFaixa: vi.fn().mockImplementation((faixa) => {
      if (faixa === '>15 dias') {
        return Promise.resolve([
          {
            id: 'msg-1',
            titulo: 'Lembrete Amigável',
            faixa_atraso: '>15 dias',
            texto: 'Olá! Notamos uma pendência recente. Segue o código PIX para regularização.',
            descricao: 'Abordagem inicial',
            ativo: true,
            ordem: 1,
            created: '2025-01-01',
            updated: '2025-01-01',
          },
        ])
      }
      if (faixa === '16 a 30 dias') {
        return Promise.resolve([
          {
            id: 'msg-2',
            titulo: 'Aviso de Bloqueio Parcial',
            faixa_atraso: '16 a 30 dias',
            texto: 'Prezado cliente, sua fatura está vencida há mais de 15 dias. Evite bloqueio.',
            descricao: 'Aviso 16-30d',
            ativo: true,
            ordem: 1,
            created: '2025-01-01',
            updated: '2025-01-01',
          },
        ])
      }
      // >30 dias: retorna vazio para testar empty state
      return Promise.resolve([])
    }),
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

  let mockMovelGetList: any
  let mockResidencialGetList: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue(createMockAuth())

    mockMovelGetList = vi.fn().mockImplementation((page, perPage, options) => {
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
      // Total global / TODAS
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
    })

    mockResidencialGetList = vi.fn().mockImplementation((page, perPage, options) => {
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
    })

    const mockMovel = {
      getList: mockMovelGetList,
      getFullList: vi.fn().mockResolvedValue([]),
    }

    const mockResidencial = {
      getList: mockResidencialGetList,
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
    // and Residencial should update to 6 (count of Aguas Clara in Residencial)
    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined()
      expect(screen.getByText('6')).toBeDefined()
    })

    // Verify Clientes Móvel table displays the row for Aguas Clara
    await waitFor(() => {
      expect(screen.getByText('Cliente Teste Aguas')).toBeDefined()
    })
  })

  it('contagem Móvel e Residencial mantêm a mesma loja selecionada após troca de aba', async () => {
    const user = userEvent.setup()
    render(<Relacionamento />)

    await waitFor(() => {
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
    })

    // Seleciona "CELNET AGUAS CLARA" na aba Móvel
    const storeSelectTrigger = screen.getByRole('combobox', { name: /loja:/i })
    await user.click(storeSelectTrigger)
    const option = await screen.findByRole('option', { name: /CELNET AGUAS CLARA/i })
    await user.click(option)

    // Verifica que os dois badges já refletem a loja selecionada (15 Móvel e 6 Residencial)
    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined()
      expect(screen.getByText('6')).toBeDefined()
    })

    // Troca para a aba "Clientes Residencial"
    const tabResidencial = screen.getByRole('button', { name: /Clientes Residencial/i })
    await user.click(tabResidencial)

    // A loja selecionada no seletor da aba Residencial deve permanecer "CELNET AGUAS CLARA"
    await waitFor(() => {
      expect(screen.getByText(/Loja:\s*CELNET AGUAS CLARA/i)).toBeDefined()
    })

    // A tabela Residencial deve exibir os dados da loja selecionada e NÃO de Planaltina
    await waitFor(() => {
      expect(screen.getByText('Cliente Residencial Aguas')).toBeDefined()
      expect(screen.queryByText('Cliente Planaltina')).toBeNull()
    })

    // Ambos os badges continuam sincronizados
    expect(screen.getByText('15')).toBeDefined()
    expect(screen.getByText('6')).toBeDefined()
  })

  it('mostra 0 nos badges e estado vazio quando loja não possui registros', async () => {
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

    // Badges should now both be 0
    await waitFor(() => {
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
    })

    // Table should show empty message
    await waitFor(() => {
      expect(screen.getByText(/nenhum cliente móvel encontrado/i)).toBeDefined()
    })

    // Troca para Residencial e também deve estar vazio com 0
    const tabResidencial = screen.getByRole('button', { name: /Clientes Residencial/i })
    await user.click(tabResidencial)

    await waitFor(() => {
      expect(screen.getByText(/nenhum cliente residencial encontrado/i)).toBeDefined()
    })
  })

  it('queries all records without store filter when ADM has TODAS selected', async () => {
    render(<Relacionamento />)

    await waitFor(() => {
      expect(mockMovelGetList).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          filter: undefined,
        }),
      )
      expect(mockResidencialGetList).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          filter: undefined,
        }),
      )
    })

    // Badges should display the sum of all stores (147 for movel, 98 for residencial)
    const movelBadges = await screen.findAllByText('147')
    expect(movelBadges.length).toBeGreaterThan(0)
    const resBadges = await screen.findAllByText('98')
    expect(resBadges.length).toBeGreaterThan(0)
  })

  it('para perfil Gerente, carrega automaticamente dados e contadores da loja vinculada e impede troca de loja', async () => {
    // Configura usuário logado com perfil Gerente vinculado à loja CELNET AGUAS CLARA
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_aguas',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.aguas@celnet.com.br',
        name: 'Gerente Águas Claras',
        role: 'Gerente',
        lojas: ['store_1'], // vinculada a CELNET AGUAS CLARA
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Relacionamento />)

    // Aguarda carregar
    await waitFor(() => {
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
    })

    // Badges devem exibir os totais da loja vinculada (15 Móvel e 6 Residencial) desde o primeiro instante
    await waitFor(() => {
      expect(screen.getByText('15')).toBeDefined()
      expect(screen.getByText('6')).toBeDefined()
    })

    // Total de clientes somado no banner superior (15 + 6 = 21)
    await waitFor(() => {
      expect(screen.getByText('21')).toBeDefined()
    })

    // Nunca deve ter chamado com filter: undefined (que somaria a rede inteira)
    expect(mockMovelGetList).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ filter: undefined }),
    )

    // O seletor de loja para o Gerente deve ser um elemento fixo/travado, não permitindo abrir dropdown para outras lojas
    expect(screen.queryByRole('combobox', { name: /loja:/i })).toBeNull()
    expect(screen.getByText(/Loja:/i)).toBeDefined()
    expect(screen.getByText(/CELNET AGUAS CLARA/i)).toBeDefined()

    // A tabela Móvel deve conter o registro da loja do Gerente
    await waitFor(() => {
      expect(screen.getByText('Cliente Teste Aguas')).toBeDefined()
      expect(screen.queryByText('Cliente Planaltina')).toBeNull()
    })

    // Troca para Residencial e confirma comportamento fixo e isolado
    const tabResidencial = screen.getByRole('button', { name: /Clientes Residencial/i })
    await user.click(tabResidencial)

    await waitFor(() => {
      expect(screen.getByText('Cliente Residencial Aguas')).toBeDefined()
      expect(screen.queryByText('Cliente Planaltina')).toBeNull()
    })
  })

  it('para perfil Gerente sem loja vinculada, exibe aviso amigável e contadores zerados sem vazar outras lojas', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_sem_loja',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.semloja@celnet.com.br',
        name: 'Gerente Sem Loja',
        role: 'Gerente',
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

    render(<Relacionamento />)

    // Deve exibir aviso em português para o Gerente sem loja
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma loja vinculada ao seu perfil de Gerente/i)).toBeDefined()
    })

    // Contadores devem ser 0
    await waitFor(() => {
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
    })

    // Não deve exibir registros de nenhuma loja
    expect(screen.queryByText('Cliente Teste Aguas')).toBeNull()
    expect(screen.queryByText('Cliente Planaltina')).toBeNull()
  })

  describe('Botões de Faixas de Atraso e Modal de Mensagens', () => {
    it('exibe os 3 botões com as cores/classes e textos corretos no topo da inadimplência', async () => {
      render(<Relacionamento />)

      const btnMenos30 = screen.getByTestId('btn-faixa-menos-30')
      const btn31a60 = screen.getByTestId('btn-faixa-31-60')
      const btnMaior90 = screen.getByTestId('btn-faixa-maior-90')

      expect(btnMenos30).toBeDefined()
      expect(btnMenos30.textContent).toContain('>15 dias')
      // Cor AMARELA / amber
      expect(btnMenos30.className).toContain('bg-amber-50')
      expect(btnMenos30.className).toContain('text-amber-800')

      expect(btn31a60).toBeDefined()
      expect(btn31a60.textContent).toContain('16 a 30 dias')
      // Cor LARANJA / orange
      expect(btn31a60.className).toContain('bg-orange-50')
      expect(btn31a60.className).toContain('text-orange-800')

      expect(btnMaior90).toBeDefined()
      expect(btnMaior90.textContent).toContain('>30 dias')
      // Cor VERMELHA / rose
      expect(btnMaior90.className).toContain('bg-rose-50')
      expect(btnMaior90.className).toContain('text-rose-800')
    })

    it('ao clicar no botão amarelo, abre modal com mensagens da faixa ">15 dias" e botão de copiar', async () => {
      const user = userEvent.setup()
      // Mock navigator.clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })
      Object.defineProperty(window, 'isSecureContext', { value: true, writable: true })

      render(<Relacionamento />)

      const btnMenos30 = screen.getByTestId('btn-faixa-menos-30')
      await user.click(btnMenos30)

      expect(fetchMensagensPorFaixa).toHaveBeenCalledWith('>15 dias')

      await waitFor(() => {
        expect(screen.getByText('Lembrete Amigável')).toBeDefined()
        expect(screen.getByText(/Segue o código PIX para regularização/i)).toBeDefined()
      })

      // Botão Copiar texto
      const copyBtn = screen.getByTestId('btn-copy-msg-1')
      expect(copyBtn).toBeDefined()
      await user.click(copyBtn)

      expect(writeTextMock).toHaveBeenCalledWith(
        'Olá! Notamos uma pendência recente. Segue o código PIX para regularização.',
      )

      await waitFor(() => {
        expect(screen.getByText('Copiado!')).toBeDefined()
      })
    })

    it('ao clicar na faixa sem mensagens, exibe o estado vazio amigável', async () => {
      const user = userEvent.setup()
      render(<Relacionamento />)

      const btnMaior90 = screen.getByTestId('btn-faixa-maior-90')
      await user.click(btnMaior90)

      expect(fetchMensagensPorFaixa).toHaveBeenCalledWith('>30 dias')

      await waitFor(() => {
        expect(
          screen.getByText('Nenhuma mensagem cadastrada para esta faixa de atraso'),
        ).toBeDefined()
      })
    })
  })
})
