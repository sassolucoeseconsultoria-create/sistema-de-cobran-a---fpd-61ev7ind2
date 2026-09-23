import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Arquivos } from '@/pages/Arquivos'
import { Relacionamento } from '@/pages/Relacionamento'
import * as fpdService from '@/services/fpdService'

// Mock pocketbase
vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(),
  },
}))

// Mock fpdService
vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockResolvedValue([
    {
      id: 'store_1',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'Coord Leste',
      supervisao: 'Sup 1',
    },
  ]),
  fetchFpdRecords: vi.fn().mockResolvedValue([
    {
      id: 'rec_1',
      store: 'store_1',
      referente: '26/08/2026',
      fatura_paga: 10,
      total_linhas: 28,
      created: '2026-08-26',
    },
    {
      id: 'rec_2',
      store: 'store_1',
      referente: '08/09/2026',
      fatura_paga: 15,
      total_linhas: 35,
      created: '2026-09-08',
    },
    {
      id: 'rec_3',
      store: 'store_1',
      referente: '15/09/2026',
      fatura_paga: 20,
      total_linhas: 40,
      created: '2026-09-15',
    },
  ]),
  fetchDistinctReferenceDates: vi
    .fn()
    .mockResolvedValue(['15/09/2026', '08/09/2026', '26/08/2026']),
  fetchFpdRecordsByStore: vi.fn().mockResolvedValue([]),
  deleteFpdRecord: vi.fn().mockResolvedValue(true),
  clearAllFpdRecords: vi.fn().mockResolvedValue(true),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(true),
  clearAllStores: vi.fn().mockResolvedValue(true),
}))

// Mock referenceDatePermissionService
vi.mock('@/services/referenceDatePermissionService', () => ({
  fetchReferenceDatePermissions: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      referente: '26/08/2026',
      gerente: false,
      supervisor: false,
      coordenador: false,
    },
    {
      id: 'p2',
      referente: '08/09/2026',
      gerente: true,
      supervisor: true,
      coordenador: true,
    },
    {
      id: 'p3',
      referente: '15/09/2026',
      gerente: true,
      supervisor: true,
      coordenador: true,
    },
  ]),
  filterReferenceDatesForRole: vi.fn().mockImplementation((dates, role, permissions) => {
    if (!role || role === 'ADM') return dates
    return dates.filter((d: string) => {
      const p = permissions.find((perm: any) => perm.referente === d)
      if (!p) return true
      if (role === 'Supervisor') return p.supervisor !== false
      if (role === 'Gerente') return p.gerente !== false
      if (role === 'Coordenador') return p.coordenador !== false
      return true
    })
  }),
  isReferenceDateAllowedForRole: vi.fn().mockImplementation((date, role, permissions) => {
    if (!role || role === 'ADM') return true
    if (!date) return true
    const p = permissions.find((perm: any) => perm.referente === date)
    if (!p) return true
    if (role === 'Supervisor') return p.supervisor !== false
    if (role === 'Gerente') return p.gerente !== false
    if (role === 'Coordenador') return p.coordenador !== false
    return true
  }),
  normalizeReferenceDate: vi.fn().mockImplementation((d) => (d ? String(d).trim() : '')),
  sortReferenceDatesDesc: vi.fn().mockImplementation((dates: string[]) => {
    return [...dates].sort((a, b) => {
      const partsA = a.trim().split('/')
      const partsB = b.trim().split('/')
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(
          Number(partsA[2]),
          Number(partsA[1]) - 1,
          Number(partsA[0]),
        ).getTime()
        const dateB = new Date(
          Number(partsB[2]),
          Number(partsB[1]) - 1,
          Number(partsB[0]),
        ).getTime()
        if (!isNaN(dateA) && !isNaN(dateB)) return dateB - dateA
      }
      return b.localeCompare(a)
    })
  }),
  saveReferenceDatePermission: vi.fn(),
}))

