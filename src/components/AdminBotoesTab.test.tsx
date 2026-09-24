import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminBotoesTab } from '@/components/AdminBotoesTab'
import * as configBotoesService from '@/services/configBotoesService'
import * as AuthContext from '@/contexts/AuthContext'
import { Relacionamento } from '@/pages/Relacionamento'
import { Vendedores } from '@/pages/Vendedores'
import { TopOfensores } from '@/pages/TopOfensores'
import { Arquivos } from '@/pages/Arquivos'
import pb from '@/lib/pocketbase/client'

// Mocks
vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(() => ({
      getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
      getFullList: vi.fn().mockResolvedValue([]),
    })),
  },
}))

vi.mock('@/hooks/use-realtime', () => ({
  useRealtime: vi.fn(),
  default: vi.fn(),
}))

const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: vi.fn(),
}))

vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockResolvedValue([]),
  fetchDistinctReferenceDates: vi.fn().mockResolvedValue(['10/2024']),
  fetchVendorConsolidations: vi.fn().mockResolvedValue([]),
  fetchImportedFiles: vi.fn().mockResolvedValue([]),
  fetchConsolidatedComparison: vi.fn().mockResolvedValue([]),
  matchStore: vi.fn(),
}))

vi.mock('@/services/relacionamentoService', () => ({
  fetchDistinctAnalyticalLojas: vi.fn().mockResolvedValue([]),
  fetchAnalyticalRows: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
  invalidateAnalyticalCache: vi.fn(),
  clearAllAnalyticalRows: vi.fn().mockResolvedValue({ movelCount: 0, residencialCount: 0 }),
}))

vi.mock('@/services/mensagensService', () => ({
  fetchMensagensPorFaixa: vi.fn().mockResolvedValue([]),
}))

