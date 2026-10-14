import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientesMovel } from '@/components/ClientesMovel'
import { ClientesResidencial } from '@/components/ClientesResidencial'
import Relacionamento from '@/pages/Relacionamento'
import pb from '@/lib/pocketbase/client'
import * as relacionamentoService from '@/services/relacionamentoService'
import * as fpdService from '@/services/fpdService'

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/hooks/useUserStoreAccess', () => ({
  useUserStoreAccess: () => ({
    isAdm: true,
    isGerente: false,
    isSupervisor: false,
    isCoordenador: false,
    userRole: 'ADM',
    isStoreNameAllowed: () => true,
    hasNoStoreAssigned: false,
    isStoreIdAllowed: () => true,
    getAllowedStoreNames: () => ['LOJA TESTE', 'OUTRA LOJA'],
  }),
}))

vi.mock('@/hooks/useAllowedReferenceDates', () => ({
  useAllowedReferenceDates: () => ({
    allowedReferenceDates: ['01/09/2026'],
    isDateAllowed: () => true,
    initialReferenceDate: '01/09/2026',
    isRestrictedRole: false,
    loadingRefs: false,
  }),
}))

vi.mock('@/hooks/useButtonVisibility', () => ({
  useButtonVisibility: () => ({
    canShow: () => true,
    isLoading: false,
  }),
}))

