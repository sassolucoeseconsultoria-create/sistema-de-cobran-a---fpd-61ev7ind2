import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

describe('Coluna DATA ENVIO FATURA em ClientesMovel e ClientesResidencial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exibe o header "DATA ENVIO FATURA" imediatamente após "Ocorrências" em ClientesMovel', async () => {
    const mockMovelList = {
      items: [
        {
          id: 'mov1',
          cliente: 'Cliente Teste Móvel',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          data_envio_fatura: '2026-08-26',
          data_promessa_de_pagto: '28/08/2026',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('movel'), 'getList').mockResolvedValue(mockMovelList as any)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Teste Móvel')).toBeDefined()
    })

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    const ocorrenciasIdx = headers.indexOf('Ocorrências')
    const envioFaturaIdx = headers.indexOf('DATA ENVIO FATURA')
    const promessaIdx = headers.indexOf('Data Promessa de Pagto')

    expect(ocorrenciasIdx).toBeGreaterThanOrEqual(0)
    expect(envioFaturaIdx).toBe(ocorrenciasIdx + 1)
    expect(promessaIdx).toBe(envioFaturaIdx + 1)

    // Formatação da data preenchida DD/MM/AAAA
    const input = screen.getByDisplayValue('26/08/2026')
    expect(input).toBeDefined()
  })

  it('exibe célula vazia quando data_envio_fatura não estiver preenchida (sem "—" ou "N/A")', async () => {
    const mockMovelList = {
      items: [
        {
          id: 'mov_vazio',
          cliente: 'Cliente Data Vazia',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          data_envio_fatura: '',
          data_promessa_de_pagto: '',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('movel'), 'getList').mockResolvedValue(mockMovelList as any)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Data Vazia')).toBeDefined()
    })

    const inputs = screen.getAllByPlaceholderText('DD/MM/AAAA')
    // Deve haver 2 inputs com placeholder DD/MM/AAAA (DATA ENVIO FATURA e Data Promessa)
    expect(inputs.length).toBeGreaterThanOrEqual(2)
    const envioInput = inputs[0] as HTMLInputElement
    expect(envioInput.value).toBe('')
  })

  it('permite digitar, mascarar e salvar DATA ENVIO FATURA em ClientesMovel', async () => {
    const user = userEvent.setup()
    const mockMovelList = {
      items: [
        {
          id: 'mov_edit',
          cliente: 'Cliente Edicao',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          data_envio_fatura: '',
          data_promessa_de_pagto: '',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
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
      expect(screen.getByText('Cliente Edicao')).toBeDefined()
    })

    const inputs = screen.getAllByPlaceholderText('DD/MM/AAAA')
    const envioInput = inputs[0]

    // Digita sem barras: máscara aplica automaticamente DD/MM/AAAA
    await user.type(envioInput, '25082026')
    expect((envioInput as HTMLInputElement).value).toBe('25/08/2026')

    // Dispara blur para salvar
    await user.tab()

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'mov_edit',
        'Móvel',
        expect.objectContaining({
          data_envio_fatura: '25/08/2026',
        }),
      )
    })
  })

  it('rejeita data inválida em DATA ENVIO FATURA, exibe toast de aviso e não salva', async () => {
    const user = userEvent.setup()
    const mockMovelList = {
      items: [
        {
          id: 'mov_invalida',
          cliente: 'Cliente Data Invalida',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          data_envio_fatura: '',
          data_promessa_de_pagto: '',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
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
      expect(screen.getByText('Cliente Data Invalida')).toBeDefined()
    })

    const inputs = screen.getAllByPlaceholderText('DD/MM/AAAA')
    const envioInput = inputs[0]

    // Data com dia inválido: 32/08/2026
    await user.type(envioInput, '32082026')
    await user.tab()

    // Não deve chamar updateClientManualFields
    expect(updateSpy).not.toHaveBeenCalled()

    // Toast de erro em PT-BR exibido
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Data inválida',
        description: expect.stringContaining('DD/MM/AAAA'),
        variant: 'destructive',
      }),
    )
  })

  it('exibe o header "DATA ENVIO FATURA" imediatamente após "Ocorrências" em ClientesResidencial', async () => {
    const mockResList = {
      items: [
        {
          id: 'res1',
          cliente: 'Cliente Residencial Teste',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Enviado Fatura(s)',
          data_envio_fatura: '2026-08-20',
          data_promessa_de_pagto: '22/08/2026',
          nr_contrato: 'CTR123',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('residencial'), 'getList').mockResolvedValue(mockResList as any)

    render(
      <ClientesResidencial availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Cliente Residencial Teste')).toBeDefined()
    })

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    const ocorrenciasIdx = headers.indexOf('Ocorrências')
    const envioFaturaIdx = headers.indexOf('DATA ENVIO FATURA')
    const promessaIdx = headers.indexOf('Data Promessa de Pagto')

    expect(ocorrenciasIdx).toBeGreaterThanOrEqual(0)
    expect(envioFaturaIdx).toBe(ocorrenciasIdx + 1)
    expect(promessaIdx).toBe(envioFaturaIdx + 1)

    // Formatação da data preenchida DD/MM/AAAA
    const input = screen.getByDisplayValue('20/08/2026')
    expect(input).toBeDefined()
  })

  it('permite editar e salvar DATA ENVIO FATURA em ClientesResidencial', async () => {
    const user = userEvent.setup()
    const mockResList = {
      items: [
        {
          id: 'res_edit',
          cliente: 'Residencial Para Edicao',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          data_envio_fatura: '',
          data_promessa_de_pagto: '',
          nr_contrato: 'CTR999',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    vi.spyOn(pb.collection('residencial'), 'getList').mockResolvedValue(mockResList as any)
    const updateSpy = vi
      .spyOn(relacionamentoService, 'updateClientManualFields')
      .mockResolvedValue(true)

    render(
      <ClientesResidencial availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Residencial Para Edicao')).toBeDefined()
    })

    const inputs = screen.getAllByPlaceholderText('DD/MM/AAAA')
    const envioInput = inputs[0]

    await user.type(envioInput, '15092026')
    expect((envioInput as HTMLInputElement).value).toBe('15/09/2026')

    await user.tab()

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'res_edit',
        'Residencial',
        expect.objectContaining({
          data_envio_fatura: '15/09/2026',
        }),
      )
    })
  })
})
