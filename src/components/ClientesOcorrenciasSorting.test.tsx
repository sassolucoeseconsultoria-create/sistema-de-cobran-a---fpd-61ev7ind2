import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientesMovel } from '@/components/ClientesMovel'
import { ClientesResidencial } from '@/components/ClientesResidencial'
import pb from '@/lib/pocketbase/client'
import * as relacionamentoService from '@/services/relacionamentoService'

// Mock toast
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

// Mock Auth & UserStoreAccess
vi.mock('@/hooks/useUserStoreAccess', () => ({
  useUserStoreAccess: () => ({
    isAdm: true,
    isGerente: false,
    isStoreNameAllowed: () => true,
    hasNoStoreAssigned: false,
    isStoreIdAllowed: () => true,
  }),
}))

describe('Ordenação de Clientes por Ocorrências (ClientesMovel e ClientesResidencial)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ordena registros colocando Fatura(s) Paga(s) no final em ClientesMovel', async () => {
    const mockMovelList = {
      items: [
        {
          id: 'mov1',
          cliente: 'Cliente Paga 1',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Fatura(s) Paga(s)',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'mov2',
          cliente: 'Cliente Nao Tratado',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 2',
          ocorrencias: 'Não Tratados',
          linha: 3,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'mov3',
          cliente: 'Cliente Paga 2',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 3',
          ocorrencias: 'Fatura(s) Paga(s)',
          linha: 4,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'mov4',
          cliente: 'Cliente Enviado',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 4',
          ocorrencias: 'Enviado Fatura(s)',
          linha: 5,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 4,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('movel'), 'getList').mockResolvedValue(mockMovelList as any)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Nao Tratado')).toBeDefined()
    })

    // Checar ordem dos nomes no DOM
    const rows = screen.getAllByRole('row')
    // row 0 is header
    const rowTexts = rows.slice(1).map((r) => r.textContent || '')

    // As linhas não-pagas devem vir antes das pagas
    const indexNaoTratado = rowTexts.findIndex((t) => t.includes('Cliente Nao Tratado'))
    const indexEnviado = rowTexts.findIndex((t) => t.includes('Cliente Enviado'))
    const indexPaga1 = rowTexts.findIndex((t) => t.includes('Cliente Paga 1'))
    const indexPaga2 = rowTexts.findIndex((t) => t.includes('Cliente Paga 2'))

    expect(indexNaoTratado).toBeLessThan(indexPaga1)
    expect(indexNaoTratado).toBeLessThan(indexPaga2)
    expect(indexEnviado).toBeLessThan(indexPaga1)
    expect(indexEnviado).toBeLessThan(indexPaga2)
  })

  it('ordena registros colocando Fatura(s) Paga(s) no final em ClientesResidencial', async () => {
    const mockResList = {
      items: [
        {
          id: 'res1',
          cliente: 'Residencial Paga',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Fatura(s) Paga(s)',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'res2',
          cliente: 'Residencial Sem Contato',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 2',
          ocorrencias: 'Sem Contato',
          linha: 3,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 2,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('residencial'), 'getList').mockResolvedValue(mockResList as any)

    render(
      <ClientesResidencial availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Residencial Sem Contato')).toBeDefined()
    })

    const rows = screen.getAllByRole('row')
    const rowTexts = rows.slice(1).map((r) => r.textContent || '')

    const indexSemContato = rowTexts.findIndex((t) => t.includes('Residencial Sem Contato'))
    const indexPaga = rowTexts.findIndex((t) => t.includes('Residencial Paga'))

    expect(indexSemContato).toBeLessThan(indexPaga)
  })

  it('ao mudar ocorrência para Fatura(s) Paga(s) inline, dispara toast e move para o final da lista', async () => {
    const user = userEvent.setup()

    const mockMovelList = {
      items: [
        {
          id: 'item_a',
          cliente: 'Cliente Alpha',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'item_b',
          cliente: 'Cliente Beta',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 2',
          ocorrencias: 'Não Tratados',
          linha: 3,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 2,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('movel'), 'getList').mockResolvedValue(mockMovelList as any)
    const updateSpy = vi
      .spyOn(relacionamentoService, 'updateClientManualFields')
      .mockResolvedValue(true)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Alpha')).toBeDefined()
    })

    // Identificar os selects de ocorrências
    const triggers = screen.getAllByRole('combobox')
    // O primeiro combobox de ocorrência (linha 1: Alpha)
    // O seletor de loja e o seletor da tabela de ocorrências
    // Vamos procurar pelos botões com texto 'Não Tratados'
    const dropdownAlpha = screen.getAllByText('Não Tratados')[0]
    await user.click(dropdownAlpha)

    // Selecionar Fatura(s) Paga(s)
    const optionPaga = await screen.findByRole('option', { name: 'Fatura(s) Paga(s)' })
    await user.click(optionPaga)

    // Aguardar salvar no service
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'item_a',
        'Móvel',
        expect.objectContaining({
          ocorrencias: 'Fatura(s) Paga(s)',
        }),
      )
    })

    // Toast emitido
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ocorrência atualizada',
          description: expect.stringContaining(
            'Cliente marcado como Fatura(s) Paga(s) e movido para o final da lista.',
          ),
        }),
      )
    })

    // Na tabela agora Cliente Alpha deve estar no final (após Cliente Beta)
    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      const rowTexts = rows.slice(1).map((r) => r.textContent || '')
      const indexAlpha = rowTexts.findIndex((t) => t.includes('Cliente Alpha'))
      const indexBeta = rowTexts.findIndex((t) => t.includes('Cliente Beta'))
      expect(indexBeta).toBeLessThan(indexAlpha)
    })
  })
})
