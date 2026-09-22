import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Arquivos } from '@/pages/Arquivos'
import * as relacionamentoService from '@/services/relacionamentoService'
import * as fpdService from '@/services/fpdService'

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
    {
      id: 'store_1',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'Coord Leste',
      supervisao: 'Sup 1',
    },
    {
      id: 'store_2',
      name: 'CELNET TAGUATINGA',
      coordenacao: 'Coord Leste',
      supervisao: 'Sup 1',
    },
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

describe('Arquivos (Painel de Lojas) - Botão Consolidar Agora e Auto-Refresh', () => {
  const admUser = {
    id: 'usr_adm_1',
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

  it('renderiza o indicador de auto-refresh de 60s e o botão "Consolidar agora" na toolbar', async () => {
    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    // Indicador de 60s
    expect(screen.getByLabelText('Atualização automática a cada 60s')).toBeDefined()
    expect(screen.getByText(/Atualização automática a cada 60s/i)).toBeDefined()

    // Botão Consolidar agora
    const btnConsolidar = screen.getByRole('button', { name: /Consolidar agora/i })
    expect(btnConsolidar).toBeDefined()
    expect(btnConsolidar.hasAttribute('disabled')).toBe(false)
  })

  it('clicar em "Consolidar agora" chama reconsolidarPainelLojas com as referências permitidas e recarrega os dados do painel', async () => {
    const reconsolidarSpy = vi
      .spyOn(relacionamentoService, 'reconsolidarPainelLojas')
      .mockResolvedValue({
        success: true,
        totalLojas: 2,
        totalReferencias: 1,
        lojasProcessadas: ['CELNET AGUAS CLARAS', 'CELNET TAGUATINGA'],
        referenciasProcessadas: ['08/09/2026'],
        mensagem: 'Consolidação atualizada com sucesso! 2 loja(s) e 1 referência(s) recalculadas.',
      })

    const fetchFpdSpy = vi.spyOn(fpdService, 'fetchFpdRecords')

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    const initialFetchCount = fetchFpdSpy.mock.calls.length
    expect(initialFetchCount).toBeGreaterThanOrEqual(1)

    const btnConsolidar = screen.getByRole('button', { name: /Consolidar agora/i })
    fireEvent.click(btnConsolidar)

    // Verifica chamada de reconsolidarPainelLojas
    await waitFor(() => {
      expect(reconsolidarSpy).toHaveBeenCalledTimes(1)
    })

    expect(reconsolidarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedReference: '08/09/2026',
        allowedReferences: ['08/09/2026'],
        accessibleStores: expect.arrayContaining([
          expect.objectContaining({ name: 'CELNET AGUAS CLARAS' }),
          expect.objectContaining({ name: 'CELNET TAGUATINGA' }),
        ]),
      }),
    )

    // Verifica que fetchFpdRecords foi chamado novamente para recarregar a tela
    await waitFor(() => {
      expect(fetchFpdSpy.mock.calls.length).toBeGreaterThan(initialFetchCount)
    })
  })

  it('reflete alteração prévia de ocorrência na Inadimplência após o clique de reconsolidação', async () => {
    // Cenário: antes da consolidação, totalLinhas de AGUAS CLARAS era 28 (fatura_paga: 10)
    // Uma ocorrência foi alterada na Inadimplência para fatura paga (totalizando 11 faturas pagas)
    vi.spyOn(relacionamentoService, 'reconsolidarPainelLojas').mockImplementation(async () => {
      // Simula a escrita no backend após a orquestração
      vi.spyOn(fpdService, 'fetchFpdRecords').mockResolvedValue([
        {
          id: 'rec_1',
          collectionId: 'fpd_records',
          collectionName: 'fpd_records',
          store: 'store_1',
          referente: '08/09/2026',
          fatura_paga: 11, // atualizado!
          envio_fatura: 5,
          promessa_pagto: 3,
          sem_contato: 2,
          cancelados: 1,
          pendente: 4,
          contato_realizado: 2,
          nao_tratados: 0, // diminuído!
          total_linhas: 28,
          created: '2026-09-08',
        } as any,
        {
          id: 'rec_2',
          collectionId: 'fpd_records',
          collectionName: 'fpd_records',
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
        } as any,
      ])

      return {
        success: true,
        totalLojas: 2,
        totalReferencias: 1,
        lojasProcessadas: ['CELNET AGUAS CLARAS', 'CELNET TAGUATINGA'],
        referenciasProcessadas: ['08/09/2026'],
        mensagem: 'Consolidação atualizada com sucesso! 2 loja(s) e 1 referência(s) recalculadas.',
      }
    })

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
    })

    // Antes do clique: soma de faturas pagas era 18 (10 + 8)
    expect(screen.getByText('18')).toBeDefined()

    const btnConsolidar = screen.getByRole('button', { name: /Consolidar agora/i })
    fireEvent.click(btnConsolidar)

    // Após o clique e loadData: nova soma deve ser 19 (11 + 8)
    await waitFor(() => {
      expect(screen.getByText('19')).toBeDefined()
    })
  })
})
