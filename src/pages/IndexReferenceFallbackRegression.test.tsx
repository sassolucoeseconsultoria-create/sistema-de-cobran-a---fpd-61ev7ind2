import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Index } from '@/pages/Index'
import type { StoreRecord, FpdRecord } from '@/types/fpd'

// Regressão do Painel de Lojas vazio: quando a listagem dedicada de datas de
// referência falha (ou chega vazia) mas os registros (fpd_records) possuem
// referentes visíveis para o perfil, o painel deve derivar a referência mais
// recente dos registros, renderizar as linhas das lojas com totais e exibir
// as opções no seletor — nunca o estado "Nenhuma referência habilitada".

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

const mockRecords: FpdRecord[] = [
  {
    id: 'rec_aguas_1026',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '10/2026',
    importado_em: '2026-10-01T10:00:00Z',
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
    created: '2026-10-01T10:00:00Z',
    updated: '2026-10-01T10:00:00Z',
  },
  {
    id: 'rec_tag_1026',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_2',
    referente: '10/2026',
    importado_em: '2026-10-01T10:00:00Z',
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
    created: '2026-10-01T10:00:00Z',
    updated: '2026-10-01T10:00:00Z',
  },
  {
    id: 'rec_aguas_0926',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '09/2026',
    importado_em: '2026-09-01T10:00:00Z',
    total_linhas: 1200,
    fatura_paga: 400,
    envio_fatura: 250,
    promessa_pagto: 150,
    sem_contato: 90,
    cancelados: 40,
    pendente: 120,
    contato_realizado: 150,
    nao_tratados: 100,
    outros: 0,
    created: '2026-09-01T10:00:00Z',
    updated: '2026-09-01T10:00:00Z',
  },
]

type DistinctDatesMode = 'reject' | 'empty' | 'ok'

let mockDistinctDatesMode: DistinctDatesMode = 'reject'
let mockDistinctDatesValue: string[] = []

vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockImplementation(() => Promise.resolve(mockStores)),
  fetchFpdRecords: vi.fn().mockImplementation(() => Promise.resolve(mockRecords)),
  fetchDistinctReferenceDates: vi.fn().mockImplementation(() => {
    if (mockDistinctDatesMode === 'reject') {
      return Promise.reject(new Error('falha simulada na listagem de referências'))
    }
    return Promise.resolve(mockDistinctDatesValue)
  }),
  deleteFpdRecord: vi.fn().mockResolvedValue(true),
  clearAllFpdRecords: vi.fn().mockResolvedValue(true),
  clearAllStores: vi.fn().mockResolvedValue(true),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(true),
  fetchFpdRecordsByStore: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/referenceDatePermissionService', () => ({
  fetchReferenceDatePermissions: vi.fn().mockResolvedValue([]),
  filterReferenceDatesForRole: vi.fn().mockImplementation((dates) => dates),
  isReferenceDateAllowedForRole: vi.fn().mockImplementation(() => true),
  normalizeReferenceDate: vi.fn().mockImplementation((d) => (d ? String(d).trim() : '')),
  sortReferenceDatesDesc: vi.fn().mockImplementation((dates: string[]) => [...dates].reverse()),
}))

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

function renderIndex() {
  return render(
    <MemoryRouter>
      <Index />
    </MemoryRouter>,
  )
}

describe('Index (Painel de Lojas) - Fallback de referência derivada dos registros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDistinctDatesMode = 'reject'
    mockDistinctDatesValue = []
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  it('1. fetchDistinctReferenceDates rejeita: tabela mostra as lojas com totais da referência mais recente (10/2026) e o seletor exibe a referência derivada', async () => {
    renderIndex()

    // Tabela renderiza as lojas (sem estado vazio)
    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })
    expect(screen.getByText('CELNET TAGUATINGA')).toBeDefined()

    // Totais por loja (formatados pt-BR): 1.585 e 567
    expect(screen.getByText('1.585')).toBeDefined()
    expect(screen.getByText('567')).toBeDefined()

    // Soma 1.585 + 567 = 2.152 no rodapé/banner
    await waitFor(() => {
      const totalElements = screen.getAllByText('2.152')
      expect(totalElements.length).toBeGreaterThan(0)
    })

    // Faturas pagas: 500 + 200 = 700
    const faturasPagasElements = screen.getAllByText('700')
    expect(faturasPagasElements.length).toBeGreaterThan(0)

    // Card de referência mostra a referência derivada mais recente
    await waitFor(() => {
      expect(screen.getByText('Ref: 10/2026')).toBeDefined()
    })

    // Nada de estado vazio
    expect(screen.queryByText(/Nenhuma referência habilitada/i)).toBeNull()
    expect(screen.queryByText(/Nenhum arquivo importado ainda/i)).toBeNull()

    // Seletor exibe as opções derivadas dos registros, ordenadas (mais recente primeiro)
    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())
    expect(options.some((txt) => txt.includes('10/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('09/2026'))).toBe(true)
    expect(options.some((txt) => txt.includes('Nenhuma referência habilitada'))).toBe(false)
  })

  it('2. fetchDistinctReferenceDates retorna []: o mesmo fallback se aplica (tabela com dados e seletor populado)', async () => {
    mockDistinctDatesMode = 'empty'
    renderIndex()

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    await waitFor(() => {
      const totalElements = screen.getAllByText('2.152')
      expect(totalElements.length).toBeGreaterThan(0)
    })

    expect(screen.getByText('Ref: 10/2026')).toBeDefined()
    expect(screen.queryByText(/Nenhuma referência habilitada/i)).toBeNull()

    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement
    const options = Array.from(dateSelect.options).map((o) => o.text.trim())
    expect(options.some((txt) => txt.includes('10/2026'))).toBe(true)
  })

  it('3. Sem nenhum registro com referente visível: o estado genuinamente vazio é preservado', async () => {
    vi.mocked((await import('@/services/fpdService')).fetchFpdRecords).mockImplementation(() =>
      Promise.resolve(mockRecords.map((r) => ({ ...r, referente: '' }))),
    )

    renderIndex()

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma referência habilitada para o seu perfil/i)).toBeDefined()
    })
  })
})
