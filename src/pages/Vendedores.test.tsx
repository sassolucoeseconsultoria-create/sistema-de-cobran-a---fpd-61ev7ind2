import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Vendedores } from './Vendedores'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { StoreRecord, VendorConsolidationRecord } from '@/types/fpd'

// Mock pocketbase client
vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

// Mock stores
const mockStores: StoreRecord[] = [
  {
    id: 'store_aguas',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET AGUAS CLARAS',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'store_taguatinga',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET TAGUATINGA',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'store_ceilandia',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET CEILANDIA',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
]

// Mock vendors
const mockVendors: VendorConsolidationRecord[] = [
  {
    id: 'v1',
    collectionId: 'vendor_consolidations',
    collectionName: 'vendor_consolidations',
    vendedor: 'Carlos Aguas',
    loja: 'CELNET AGUAS CLARAS',
    supervisao: 'Supervisão Centro-Sul',
    data_referencia: '10/2024',
    total_linhas: 50,
    fatura_paga: 10,
    envio_fatura: 5,
    promessa_pagto: 5,
    sem_contato: 2,
    cancelados: 1,
    pendente: 5,
    contato_realizado: 3,
    outros: 0,
    nao_tratados: 4,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'v2',
    collectionId: 'vendor_consolidations',
    collectionName: 'vendor_consolidations',
    vendedor: 'Mariana Taguatinga',
    loja: 'CELNET TAGUATINGA',
    supervisao: 'Supervisão Centro-Sul',
    data_referencia: '10/2024',
    total_linhas: 40,
    fatura_paga: 8,
    envio_fatura: 4,
    promessa_pagto: 3,
    sem_contato: 1,
    cancelados: 0,
    pendente: 2,
    contato_realizado: 2,
    outros: 0,
    nao_tratados: 1,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'v3',
    collectionId: 'vendor_consolidations',
    collectionName: 'vendor_consolidations',
    vendedor: 'Pedro Ceilandia',
    loja: 'CELNET CEILANDIA',
    supervisao: 'Supervisão Oeste',
    data_referencia: '10/2024',
    total_linhas: 30,
    fatura_paga: 5,
    envio_fatura: 2,
    promessa_pagto: 2,
    sem_contato: 1,
    cancelados: 0,
    pendente: 1,
    contato_realizado: 1,
    outros: 0,
    nao_tratados: 1,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
]

// Mock fpdService
vi.mock('@/services/fpdService', () => ({
  fetchVendorConsolidations: vi.fn().mockImplementation(() => Promise.resolve(mockVendors)),
  fetchStores: vi.fn().mockImplementation(() => Promise.resolve(mockStores)),
  fetchDistinctReferenceDates: vi.fn().mockResolvedValue(['10/2024']),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(3),
  matchStore: vi.fn((name: string, stores: StoreRecord[]) => {
    return stores.find((s) => s.name.toLowerCase() === (name || '').toLowerCase()) || null
  }),
}))

vi.mock('@/hooks/use-realtime', () => ({
  default: vi.fn(),
}))

describe('Vendedores - Regras de Perfil e Contadores de Clientes (Móvel e Residencial)', () => {
  let mockMovelGetList: any
  let mockResidencialGetList: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockMovelGetList = vi.fn().mockImplementation((_page, _perPage, options) => {
      const filter = options?.filter || ''
      // Se filtro contém AGUAS CLARA / AGUAS CLARAS
      if (filter.includes('AGUAS')) {
        return Promise.resolve({
          items: [],
          totalItems: 85,
          totalPages: 1,
          page: 1,
          perPage: 1,
        })
      }
      if (filter.includes('TAGUATINGA')) {
        return Promise.resolve({
          items: [],
          totalItems: 42,
          totalPages: 1,
          page: 1,
          perPage: 1,
        })
      }
      // Sem filtro ou global
      return Promise.resolve({
        items: [],
        totalItems: 180,
        totalPages: 1,
        page: 1,
        perPage: 1,
      })
    })

    mockResidencialGetList = vi.fn().mockImplementation((_page, _perPage, options) => {
      const filter = options?.filter || ''
      if (filter.includes('AGUAS')) {
        return Promise.resolve({
          items: [],
          totalItems: 34,
          totalPages: 1,
          page: 1,
          perPage: 1,
        })
      }
      if (filter.includes('TAGUATINGA')) {
        return Promise.resolve({
          items: [],
          totalItems: 19,
          totalPages: 1,
          page: 1,
          perPage: 1,
        })
      }
      return Promise.resolve({
        items: [],
        totalItems: 95,
        totalPages: 1,
        page: 1,
        perPage: 1,
      })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') {
        return {
          getList: mockMovelGetList,
          getFullList: vi.fn().mockResolvedValue([]),
        } as any
      }
      if (name === 'residencial') {
        return {
          getList: mockResidencialGetList,
          getFullList: vi.fn().mockResolvedValue([]),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })
  })

  it('Cenário 1: Gerente abre a página com seletor travado na loja vinculada e contadores Móvel e Residencial carregados', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_aguas',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.aguas@celnet.com.br',
        name: 'Gerente Águas Claras',
        role: 'Gerente',
        lojas: ['store_aguas'],
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
    render(
      <MemoryRouter>
        <Vendedores />
      </MemoryRouter>,
    )

    // Seletor travado com ícone de prédio e nome da loja vinculada
    await waitFor(() => {
      const lockedDisplay = screen.getByTestId('locked-store-display')
      expect(lockedDisplay).toBeDefined()
      expect(lockedDisplay.textContent).toMatch(/Loja:\s*CELNET AGUAS CLARAS/i)
    })

    // Não deve exibir dropdown editável de loja para o Gerente
    expect(screen.queryByRole('combobox', { name: /selecionar loja/i })).toBeNull()

    // Contadores Móvel (85) e Residencial (34) devem ser exibidos
    await waitFor(() => {
      expect(screen.getByText('85')).toBeDefined()
      expect(screen.getByText('34')).toBeDefined()
    })

    // Cards devem estar presentes
    expect(screen.getByTestId('card-clientes-movel')).toBeDefined()
    expect(screen.getByTestId('card-clientes-residencial')).toBeDefined()

    // A tabela deve exibir apenas o vendedor da loja do Gerente (Carlos Aguas) e nunca outra loja
    await waitFor(() => {
      expect(screen.getByText('Carlos Aguas')).toBeDefined()
      expect(screen.queryByText('Mariana Taguatinga')).toBeNull()
      expect(screen.queryByText('Pedro Ceilandia')).toBeNull()
    })

    // Nunca deve ter consultado movel ou residencial com filter undefined (somando a rede inteira)
    expect(mockMovelGetList).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ filter: undefined }),
    )

    // "Limpar filtros" (ao digitar busca) não reseta a loja para "all"
    const searchInput = screen.getByPlaceholderText(/buscar vendedor/i)
    await user.type(searchInput, 'inexistente')

    await waitFor(() => {
      expect(screen.getByText(/Nenhum vendedor encontrado/i)).toBeDefined()
    })

    const clearFiltersBtn = screen.getByRole('button', { name: /Limpar filtros/i })
    await user.click(clearFiltersBtn)

    // O seletor continua travado em Águas Claras
    expect(screen.getByTestId('locked-store-display').textContent).toMatch(
      /Loja:\s*CELNET AGUAS CLARAS/i,
    )
    await waitFor(() => {
      expect(screen.getByText('Carlos Aguas')).toBeDefined()
    })
  })

  it('Cenário 2: Gerente sem loja vinculada exibe banner de aviso em PT-BR e contadores zerados sem vazar dados', async () => {
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

    render(
      <MemoryRouter>
        <Vendedores />
      </MemoryRouter>,
    )

    // Banner de aviso deve estar presente
    await waitFor(() => {
      const banner = screen.getByTestId('gerente-sem-loja-banner')
      expect(banner).toBeDefined()
      expect(banner.textContent).toContain(
        'Seu perfil de Gerente ainda não possui uma loja vinculada pelo Administrador',
      )
    })

    // Contadores devem estar zerados
    await waitFor(() => {
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
    })

    // Nenhum vendedor deve ser exibido
    expect(screen.queryByText('Carlos Aguas')).toBeNull()
    expect(screen.queryByText('Mariana Taguatinga')).toBeNull()
    expect(screen.queryByText('Pedro Ceilandia')).toBeNull()
  })

  it('Cenário 3: Supervisor/Coordenador alternam entre lojas vinculadas e opção Todas', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_supervisor',
        collectionId: 'users',
        collectionName: 'users',
        email: 'supervisor@celnet.com.br',
        name: 'Supervisor Centro-Sul',
        role: 'Supervisor',
        lojas: ['store_aguas', 'store_taguatinga'],
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
    render(
      <MemoryRouter>
        <Vendedores />
      </MemoryRouter>,
    )

    // Supervisor tem dropdown de loja
    await waitFor(() => {
      const storeSelect = screen.getByRole('combobox', { name: /selecionar loja/i })
      expect(storeSelect).toBeDefined()
    })

    // Inicialmente em "Todas", exibe Carlos Aguas e Mariana Taguatinga, mas NUNCA Pedro Ceilandia
    await waitFor(() => {
      expect(screen.getByText('Carlos Aguas')).toBeDefined()
      expect(screen.getByText('Mariana Taguatinga')).toBeDefined()
      expect(screen.queryByText('Pedro Ceilandia')).toBeNull()
    })

    // Alterna para apenas "CELNET AGUAS CLARAS"
    const storeSelect = screen.getByRole('combobox', { name: /selecionar loja/i })
    await user.selectOptions(storeSelect, 'CELNET AGUAS CLARAS')

    await waitFor(() => {
      expect(screen.getByText('Carlos Aguas')).toBeDefined()
      expect(screen.queryByText('Mariana Taguatinga')).toBeNull()
    })

    // Contadores de clientes devem atualizar para a loja selecionada (85 Móvel e 34 Residencial)
    await waitFor(() => {
      expect(screen.getByText('85')).toBeDefined()
      expect(screen.getByText('34')).toBeDefined()
    })

    // Alterna para "CELNET TAGUATINGA"
    await user.selectOptions(storeSelect, 'CELNET TAGUATINGA')

    await waitFor(() => {
      expect(screen.queryByText('Carlos Aguas')).toBeNull()
      expect(screen.getByText('Mariana Taguatinga')).toBeDefined()
    })

    // Contadores de clientes devem atualizar para Taguatinga (42 Móvel e 19 Residencial)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('19')).toBeDefined()
    })
  })

  it('Cenário 4: ADM tem dropdown completo iniciando em Todas as Lojas', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_adm',
        collectionId: 'users',
        collectionName: 'users',
        email: 'adm@celnet.com.br',
        name: 'Administrador',
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

    render(
      <MemoryRouter>
        <Vendedores />
      </MemoryRouter>,
    )

    // Dropdown completo presente
    await waitFor(() => {
      const storeSelect = screen.getByRole('combobox', {
        name: /selecionar loja/i,
      }) as HTMLSelectElement
      expect(storeSelect).toBeDefined()
      expect(storeSelect.value).toBe('all')
    })

    // Exibe vendedores de todas as 3 lojas
    await waitFor(() => {
      expect(screen.getByText('Carlos Aguas')).toBeDefined()
      expect(screen.getByText('Mariana Taguatinga')).toBeDefined()
      expect(screen.getByText('Pedro Ceilandia')).toBeDefined()
    })

    // Contadores globais
    await waitFor(() => {
      expect(screen.getByText('180')).toBeDefined()
      expect(screen.getByText('95')).toBeDefined()
    })
  })
})
