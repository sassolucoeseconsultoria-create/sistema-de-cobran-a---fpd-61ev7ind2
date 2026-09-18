import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Index } from '@/pages/Index'
import type { StoreRecord, FpdRecord } from '@/types/fpd'

// Mock pocketbase
vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(),
  },
  isSessionExpiredError: vi.fn().mockReturnValue(false),
}))

// Mock realtime
vi.mock('@/hooks/use-realtime', () => ({
  default: vi.fn(),
  useRealtime: vi.fn(),
}))

const mockStores: StoreRecord[] = [
  {
    id: 'store_1',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET AGUAS CLARAS',
    coordenacao: 'Coord Leste',
    supervisao: 'Sup 1',
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'store_2',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET TAGUATINGA',
    coordenacao: 'Coord Leste',
    supervisao: 'Sup 1',
    created: '2025-01-01',
    updated: '2025-01-01',
  },
]

// Mock de registros com 2 referências diferentes:
// Para 08/09/2026: loja 1 = 1.585 móvel/total, loja 2 = 567 residencial/total => Soma = 2.152 linhas!
// Para 26/08/2026: loja 1 = 100 linhas, loja 2 = 50 linhas => Soma = 150 linhas
const mockRecords: FpdRecord[] = [
  {
    id: 'rec_aguas_0809',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '08/09/2026',
    importado_em: '2026-09-08T10:00:00Z',
    total_linhas: 1585,
    fatura_paga: 500,
    envio_fatura: 300,
    promessa_pagto: 200,
    sem_contato: 100,
    cancelados: 50,
    pendente: 150,
    contato_realizado: 185,
    nao_tratados: 100,
    outros: 0,
    created: '2026-09-08T10:00:00Z',
    updated: '2026-09-08T10:00:00Z',
  },
  {
    id: 'rec_tag_0809',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_2',
    referente: '08/09/2026',
    importado_em: '2026-09-08T10:00:00Z',
    total_linhas: 567,
    fatura_paga: 200,
    envio_fatura: 100,
    promessa_pagto: 50,
    sem_contato: 30,
    cancelados: 20,
    pendente: 67,
    contato_realizado: 50,
    nao_tratados: 50,
    outros: 0,
    created: '2026-09-08T10:00:00Z',
    updated: '2026-09-08T10:00:00Z',
  },
  {
    id: 'rec_aguas_2608',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '26/08/2026',
    importado_em: '2026-08-26T10:00:00Z',
    total_linhas: 100,
    fatura_paga: 30,
    envio_fatura: 20,
    promessa_pagto: 10,
    sem_contato: 5,
    cancelados: 5,
    pendente: 15,
    contato_realizado: 10,
    nao_tratados: 5,
    outros: 0,
    created: '2026-08-26T10:00:00Z',
    updated: '2026-08-26T10:00:00Z',
  },
  {
    id: 'rec_tag_2608',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_2',
    referente: '26/08/2026',
    importado_em: '2026-08-26T10:00:00Z',
    total_linhas: 50,
    fatura_paga: 15,
    envio_fatura: 10,
    promessa_pagto: 5,
    sem_contato: 5,
    cancelados: 2,
    pendente: 8,
    contato_realizado: 3,
    nao_tratados: 2,
    outros: 0,
    created: '2026-08-26T10:00:00Z',
    updated: '2026-08-26T10:00:00Z',
  },
]

let mockDistinctDates = ['08/09/2026', '26/08/2026']

vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockImplementation(() => Promise.resolve(mockStores)),
  fetchFpdRecords: vi.fn().mockImplementation(() => Promise.resolve(mockRecords)),
  fetchDistinctReferenceDates: vi.fn().mockImplementation(() => Promise.resolve(mockDistinctDates)),
  deleteFpdRecord: vi.fn().mockResolvedValue(true),
  clearAllFpdRecords: vi.fn().mockResolvedValue(true),
  clearAllStores: vi.fn().mockResolvedValue(true),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(true),
  fetchFpdRecordsByStore: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/referenceDatePermissionService', () => ({
  fetchReferenceDatePermissions: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      referente: '26/08/2026',
      gerente: true,
      supervisor: false, // desabilitada para Supervisor
      coordenador: true,
    },
    {
      id: 'p2',
      referente: '08/09/2026',
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
}))

