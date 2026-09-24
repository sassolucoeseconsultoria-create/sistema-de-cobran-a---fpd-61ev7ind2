import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import { Arquivos } from '@/pages/Arquivos'
import * as fpdService from '@/services/fpdService'
import { buildConsolidatedRow } from '@/lib/consolidatedComparison'
import type { FpdRecord, StoreRecord } from '@/types/fpd'

// Mock pocketbase & realtime
let realtimeCallback: ((e: { action: string; record: any }) => void) | null = null
vi.mock('@/hooks/use-realtime', () => ({
  useRealtime: vi.fn((collection: string, callback: any) => {
    if (collection === 'fpd_records') {
      realtimeCallback = callback
    }
  }),
}))

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
      id: 'store_inhumas_id',
      name: 'CELNET INHUMAS',
      coordenacao: 'Hélio',
      supervisao: 'Luciano',
    },
  ]),
  fetchFpdRecords: vi.fn(),
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

describe('Regressão: Atualização do consolidado do Painel de Lojas (INHUMAS / 08/09/2026)', () => {
  const mockUser = {
    id: 'usr_test_1',
    collectionId: 'users',
    collectionName: 'users',
    email: 'test@celnet.com.br',
    name: 'Admin Teste',
    role: 'ADM' as const,
    lojas: [],
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const mockStoreInhumas: StoreRecord = {
    id: 'store_inhumas_id',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET INHUMAS',
    coordenacao: 'Hélio',
    supervisao: 'Luciano',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    realtimeCallback = null
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockUser,
      token: 'token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
  })

  it('1. buildConsolidatedRow sempre prioriza o registro mais recente (-updated / -importado_em) quando há múltiplos registros para a mesma loja e referência', () => {
    // Cenário onde o banco contém um registro antigo (stale) e um registro recém-atualizado após edição na Inadimplência
    const staleRecord: FpdRecord = {
      id: 'rec_stale_inhumas',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      store: 'store_inhumas_id',
      referente: '08/09/2026',
      total_linhas: 53,
      fatura_paga: 7, // antigo
      envio_fatura: 3,
      promessa_pagto: 1,
      sem_contato: 2,
      cancelados: 0,
      pendente: 0,
      contato_realizado: 1,
      nao_tratados: 39,
      outros: 0,
      importado_em: '2026-09-22 14:00:00',
      created: '2026-09-22 14:00:00',
      updated: '2026-09-22 14:00:00',
    }

    const updatedRecord: FpdRecord = {
      id: 'rec_updated_inhumas',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      store: 'store_inhumas_id',
      referente: '08/09/2026',
      total_linhas: 53,
      fatura_paga: 9, // recém-atualizado via reconsolidação!
      envio_fatura: 3,
      promessa_pagto: 1,
      sem_contato: 2,
      cancelados: 0,
      pendente: 0,
      contato_realizado: 2,
      nao_tratados: 36,
      outros: 0,
      importado_em: '2026-09-24 13:58:53',
      created: '2026-09-22 14:00:00',
      updated: '2026-09-24 13:58:53',
    }

    // Mesmo que o array venha com o stale primeiro:
    const consolidated = buildConsolidatedRow(
      mockStoreInhumas,
      [staleRecord, updatedRecord],
      '08/09/2026',
      () => true,
    )

    expect(consolidated.hasData).toBe(true)
    expect(consolidated.latestRecordId).toBe('rec_updated_inhumas')
    expect(consolidated.faturaPaga).toBe(9)
    expect(consolidated.naoTratados).toBe(36)
    expect(consolidated.contatoRealizado).toBe(2)
  })

  it('2. Tela /arquivos exibe os dados atualizados e reage imediatamente a evento realtime de update do fpd_records', async () => {
    const initialRecord: FpdRecord = {
      id: 'lw81q9ans8069ls',
      collectionId: 'fpd_records',
      collectionName: 'fpd_records',
      store: 'store_inhumas_id',
      referente: '08/09/2026',
      total_linhas: 53,
      fatura_paga: 7,
      envio_fatura: 3,
      promessa_pagto: 1,
      sem_contato: 2,
      cancelados: 0,
      pendente: 0,
      contato_realizado: 1,
      nao_tratados: 39,
      outros: 0,
      importado_em: '2026-09-22 14:00:00',
      created: '2026-09-22 14:00:00',
      updated: '2026-09-22 14:00:00',
    }

    vi.mocked(fpdService.fetchFpdRecords).mockResolvedValue([initialRecord])

    render(
      <MemoryRouter>
        <Arquivos />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('CELNET INHUMAS')).toBeDefined()
    })

    // Fatura paga inicial = 7
    expect(screen.getByText('7')).toBeDefined()

    // Disparar evento realtime simulando que a reconsolidação pós-edição de ocorrência gravou novo estado
    const realtimeRecord: FpdRecord = {
      ...initialRecord,
      fatura_paga: 9,
      contato_realizado: 2,
      nao_tratados: 36,
      importado_em: '2026-09-24 13:58:53',
      updated: '2026-09-24 13:58:53',
    }

    expect(realtimeCallback).not.toBeNull()
    realtimeCallback!({
      action: 'update',
      record: realtimeRecord,
    })

    // Painel de lojas atualiza imediatamente para 9 faturas pagas
    await waitFor(() => {
      expect(screen.getByText('9')).toBeDefined()
    })
  })
})
