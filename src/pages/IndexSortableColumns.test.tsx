import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Index } from '@/pages/Index'
import { exportConsolidatedToXlsx } from '@/lib/xlsxExport'
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

vi.mock('@/lib/xlsxExport', () => ({
  exportConsolidatedToXlsx: vi.fn(),
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
  {
    id: 'store_3',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET BRASILIA',
    coordenacao: 'Coord Oeste',
    supervisao: 'Sup 2',
    created: '2025-01-01',
    updated: '2025-01-01',
  },
]

// Ordem inicial de exibição (ordem de cadastro): AGUAS CLARAS (1.585),
// TAGUATINGA (567), BRASILIA (1.000) — deliberadamente fora de ordem numérica.
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
    id: 'rec_bsb_0809',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_3',
    referente: '08/09/2026',
    importado_em: '2026-09-08T10:00:00Z',
    total_linhas: 1000,
    fatura_paga: 350,
    envio_fatura: 220,
    promessa_pagto: 120,
    sem_contato: 80,
    cancelados: 30,
    pendente: 100,
    contato_realizado: 100,
    nao_tratados: 80,
    outros: 0,
    created: '2026-09-08T10:00:00Z',
    updated: '2026-09-08T10:00:00Z',
  },
]

let mockDistinctDates = ['08/09/2026']

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
  fetchReferenceDatePermissions: vi.fn().mockResolvedValue([]),
  filterReferenceDatesForRole: vi.fn().mockImplementation((dates: string[]) => dates),
  isReferenceDateAllowedForRole: vi.fn().mockReturnValue(true),
  normalizeReferenceDate: vi.fn().mockImplementation((d: string) => (d ? String(d).trim() : '')),
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

/** Lê a ordem das lojas no CORPO da tabela (linhas de dados, excluindo TOTAIS). */
function getBodyStoreOrder(): string[] {
  const tbody = document.querySelector('tbody')
  expect(tbody).not.toBeNull()
  return Array.from(tbody?.querySelectorAll('tr') ?? []).map((tr) => {
    const firstTd = tr.querySelector('td')
    return firstTd?.textContent?.trim() ?? ''
  })
}

function getHeaderButton(column: string): HTMLElement {
  const header = document.querySelector(`[data-testid="sortable-header-${column}"]`)
  expect(header).not.toBeNull()
  return header as HTMLElement
}

function getIndicatorClass(column: string): string {
  const indicator = document.querySelector(`[data-testid="sort-indicator-${column}"]`)
  expect(indicator).not.toBeNull()
  return (indicator as HTMLElement).className
}

async function renderIndex() {
  render(
    <MemoryRouter>
      <Index />
    </MemoryRouter>,
  )
  await waitFor(() => {
    expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
  })
}

