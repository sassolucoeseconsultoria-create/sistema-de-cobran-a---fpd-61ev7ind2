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

    // No seletor principal de data, 08/09/2026 deve estar disponível, mas 26/08/2026 não
    const primaryDateSelect = screen.getByDisplayValue(/Todas as referências/i) as HTMLSelectElement
    const options = Array.from(primaryDateSelect.options).map((o) => o.text.trim())

    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(false)
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
      expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
      expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(true)
    })
  })

  it('Supervisor em Ranking por Vendedor (/vendedores) não vê a data desabilitada no seletor', async () => {
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
      const dateSelect = screen.getByRole('combobox', {
        name: /filtrar por data de referência/i,
      }) as HTMLSelectElement
      const options = Array.from(dateSelect.options).map((o) => o.text.trim())
      expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
      expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(false)
    })
  })
})