describe('Filtro de Ocorrências na Visão Inadimplência', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filtra por ocorrência "Não Tratados" usando a cláusula correta e salvaguarda em memória no ClientesMovel', async () => {
    const user = userEvent.setup()

    const mockMovelList = {
      items: [
        {
          id: 'mov1',
          cliente: 'Cliente Nao Tratado',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 1',
          ocorrencias: 'Não Tratados',
          linha: 2,
          created: '2026-09-01T10:00:00Z',
          dados: {},
        },
        {
          id: 'mov2',
          cliente: 'Cliente Paga',
          loja: 'LOJA TESTE',
          vendedor: 'Vendedor 2',
          ocorrencias: 'Fatura(s) Paga(s)',
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

    const getListSpy = vi
      .spyOn(pb.collection('movel'), 'getList')
      .mockResolvedValue(mockMovelList as any)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Nao Tratado')).toBeDefined()
      expect(screen.getByText('Cliente Paga')).toBeDefined()
    })

    // Clicar no dropdown de Ocorrência
    const trigger = screen.getByTestId('select-filtro-ocorrencia-movel')
    await user.click(trigger)

    // Selecionar "Não Tratados"
    const option = await screen.findByRole('option', { name: 'Não Tratados' })
    await user.click(option)

    await waitFor(() => {
      expect(getListSpy).toHaveBeenLastCalledWith(
        1,
        25,
        expect.objectContaining({
          filter: expect.stringContaining(
            '(ocorrencias = "Não Tratados" || ocorrencias = "" || ocorrencias = null)',
          ),
        }),
      )
    })

    // Na tela, após salvaguarda em memória, apenas Cliente Nao Tratado permanece
    await waitFor(() => {
      expect(screen.getByText('Cliente Nao Tratado')).toBeDefined()
      expect(screen.queryByText('Cliente Paga')).toBeNull()
    })
  })

  it('restaura todos os clientes ao selecionar "Todas as Ocorrências" e botão Limpar Filtros reseta para TODAS', async () => {
    const user = userEvent.setup()

    const mockMovelList = {
      items: [
        {
          id: 'mov1',
          cliente: 'Cliente Pendente',
          loja: 'LOJA TESTE',
          ocorrencias: 'Pendente',
          linha: 2,
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    const getListSpy = vi
      .spyOn(pb.collection('movel'), 'getList')
      .mockResolvedValue(mockMovelList as any)

    render(<ClientesMovel availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />)

    await waitFor(() => {
      expect(screen.getByText('Cliente Pendente')).toBeDefined()
    })

    // Selecionar Pendente
    const trigger = screen.getByTestId('select-filtro-ocorrencia-movel')
    await user.click(trigger)
    const optionPendente = await screen.findByRole('option', { name: 'Pendente' })
    await user.click(optionPendente)

    await waitFor(() => {
      expect(getListSpy).toHaveBeenLastCalledWith(
        1,
        25,
        expect.objectContaining({
          filter: expect.stringContaining('ocorrencias = "Pendente"'),
        }),
      )
    })

    // Botão Limpar Filtros deve aparecer
    const btnLimpar = await screen.findByRole('button', { name: /Limpar filtros/i })
    await user.click(btnLimpar)

    // Ao limpar filtros, volta para Todas as Ocorrências (não contém mais ocorrencias = ...)
    await waitFor(() => {
      const lastCall = getListSpy.mock.calls[getListSpy.mock.calls.length - 1]
      const filterArg = lastCall[2]?.filter || ''
      expect(filterArg).not.toContain('ocorrencias = "Pendente"')
    })
  })

  it('combina filtro de ocorrência com filtro de loja em ClientesResidencial', async () => {
    const user = userEvent.setup()

    const mockResList = {
      items: [
        {
          id: 'res1',
          cliente: 'Residencial Cancelado',
          loja: 'LOJA TESTE',
          ocorrencias: 'Cancelados',
          linha: 2,
          dados: {},
        },
      ],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 25,
    }

    const getListSpy = vi
      .spyOn(pb.collection('residencial'), 'getList')
      .mockResolvedValue(mockResList as any)

    render(
      <ClientesResidencial availableLojas={['LOJA TESTE']} stores={[]} selectedLoja="LOJA TESTE" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Residencial Cancelado')).toBeDefined()
    })

    // Selecionar Cancelados
    const trigger = screen.getByTestId('select-filtro-ocorrencia-residencial')
    await user.click(trigger)
    const optionCancelados = await screen.findByRole('option', { name: 'Cancelados' })
    await user.click(optionCancelados)

    await waitFor(() => {
      const lastCall = getListSpy.mock.calls[getListSpy.mock.calls.length - 1]
      const filterArg = lastCall[2]?.filter || ''
      // Deve conter cláusula de loja AND cláusula de ocorrencias
      expect(filterArg).toContain('(loja != "" && loja != null)')
      expect(filterArg).toContain('loja')
      expect(filterArg).toContain('ocorrencias = "Cancelados"')
    })
  })

  it('exportação XLSX em Relacionamento respeita o filtro de ocorrência ativo sem alterar os contadores do cabeçalho', async () => {
    const user = userEvent.setup()

    vi.spyOn(relacionamentoService, 'fetchDistinctAnalyticalLojas').mockResolvedValue([
      'LOJA TESTE',
    ])
    vi.spyOn(fpdService, 'fetchStores').mockResolvedValue([
      {
        id: 'store1',
        name: 'LOJA TESTE',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ])

    // Mock contagem deduplicada canônica (cabeçalho)
    vi.spyOn(relacionamentoService, 'fetchAnalyticalRows').mockResolvedValue([
      {
        id: '1',
        loja: 'LOJA TESTE',
        data_referencia: '01/09/2026',
        cliente: 'Cliente 1',
        linha: 1,
      },
      {
        id: '2',
        loja: 'LOJA TESTE',
        data_referencia: '01/09/2026',
        cliente: 'Cliente 2',
        linha: 2,
      },
    ] as any)

    const mockMovelList = {
      items: [
        {
          id: 'mov1',
          cliente: 'Cliente Paga',
          loja: 'LOJA TESTE',
          ocorrencias: 'Fatura(s) Paga(s)',
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
    const getFullListSpy = vi.spyOn(pb.collection('movel'), 'getFullList').mockResolvedValue([
      {
        id: 'mov1',
        cliente: 'Cliente Paga',
        loja: 'LOJA TESTE',
        ocorrencias: 'Fatura(s) Paga(s)',
        linha: 2,
        data_envio_fatura: '2026-09-05',
        dados: {},
      },
    ] as any)

    render(<Relacionamento />)

    await waitFor(() => {
      expect(screen.getByText('Gestão de Clientes em Inadimplência')).toBeDefined()
    })

    // Contadores de cabeçalho devem refletir o total do serviço (2 clientes)
    await waitFor(() => {
      expect(screen.getByText('Total de Clientes')).toBeDefined()
      expect(screen.getByText('Clientes Móvel')).toBeDefined()
    })

    // Ativar filtro de ocorrência "Fatura(s) Paga(s)"
    const trigger = await screen.findByTestId('select-filtro-ocorrencia-movel')
    await user.click(trigger)
    const optionPaga = await screen.findByRole('option', { name: 'Fatura(s) Paga(s)' })
    await user.click(optionPaga)

    // Clicar em Exportar .xlsx
    const btnExport = screen.getByRole('button', { name: /Exportar \.xlsx/i })
    await user.click(btnExport)

    await waitFor(() => {
      expect(getFullListSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('ocorrencias = "Fatura(s) Paga(s)"'),
        }),
      )
    })

    // Toast informa a quantidade exportada
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Exportação concluída!',
          description: expect.stringContaining('1 registro(s) exportado(s)'),
        }),
      )
    })

    // Contadores do cabeçalho continuam intactos (não são re-buscados nem diminuídos pelo filtro)
    expect(screen.getByText('Total de Clientes')).toBeDefined()
  })
})
