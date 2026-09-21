import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Arquivos } from '@/pages/Arquivos'
import * as xlsxExport from '@/lib/xlsxExport'

// Mock pocketbase
vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(),
  },
  isSessionExpiredError: () => false,
}))

// Mock fpdService
vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockResolvedValue([
    { id: 'store_1', name: 'CELNET AGUAS CLARAS', coordenacao: 'Coord Leste', supervisao: 'Sup 1' },
    { id: 'store_2', name: 'CELNET TAGUATINGA', coordenacao: 'Coord Leste', supervisao: 'Sup 1' },
    { id: 'store_3', name: 'LOJA SEM DADOS', coordenacao: 'Coord Oeste', supervisao: 'Sup 2' },
  ]),
  fetchFpdRecords: vi.fn().mockResolvedValue([
    {
      id: 'rec_1',
      store: 'store_1',
      referente: '08/09/2026',
      fatura_paga: 10,
      envio_fatura: 5,
      promessa_pagto: 3,
      sem_contato: 2,
      cancelados: 1,
      pendente: 4,
      contato_realizado: 2,
      nao_tratados: 1,
      total_linhas: 28,
      created: '2026-09-08',
    },
    {
      id: 'rec_2',
      store: 'store_2',
      referente: '08/09/2026',
      fatura_paga: 8,
      envio_fatura: 4,
      promessa_pagto: 2,
      sem_contato: 1,
      cancelados: 2,
      pendente: 3,
      contato_realizado: 1,
      nao_tratados: 0,
      total_linhas: 21,
      created: '2026-09-08',
    },
    // store_3 não tem registros em fpd_records (ou total_linhas 0)
  ]),
  fetchVendorConsolidations: vi.fn().mockResolvedValue([]),
  fetchFpdRecordsByStore: vi.fn().mockResolvedValue([]),
  deleteFpdRecord: vi.fn().mockResolvedValue(true),
  clearAllFpdRecords: vi.fn().mockResolvedValue(true),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(true),
  clearAllStores: vi.fn().mockResolvedValue(true),
}))

// Mock permissions
vi.mock('@/services/referenceDatePermissionService', () => ({
  fetchReferenceDatePermissions: vi
    .fn()
    .mockResolvedValue([
      { referente: '08/09/2026', gerente: true, supervisor: true, coordenador: true },
    ]),
  normalizeReferenceDate: (d: string) => d,
  isReferenceDateAllowedForRole: () => true,
  filterReferenceDatesForRole: (dates: string[]) => dates,
}))

describe('Arquivos (Painel de Lojas) - Ocultação de Linhas Sem Dados', () => {
  const admUser = {
    id: 'usr_adm_root',
    collectionId: 'users',
    collectionName: 'users',
    email: 'adm@celnet.com.br',
    name: 'Administrador Master',
    role: 'ADM' as const,
    lojas: [],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  it('Oculta lojas sem registros (totalLinhas === 0 / sem dados) da tabela e reflete na contagem do rodapé', async () => {
    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      // Lojas com dados aparecem
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
      expect(screen.getByText('CELNET TAGUATINGA')).toBeDefined()
    })

    // LOJA SEM DADOS NÃO deve ser exibida na tabela
    expect(screen.queryByText('LOJA SEM DADOS')).toBeNull()

    // O rodapé deve indicar "Totais (2)" e não 3
    expect(screen.getByText(/Totais \(2\)/i)).toBeDefined()

    // Total de linhas exibido no rodapé deve ser 49 (28 + 21)
    expect(screen.getByText('49')).toBeDefined()
  })

  it('A exportação XLSX recebe apenas as linhas de lojas com dados reais', async () => {
    const exportSpy = vi.spyOn(xlsxExport, 'exportConsolidatedToXlsx').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    const exportBtn = screen.getByRole('button', { name: /Exportar \.xlsx/i })
    exportBtn.click()

    expect(exportSpy).toHaveBeenCalledTimes(1)
    const [rows, totals] = exportSpy.mock.calls[0]

    // Apenas 2 lojas exportadas
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.storeName)).toEqual(['CELNET AGUAS CLARAS', 'CELNET TAGUATINGA'])
    expect(rows.some((r) => r.storeName === 'LOJA SEM DADOS')).toBe(false)
    expect(totals.totalLinhas).toBe(49)
  })
})