describe('Index (Painel de Lojas / Consolidado na rota "/") - Filtro de Referência', () => {
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

  const supervisorUser = {
    id: 'usr_sup',
    collectionId: 'users',
    collectionName: 'users',
    email: 'sup@celnet.com.br',
    name: 'Carlos Supervisor',
    role: 'Supervisor' as const,
    lojas: ['store_1', 'store_2'],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDistinctDates = ['08/09/2026', '26/08/2026']
  })

  it('1. ADM pode selecionar a referência 08/09/2026 e o total fecha exatamente em 2.152 linhas (idêntico à Inadimplência)', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    )

    // Aguardar carregamento da tabela
    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    // O seletor de referência deve estar presente
    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement
    expect(dateSelect).toBeDefined()

    // Como há 2 datas, deve existir a opção "Todas as referências"
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())
    expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(true)
    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(true)

    // Seleciona explicitamente a referência 08/09/2026
    await user.selectOptions(dateSelect, '08/09/2026')

    // Verificar se o card de Data de Referência exibe a data selecionada
    await waitFor(() => {
      expect(screen.getByText('Ref: 08/09/2026')).toBeDefined()
    })

    // Verificar valores das lojas no corpo da tabela:
    // CELNET AGUAS CLARAS para 08/09/2026 = 1.585
    // CELNET TAGUATINGA para 08/09/2026 = 567
    expect(screen.getByText('1.585')).toBeDefined()
    expect(screen.getByText('567')).toBeDefined()

    // O total no rodapé e no banner superior deve somar 1.585 + 567 = 2.152 linhas!
    // Faturas pagas: 500 + 200 = 700
    await waitFor(() => {
      const totalElements = screen.getAllByText('2.152')
      expect(totalElements.length).toBeGreaterThan(0)
    })

    const faturasPagasElements = screen.getAllByText('700')
    expect(faturasPagasElements.length).toBeGreaterThan(0)
  })

  it('2. Ao alternar para 26/08/2026, os totais recalculam conforme os registros daquela referência (100 + 50 = 150)', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement

    await user.selectOptions(dateSelect, '26/08/2026')

    await waitFor(() => {
      expect(screen.getByText('Ref: 26/08/2026')).toBeDefined()
    })

    // Totais de 26/08/2026: 100 + 50 = 150
    await waitFor(() => {
      const totalElements = screen.getAllByText('150')
      expect(totalElements.length).toBeGreaterThan(0)
    })

    // Faturas pagas: 30 + 15 = 45
    const faturaPagasElements = screen.getAllByText('45')
    expect(faturaPagasElements.length).toBeGreaterThan(0)
  })

  it('3. Perfil Supervisor: quando tem apenas 1 data autorizada (08/09/2026), auto-seleciona a data e oculta "Todas as referências"', async () => {
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
        <Index />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement

    // Supervisor só tem 08/09/2026 permitida (26/08/2026 tem supervisor: false)
    // Conforme a regra: "Todas as referências" NÃO deve aparecer e a data única deve estar selecionada
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())
    expect(options.some((txt) => txt.includes('Todas as referências'))).toBe(false)
    expect(options.some((txt) => txt.includes('08/09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('26/08/2026'))).toBe(false)

    expect(dateSelect.value).toBe('08/09/2026')
    expect(screen.getByText('Ref: 08/09/2026')).toBeDefined()

    // O total deve fechar automaticamente em 2.152
    await waitFor(() => {
      const totalElements = screen.getAllByText('2.152')
      expect(totalElements.length).toBeGreaterThan(0)
    })
  })
})
