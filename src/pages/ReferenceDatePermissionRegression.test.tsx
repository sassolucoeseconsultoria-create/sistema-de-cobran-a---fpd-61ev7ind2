import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Arquivos } from '@/pages/Arquivos'
import { Vendedores } from '@/pages/Vendedores'
import { TopOfensores } from '@/pages/TopOfensores'

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
  ]),
  fetchVendorConsolidations: vi.fn().mockResolvedValue([
    {
      id: 'vc_1',
      loja: 'CELNET AGUAS CLARAS',
      vendedor: 'Vendedor Aguas',
      referente: '26/08/2026',
      total_linhas: 28,
    },
    {
      id: 'vc_2',
      loja: 'CELNET AGUAS CLARAS',
      vendedor: 'Vendedor Aguas',
      referente: '08/09/2026',
      total_linhas: 35,
    },
  ]),
  fetchDistinctReferenceDates: vi.fn().mockResolvedValue(['08/09/2026', '26/08/2026']),
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
      gerente: true,
      supervisor: false, // desabilitada para supervisor
      coordenador: true,
    },
    {
      id: 'p2',
      referente: '08/09/2026',
      gerente: false, // desabilitada para gerente
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
  saveReferenceDatePermission: vi.fn(),
}))

describe('Integração de Filtros de Data de Referência por Perfil nas Telas', () => {
  const supervisorUser = {
    id: 'usr_sup',
    collectionId: 'users',
    collectionName: 'users',
    email: 'sup@celnet.com.br',
    name: 'Carlos Supervisor',
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

  it('Supervisor no Painel de Lojas (/arquivos) não vê a data desabilitada 26/08/2026 no seletor de referências', async () => {
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
      // O seletor de data de referência deve existir
      const dateSelects = screen.getAllByRole('combobox')
      expect(dateSelects.length).toBeGreaterThan(0)
    })

    // Supervisor só tem 1 data permitida (08/09/2026).
    // Conforme a nova regra de negócio:
    // - "Todas as referências" NÃO deve aparecer
    // - A única referência permitida deve ser selecionada automaticamente
    const primaryDateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement
    const options = Array.from(primaryDateSelect.options).map((o) => o.text.trim())

    expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(false)
    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(false)
    expect(primaryDateSelect.value).toBe('08/09/2026')
  })

  it('ADM no Painel de Lojas (/arquivos) vê todas as referências no seletor, mesmo com flag desabilitada para outros perfis', async () => {
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
      const primaryDateSelect = screen.getByDisplayValue(
        /Todas as referências/i,
      ) as HTMLSelectElement
      const options = Array.from(primaryDateSelect.options).map((o) => o.text.trim())
      expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(true)
      expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
      expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(true)
      expect(primaryDateSelect.value).toBe('all')
    })
  })

  it('Supervisor em Ranking por Vendedor (/vendedores) não vê a data desabilitada no seletor e auto-seleciona a única data quando length === 1', async () => {
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
        <Vendedores />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const dateSelects = screen.getAllByRole('combobox')
      expect(dateSelects.length).toBeGreaterThan(0)
    })

    const dateSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())

    // Supervisor tem apenas 1 data permitida: 'Todas as referências' deve estar ausente
    expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(false)
    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(false)
    expect(dateSelect.value).toBe('08/09/2026')
  })

  it('ADM em Ranking por Vendedor (/vendedores) com 2 referências vê a opção Todas as referências', async () => {
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
        <Vendedores />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const dateSelect = screen.getByDisplayValue(/Todas as referências/i) as HTMLSelectElement
      const options = Array.from(dateSelect.options).map((o) => o.text.trim())
      expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(true)
      expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
      expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(true)
    })
  })

  it('Supervisor em Principais Ofensores (/top-ofensores) não vê Todas as referências quando tem apenas 1 data', async () => {
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
        <TopOfensores />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const dateSelects = screen.getAllByRole('combobox')
      expect(dateSelects.length).toBeGreaterThan(0)
    })

    const dateSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())
    expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(false)
    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(dateSelect.value).toBe('08/09/2026')
  })

  it('Centralização no useAllowedReferenceDates: hasMultipleReferences e initialReferenceDate', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useAllowedReferenceDates } = await import('@/hooks/useAllowedReferenceDates')

    // 1. Cenário com perfil Supervisor (1 data permitida de 2)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: supervisorUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result: supResult } = renderHook(() => useAllowedReferenceDates())
    await waitFor(() => {
      expect(supResult.current.loading).toBe(false)
    })

    expect(supResult.current.allowedReferenceDates).toEqual(['08/09/2026'])
    expect(supResult.current.hasMultipleReferences).toBe(false)
    expect(supResult.current.initialReferenceDate).toBe('08/09/2026')

    // 2. Cenário com perfil ADM (2 datas permitidas)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result: admResult } = renderHook(() => useAllowedReferenceDates())
    await waitFor(() => {
      expect(admResult.current.loading).toBe(false)
    })

    expect(admResult.current.allowedReferenceDates.length).toBe(2)
    expect(admResult.current.hasMultipleReferences).toBe(true)
    expect(admResult.current.initialReferenceDate).toBe('all')
  })
})
