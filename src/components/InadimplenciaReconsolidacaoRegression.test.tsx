import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ClientesMovel } from '@/components/ClientesMovel'
import { ClientesResidencial } from '@/components/ClientesResidencial'
import * as relacionamentoService from '@/services/relacionamentoService'
import pb from '@/lib/pocketbase/client'
import type { StoreRecord } from '@/types/fpd'

// Mock PocketBase
vi.mock('@/lib/pocketbase/client', () => {
  const mockCollection = vi.fn()
  const mockInstance = {
    collection: mockCollection,
  }
  return {
    default: mockInstance,
    pb: mockInstance,
    isSessionExpiredError: vi.fn(() => false),
  }
})

// Mock auth & store access
vi.mock('@/hooks/useUserStoreAccess', () => ({
  useUserStoreAccess: () => ({
    isAdm: true,
    isGerente: false,
    hasNoStoreAssigned: false,
    isStoreNameAllowed: () => true,
    isStoreIdAllowed: () => true,
  }),
}))

vi.mock('@/hooks/useAllowedReferenceDates', () => ({
  useAllowedReferenceDates: () => ({
    allowedReferenceDates: ['08/09/2026'],
    isDateAllowed: () => true,
  }),
}))

describe('Regressão: Edição de Ocorrência na Inadimplência propaga para Painel de Lojas mesmo com filtro TODAS', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store-planaltina-id',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'CELNET PLANALTINA DF',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(relacionamentoService, 'updateClientManualFields').mockResolvedValue({} as any)
    vi.spyOn(relacionamentoService, 'reconsolidarLojaReferencia').mockResolvedValue({
      success: true,
      loja: 'CELNET PLANALTINA DF',
      dataReferencia: '08/09/2026',
      fpdUpdated: true,
      vendorsUpdated: 1,
    })
  })

  it('ClientesMovel: ao alterar ocorrência com filtro TODAS, extrai loja/referência do registro e dispara reconsolidação', async () => {
    const mockMovelRow = {
      id: 'movel-rec-1',
      loja: 'CELNET PLANALTINA DF',
      vendedor: 'VENDEDOR DF',
      cliente: 'CLIENTE TESTE',
      cpf: '12345678900',
      dados: { Numero: '61999990001' },
      ocorrencias: 'Não Tratados',
      data_referencia: '08/09/2026',
      data_promessa_de_pagto: '',
      comentarios: '',
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [mockMovelRow],
            totalItems: 1,
          }),
        } as any
      }
      return {} as any
    })

    render(
      <ClientesMovel
        availableLojas={['CELNET PLANALTINA DF']}
        stores={mockStores}
        dataReferencia="TODAS"
        selectedLoja="TODAS"
      />,
    )

    // Aguardar carregar o registro
    await waitFor(() => {
      expect(screen.getByText('CLIENTE TESTE')).toBeDefined()
    })

    // Alterar o combobox de ocorrência para Fatura(s) Paga(s)
    const selectTrigger = screen.getByRole('combobox')
    fireEvent.click(selectTrigger)

    // O select do Radix UI renderiza itens no DOM
    const itemOption = await screen.findByText('Fatura(s) Paga(s)')
    fireEvent.click(itemOption)

    // Validar que updateClientManualFields foi chamado
    await waitFor(() => {
      expect(relacionamentoService.updateClientManualFields).toHaveBeenCalledWith(
        'movel-rec-1',
        'Movel',
        expect.objectContaining({
          ocorrencias: 'Fatura(s) Paga(s)',
        }),
      )
    })

    // Validar que reconsolidarLojaReferencia foi acionado com a loja e referência do registro (mesmo estando em TODAS)
    await waitFor(() => {
      expect(relacionamentoService.reconsolidarLojaReferencia).toHaveBeenCalledWith(
        'CELNET PLANALTINA DF',
        '08/09/2026',
      )
    })
  })

  it('ClientesResidencial: ao alterar ocorrência com filtro TODAS, extrai loja/referência do registro e dispara reconsolidação', async () => {
    const mockResRow = {
      id: 'res-rec-1',
      loja: 'CELNET PLANALTINA DF',
      vendedor: 'VENDEDOR DF',
      cliente: 'CLIENTE RESIDENCIAL',
      cpf: '98765432100',
      nr_contrato: 'CTR-999',
      dados: { NR_CONTRATO: 'CTR-999' },
      ocorrencias: 'Pendente',
      data_referencia: '08/09/2026',
      data_promessa_de_pagto: '',
      comentarios: '',
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'residencial') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [mockResRow],
            totalItems: 1,
          }),
        } as any
      }
      return {} as any
    })

    render(
      <ClientesResidencial
        availableLojas={['CELNET PLANALTINA DF']}
        stores={mockStores}
        dataReferencia="TODAS"
        selectedLoja="TODAS"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('CLIENTE RESIDENCIAL')).toBeDefined()
    })

    const selectTrigger = screen.getByRole('combobox')
    fireEvent.click(selectTrigger)

    const itemOption = await screen.findByText('Fatura(s) Paga(s)')
    fireEvent.click(itemOption)

    await waitFor(() => {
      expect(relacionamentoService.updateClientManualFields).toHaveBeenCalledWith(
        'res-rec-1',
        'Residencial',
        expect.objectContaining({
          ocorrencias: 'Fatura(s) Paga(s)',
        }),
      )
    })

    await waitFor(() => {
      expect(relacionamentoService.reconsolidarLojaReferencia).toHaveBeenCalledWith(
        'CELNET PLANALTINA DF',
        '08/09/2026',
      )
    })
  })
})