describe('Pré-seleção Automática e Controle de Apresentação (Painel de Lojas e Inadimplência)', () => {
  const gerenteUser = {
    id: 'usr_gerente',
    collectionId: 'users',
    collectionName: 'users',
    email: 'gerente@celnet.com.br',
    name: 'Roberto Gerente',
    role: 'Gerente' as const,
    lojas: ['store_1'],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  const supervisorUser = {
    id: 'usr_supervisor',
    collectionId: 'users',
    collectionName: 'users',
    email: 'supervisor@celnet.com.br',
    name: 'Ana Supervisora',
    role: 'Supervisor' as const,
    lojas: ['store_1'],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  const admUser = {
    id: 'usr_adm',
    collectionId: 'users',
    collectionName: 'users',
    email: 'adm@celnet.com.br',
    name: 'Admin Master',
    role: 'ADM' as const,
    lojas: [],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pb.collection).mockReturnValue({
      getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
      getFullList: vi.fn().mockResolvedValue([]),
    } as any)
  })

  it('1. Perfil com MÚLTIPLAS referências habilitadas: pré-seleciona a mais recente habilitada (15/09/2026) no Painel de Lojas', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: gerenteUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const select = screen.getByRole('combobox', {
        name: /selecione a referência principal/i,
      }) as HTMLSelectElement
      // Deve ter selecionado automaticamente a mais recente habilitada (15/09/2026)
      expect(select.value).toBe('15/09/2026')
    })
  })

  it('2. Perfil com APENAS UMA referência habilitada: pré-seleciona ela e NÃO exibe opção "Todas as referências" no seletor', async () => {
    const { fetchReferenceDatePermissions } =
      await import('@/services/referenceDatePermissionService')
    // Apenas 08/09/2026 habilitada para Supervisor
    vi.mocked(fetchReferenceDatePermissions).mockResolvedValueOnce([
      {
        id: 'p1',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '26/08/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-08-26',
        updated: '2026-08-26',
      },
      {
        id: 'p2',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '08/09/2026',
        gerente: true,
        supervisor: true,
        coordenador: true,
        created: '2026-09-08',
        updated: '2026-09-08',
      },
      {
        id: 'p3',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '15/09/2026',
        gerente: true,
        supervisor: false, // desabilitada para supervisor
        coordenador: true,
        created: '2026-09-15',
        updated: '2026-09-15',
      },
    ])

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: supervisorUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const select = screen.getByRole('combobox', {
        name: /selecione a referência principal/i,
      }) as HTMLSelectElement
      const options = Array.from(select.options).map((o) => o.text.trim())

      // Não tem opção "Todas as referências"
      expect(options.some((o) => o.includes('Todas as referências'))).toBe(false)
      // Selecionou automaticamente a única habilitada
      expect(select.value).toBe('08/09/2026')
    })
  })

  it('3. Perfil com NENHUMA referência habilitada: exibe estado vazio amigável e não carrega dados bloqueados no Painel de Lojas', async () => {
    const { fetchReferenceDatePermissions } =
      await import('@/services/referenceDatePermissionService')
    // Todas desabilitadas para Supervisor
    vi.mocked(fetchReferenceDatePermissions).mockResolvedValueOnce([
      {
        id: 'p1',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '26/08/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-08-26',
        updated: '2026-08-26',
      },
      {
        id: 'p2',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '08/09/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-09-08',
        updated: '2026-09-08',
      },
      {
        id: 'p3',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '15/09/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-09-15',
        updated: '2026-09-15',
      },
    ])

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: supervisorUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          /Nenhuma referência habilitada para o seu perfil\. Fale com a Coordenação\./i,
        ),
      ).toBeDefined()
    })
  })

  it('4. ADM no Painel de Lojas: mantém comportamento com Todas as referências e default "all"', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const select = screen.getByRole('combobox', {
        name: /selecione a referência principal/i,
      }) as HTMLSelectElement
      expect(select.value).toBe('all')
      const options = Array.from(select.options).map((o) => o.text.trim())
      expect(options.some((o) => o.includes('Todas as referências'))).toBe(true)
    })
  })

  it('5. Inadimplência (/relacionamento): perfil com NENHUMA referência habilitada exibe aviso amigável sem dados', async () => {
    const { fetchReferenceDatePermissions } =
      await import('@/services/referenceDatePermissionService')
    vi.mocked(fetchReferenceDatePermissions).mockResolvedValueOnce([
      {
        id: 'p1',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '26/08/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-08-26',
        updated: '2026-08-26',
      },
      {
        id: 'p2',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '08/09/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-09-08',
        updated: '2026-09-08',
      },
      {
        id: 'p3',
        collectionId: 'reference_permissions',
        collectionName: 'reference_permissions',
        referente: '15/09/2026',
        gerente: false,
        supervisor: false,
        coordenador: false,
        created: '2026-09-15',
        updated: '2026-09-15',
      },
    ])

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: supervisorUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Relacionamento />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          /Nenhuma referência habilitada para o seu perfil\. Fale com a Coordenação\./i,
        ),
      ).toBeDefined()
    })
  })
})
