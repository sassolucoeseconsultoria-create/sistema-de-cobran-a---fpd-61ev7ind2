import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Index } from '@/pages/Index'
import type { StoreRecord, FpdRecord } from '@/types/fpd'
import * as fpdService from '@/services/fpdService'

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
]

const mockRecordsInitial: FpdRecord[] = [
  {
    id: 'rec_aguas_0809',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '08/09/2026',
    importado_em: '2026-09-08T10:00:00Z',
    total_linhas: 100,
    fatura_paga: 10,
    envio_fatura: 20,
    promessa_pagto: 30,
    sem_contato: 10,
    cancelados: 5,
    pendente: 15,
    contato_realizado: 10,
    nao_tratados: 0,
    outros: 0,
    created: '2026-09-08T10:00:00Z',
    updated: '2026-09-08T10:00:00Z',
  },
]

const mockRecordsAfterRefresh: FpdRecord[] = [
  {
    id: 'rec_aguas_0809',
    collectionId: 'fpd_records',
    collectionName: 'fpd_records',
    store: 'store_1',
    referente: '08/09/2026',
    importado_em: '2026-09-08T10:00:00Z',
    total_linhas: 100,
    fatura_paga: 80, // Subiu fatura paga após reconsolidação de ocorrência na Visão Inadimplência!
    envio_fatura: 10,
    promessa_pagto: 5,
    sem_contato: 0,
    cancelados: 2,
    pendente: 3,
    contato_realizado: 0,
    nao_tratados: 0,
    outros: 0,
    created: '2026-09-08T10:00:00Z',
    updated: '2026-09-08T10:01:00Z',
  },
]

vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn(),
  fetchFpdRecords: vi.fn(),
  fetchDistinctReferenceDates: vi.fn().mockImplementation(() => Promise.resolve(['08/09/2026'])),
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
      referente: '08/09/2026',
      gerente: true,
      supervisor: true,
      coordenador: true,
    },
  ]),
  filterReferenceDatesForRole: vi.fn().mockImplementation((dates) => dates),
  isReferenceDateAllowedForRole: vi.fn().mockReturnValue(true),
  normalizeReferenceDate: vi.fn().mockImplementation((d) => (d ? String(d).trim() : '')),
}))

describe('Index (Painel de Lojas) - Auto-Refresh de 60 segundos', () => {
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
    vi.useFakeTimers()
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: admUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. Carrega dados no mount e renderiza o indicador de "Atualização automática a cada 60s"', async () => {
    vi.mocked(fpdService.fetchStores).mockResolvedValue(mockStores)
    vi.mocked(fpdService.fetchFpdRecords).mockResolvedValue(mockRecordsInitial)

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    )

    // Inicialmente dispara 1 chamada para fetchStores e fetchFpdRecords
    expect(fpdService.fetchStores).toHaveBeenCalledTimes(1)
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)

    // Aguarda resolução das promises pendentes no event loop fake
    await act(async () => {
      await Promise.resolve()
    })

    // Deve exibir o indicador discreto
    expect(screen.getByLabelText('Atualização automática a cada 60s')).toBeDefined()
    expect(screen.getByText(/Atualização automática a cada 60s/i)).toBeDefined()
  })

  it('2. Dispara novo re-fetch exatamente aos 60s (e NÃO aos 30s ou 59s), atualizando os dados', async () => {
    let callCount = 0
    vi.mocked(fpdService.fetchStores).mockResolvedValue(mockStores)
    vi.mocked(fpdService.fetchFpdRecords).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(mockRecordsInitial)
      }
      return Promise.resolve(mockRecordsAfterRefresh)
    })

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    // Inicialmente: 1 chamada
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)

    // Avança 30 segundos — NÃO deve fazer re-fetch
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)

    // Avança mais 29 segundos (total 59s) — ainda NÃO deve fazer re-fetch
    await act(async () => {
      vi.advanceTimersByTime(29000)
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)

    // Avança mais 1 segundo (total 60s) — DEVE disparar o re-fetch!
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(2)
    expect(fpdService.fetchStores).toHaveBeenCalledTimes(2)

    // Avança mais 60 segundos (total 120s) — DEVE disparar o segundo refresh periódico
    await act(async () => {
      vi.advanceTimersByTime(60000)
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(3)
    expect(fpdService.fetchStores).toHaveBeenCalledTimes(3)
  })

  it('3. Executa cleanup correto do setInterval no unmount evitando memory leak e chamadas posteriores', async () => {
    vi.mocked(fpdService.fetchStores).mockResolvedValue(mockStores)
    vi.mocked(fpdService.fetchFpdRecords).mockResolvedValue(mockRecordsInitial)

    const { unmount } = render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)

    // Desmonta o componente
    unmount()

    // Avança 120 segundos após unmount — nenhuma nova chamada deve ocorrer
    await act(async () => {
      vi.advanceTimersByTime(120000)
    })
    expect(fpdService.fetchFpdRecords).toHaveBeenCalledTimes(1)
    expect(fpdService.fetchStores).toHaveBeenCalledTimes(1)
  })
})