const defaultMockBotoes: configBotoesService.ConfigBotaoRecord[] = [
  {
    id: 'btn1',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'ranking_vendedores',
    tela_nome: 'Ranking por Vendedor',
    botao_id: 'limpar_vendedores',
    botao_nome: 'Limpar Vendedores',
    ordem: 1,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn2',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'ranking_vendedores',
    tela_nome: 'Ranking por Vendedor',
    botao_id: 'exportar_xlsx',
    botao_nome: 'Exportar .xlsx',
    ordem: 2,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn3',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'top_ofensores',
    tela_nome: 'Principais Ofensores',
    botao_id: 'exportar_principais_ofensores',
    botao_nome: 'Exportar Principais Ofensores (.xlsx)',
    ordem: 3,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn4',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'painel_lojas',
    tela_nome: 'Painel de Lojas',
    botao_id: 'limpar_dados',
    botao_nome: 'Limpar dados',
    ordem: 4,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn5',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'painel_lojas',
    tela_nome: 'Painel de Lojas',
    botao_id: 'exportar_xlsx',
    botao_nome: 'Exportar .xlsx',
    ordem: 5,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn6',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'inadimplencia',
    tela_nome: 'Inadimplência',
    botao_id: 'limpar_dados',
    botao_nome: 'Limpar dados',
    ordem: 6,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
  {
    id: 'btn7',
    collectionId: 'config_botoes',
    collectionName: 'config_botoes',
    tela_id: 'inadimplencia',
    tela_nome: 'Inadimplência',
    botao_id: 'exportar_xlsx',
    botao_nome: 'Exportar .xlsx',
    ordem: 7,
    adm: true,
    coordenador: false,
    supervisor: false,
    gerente: false,
    created: '2026-09-24',
    updated: '2026-09-24',
  },
]

describe('Parametrização de Visibilidade de Botões por Perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(configBotoesService, 'fetchConfigBotoes').mockResolvedValue(
      JSON.parse(JSON.stringify(defaultMockBotoes)),
    )
  })

  describe('1. Regras Padrão (só ADM vê os botões)', () => {
    it('ADM visualiza botões em Inadimplência', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_adm',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Admin',
          email: 'adm@test.com',
          role: 'ADM',
          lojas: [],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Relacionamento />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText('Limpar Dados')).toBeDefined()
        expect(screen.getByText('Exportar .xlsx')).toBeDefined()
      })
    })

    it('Supervisor NÃO visualiza botões com config padrão em Inadimplência', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_sup',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Supervisor',
          email: 'sup@test.com',
          role: 'Supervisor',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Relacionamento />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText('Gestão de Clientes em Inadimplência')).toBeDefined()
      })

      expect(screen.queryByText('Limpar Dados')).toBeNull()
      expect(screen.queryByText('Exportar .xlsx')).toBeNull()
    })

    it('Gerente NÃO visualiza botões em Ranking por Vendedor com config padrão', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_ger',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Gerente',
          email: 'ger@test.com',
          role: 'Gerente',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Vendedores />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText(/Ranking por Vendedor/i)).toBeDefined()
      })

      expect(screen.queryByText('Limpar Vendedores')).toBeNull()
      expect(screen.queryByText('Exportar .xlsx')).toBeNull()
    })

    it('Coordenador NÃO visualiza exportação em Principais Ofensores com config padrão', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_coord',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Coordenador',
          email: 'coord@test.com',
          role: 'Coordenador',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <TopOfensores />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText(/Principais Ofensores/i)).toBeDefined()
      })

      expect(screen.queryByText(/Exportar Principais Ofensores/i)).toBeNull()
    })

    it('Supervisor NÃO visualiza Limpar Dados nem Exportar em Painel de Lojas com config padrão', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_sup',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Supervisor',
          email: 'sup@test.com',
          role: 'Supervisor',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Arquivos />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText(/Painel de Lojas/i)).toBeDefined()
      })

      expect(screen.queryByText('Limpar Dados')).toBeNull()
      expect(screen.queryByText('Exportar .xlsx')).toBeNull()
    })
  })

  describe('2. Configuração Habilitada para Outro Perfil', () => {
    it('Quando supervisor=true para exportar_xlsx em Inadimplência, o botão passa a ser exibido para Supervisor', async () => {
      const customConfig = JSON.parse(JSON.stringify(defaultMockBotoes))
      const target = customConfig.find(
        (b: any) => b.tela_id === 'inadimplencia' && b.botao_id === 'exportar_xlsx',
      )
      if (target) target.supervisor = true

      vi.spyOn(configBotoesService, 'fetchConfigBotoes').mockResolvedValue(customConfig)

      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_sup',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Supervisor',
          email: 'sup@test.com',
          role: 'Supervisor',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Relacionamento />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText('Exportar .xlsx')).toBeDefined()
      })

      // Limpar dados continua oculto pois continuou supervisor=false
      expect(screen.queryByText('Limpar Dados')).toBeNull()
    })

    it('Quando gerente=true para exportar_xlsx em Ranking por Vendedor, o botão passa a ser exibido para Gerente', async () => {
      const customConfig = JSON.parse(JSON.stringify(defaultMockBotoes))
      const target = customConfig.find(
        (b: any) => b.tela_id === 'ranking_vendedores' && b.botao_id === 'exportar_xlsx',
      )
      if (target) target.gerente = true

      vi.spyOn(configBotoesService, 'fetchConfigBotoes').mockResolvedValue(customConfig)

      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: 'u_ger',
          collectionId: 'users',
          collectionName: 'users',
          name: 'Gerente',
          email: 'ger@test.com',
          role: 'Gerente',
          lojas: ['loja1'],
        } as any,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(
        <MemoryRouter>
          <Vendedores />
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getByText('Exportar .xlsx')).toBeDefined()
      })

      expect(screen.queryByText('Limpar Vendedores')).toBeNull()
    })
  })

  describe('3. Aba Botões e Ações (AdminBotoesTab) - Salvamento e Rollback', () => {
    it('renderiza os 7 botões agrupados por tela', async () => {
      render(<AdminBotoesTab />)

      await waitFor(() => {
        expect(screen.getByText('Botões e Ações')).toBeDefined()
        expect(screen.getByText('Ranking por Vendedor')).toBeDefined()
        expect(screen.getByText('Principais Ofensores')).toBeDefined()
        expect(screen.getByText('Painel de Lojas')).toBeDefined()
        expect(screen.getByText('Inadimplência')).toBeDefined()
      })

      // Botões individuais
      expect(screen.getAllByText('Limpar Vendedores').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Exportar Principais Ofensores (.xlsx)').length).toBeGreaterThan(0)
    })

    it('toggle chama updateConfigBotaoRole com sucesso e notifica toast', async () => {
      const updateSpy = vi.spyOn(configBotoesService, 'updateConfigBotaoRole').mockResolvedValue({
        ...defaultMockBotoes[0],
        supervisor: true,
      })

      const user = userEvent.setup()
      render(<AdminBotoesTab />)

      await waitFor(() => {
        expect(screen.getByLabelText('Toggle Supervisão Limpar Vendedores')).toBeDefined()
      })

      const switchSup = screen.getByLabelText('Toggle Supervisão Limpar Vendedores')
      await user.click(switchSup)

      expect(updateSpy).toHaveBeenCalledWith('btn1', 'supervisor', true)
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Permissão atualizada!',
          }),
        )
      })
    })

    it('toggle faz rollback do estado e emite toast de erro quando a API falha', async () => {
      vi.spyOn(configBotoesService, 'updateConfigBotaoRole').mockRejectedValue(
        new Error('Falha de conexão com o banco'),
      )

      const user = userEvent.setup()
      render(<AdminBotoesTab />)

      await waitFor(() => {
        expect(screen.getByLabelText('Toggle Gerente Limpar Vendedores')).toBeDefined()
      })

      const switchGer = screen.getByLabelText('Toggle Gerente Limpar Vendedores')
      expect(switchGer.getAttribute('data-state')).toBe('unchecked')

      await user.click(switchGer)

      // Deve ter tentado salvar
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Erro ao salvar alteração',
            variant: 'destructive',
          }),
        )
      })

      // Rollback: volta para unchecked
      expect(switchGer.getAttribute('data-state')).toBe('unchecked')
    })
  })
})