describe('Index (Consolidado na rota "/") - Ordenação por clique no cabeçalho', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDistinctDates = ['08/09/2026']
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  it('1. 1º clique em TOTAL LINHAS ordena do MAIOR para o MENOR; 2º clique do MENOR para o MAIOR (alternância)', async () => {
    const user = userEvent.setup()
    await renderIndex()

    // Ordem inicial preservada (estado sem ordenação): AGUAS CLARAS, TAGUATINGA, BRASILIA
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET TAGUATINGA',
      'CELNET BRASILIA',
    ])

    // 1º clique: do maior para o menor (desc)
    await user.click(getHeaderButton('totalLinhas'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS', // 1.585
      'CELNET BRASILIA', // 1.000
      'CELNET TAGUATINGA', // 567
    ])

    // 2º clique: do menor para o maior (asc)
    await user.click(getHeaderButton('totalLinhas'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET TAGUATINGA', // 567
      'CELNET BRASILIA', // 1.000
      'CELNET AGUAS CLARAS', // 1.585
    ])

    // 3º clique: volta ao maior para o menor
    await user.click(getHeaderButton('totalLinhas'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET BRASILIA',
      'CELNET TAGUATINGA',
    ])
  })

  it('2. Indicador visual (seta) aparece na coluna ativa e muda de direção; colunas inativas ficam sem seta ativa', async () => {
    const user = userEvent.setup()
    await renderIndex()

    // Sem interação: nenhum indicador ativo
    expect(getIndicatorClass('totalLinhas')).not.toContain('text-[#67e8f9]')
    expect(screen.queryByTestId('sort-indicator-totalLinhas')).not.toBeNull()

    await user.click(getHeaderButton('totalLinhas'))
    // Ativa em desc: seta para baixo (classe do indicador ativo) + aria-sort
    expect(getIndicatorClass('totalLinhas')).toContain('text-[#67e8f9]')
    expect(
      document.querySelector('[data-sort-column="totalLinhas"]')?.getAttribute('aria-sort'),
    ).toBe('descending')
    // Coluna inativa não tem indicador ativo
    expect(getIndicatorClass('faturaPaga')).not.toContain('text-[#67e8f9]')

    await user.click(getHeaderButton('totalLinhas'))
    // Ativa em asc: seta para cima
    expect(
      document.querySelector('[data-sort-column="totalLinhas"]')?.getAttribute('aria-sort'),
    ).toBe('ascending')
  })

  it('3. Clicar numa coluna nova muda a ordenação para ela e remove a seta da anterior', async () => {
    const user = userEvent.setup()
    await renderIndex()

    await user.click(getHeaderButton('totalLinhas'))
    expect(getIndicatorClass('totalLinhas')).toContain('text-[#67e8f9]')
    expect(
      document.querySelector('[data-sort-column="totalLinhas"]')?.getAttribute('aria-sort'),
    ).toBe('descending')

    // Clica em Fatura(s) Paga(s): 500 > 350 > 200 (desc)
    await user.click(getHeaderButton('faturaPaga'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS', // 500
      'CELNET BRASILIA', // 350
      'CELNET TAGUATINGA', // 200
    ])
    // Seta da coluna anterior foi removida (coluna inativa)
    expect(getIndicatorClass('totalLinhas')).not.toContain('text-[#67e8f9]')
    expect(
      document.querySelector('[data-sort-column="totalLinhas"]')?.getAttribute('aria-sort'),
    ).toBe('none')
    expect(
      document.querySelector('[data-sort-column="faturaPaga"]')?.getAttribute('aria-sort'),
    ).toBe('descending')
  })

  it('4. Coluna LOJAS ordena alfabeticamente com a mesma alternância (1º clique Z→A, 2º A→Z)', async () => {
    const user = userEvent.setup()
    await renderIndex()

    await user.click(getHeaderButton('storeName'))
    // 1º clique: Z→A (desc)
    expect(getBodyStoreOrder()).toEqual([
      'CELNET TAGUATINGA',
      'CELNET BRASILIA',
      'CELNET AGUAS CLARAS',
    ])

    await user.click(getHeaderButton('storeName'))
    // 2º clique: A→Z (asc)
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET BRASILIA',
      'CELNET TAGUATINGA',
    ])
  })

  it('5. A linha de TOTAIS permanece fixa no rodapé, fora da ordenação (contagem de lojas visível intacta)', async () => {
    const user = userEvent.setup()
    await renderIndex()

    await user.click(getHeaderButton('totalLinhas'))
    await waitFor(() => {
      // TOTAIS (3) — rodapé fixo, fora do tbody que contém apenas as linhas de dados
      expect(screen.getByText('Totais (3)')).toBeDefined()
    })
    const tbody = document.querySelector('tbody')
    const tfoot = document.querySelector('tfoot')
    expect(tbody).not.toBeNull()
    expect(tfoot).not.toBeNull()
    // A linha de totais NÃO está no corpo (tbody) — nunca entra na ordenação
    expect(within(tfoot as HTMLElement).getByText(/Totais \(3\)/)).toBeDefined()
    expect(within(tbody as HTMLElement).queryByText(/Totais/)).toBeNull()
  })

  it('6. A ordenação é mantida ao trocar de referência no seletor', async () => {
    const user = userEvent.setup()
    await renderIndex()

    // Ordena por TOTAL LINHAS desc
    await user.click(getHeaderButton('totalLinhas'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET BRASILIA',
      'CELNET TAGUATINGA',
    ])

    // Troca de referência (mesma ordenação deve se aplicar aos novos dados)
    const dateSelect = screen.getByRole('combobox', {
      name: /selecione a referência principal/i,
    }) as HTMLSelectElement
    await user.selectOptions(dateSelect, '08/09/2026')

    await waitFor(() => {
      expect(screen.getByText('Ref: 08/09/2026')).toBeDefined()
    })
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET BRASILIA',
      'CELNET TAGUATINGA',
    ])
  })

  it('7. A exportação .xlsx NÃO é afetada pela ordenação (usa filteredRows na ordem original)', async () => {
    const user = userEvent.setup()
    await renderIndex()

    await user.click(getHeaderButton('totalLinhas'))
    expect(getBodyStoreOrder()).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET BRASILIA',
      'CELNET TAGUATINGA',
    ])

    const btnExport = screen.getByRole('button', { name: /Exportar \.xlsx/i })
    await user.click(btnExport)

    await waitFor(() => {
      expect(exportConsolidatedToXlsx).toHaveBeenCalledTimes(1)
    })

    const args = vi.mocked(exportConsolidatedToXlsx).mock.calls[0]
    const exportedRows = args[0] as Array<{ storeName: string }>
    // Exportação usa filteredRows (ordem original), não displayRows
    expect(exportedRows.map((r) => r.storeName)).toEqual([
      'CELNET AGUAS CLARAS',
      'CELNET TAGUATINGA',
      'CELNET BRASILIA',
    ])
    // Totais exportados = mesma referência usada pela tela
    expect(args[1]).toMatchObject({ totalLinhas: 1585 + 567 + 1000, faturaPaga: 1050 })
  })
})
