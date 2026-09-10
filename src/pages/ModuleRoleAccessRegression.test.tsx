import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Vendedores } from '@/pages/Vendedores'
import { TopOfensores } from '@/pages/TopOfensores'
import { Arquivos } from '@/pages/Arquivos'
import { Relacionamento } from '@/pages/Relacionamento'

// Mock pocketbase
vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    collection: vi.fn(),
  },
}))

// Mock fpdService
vi.mock('@/services/fpdService', () => ({
  fetchStores: vi.fn().mockResolvedValue([
    { id: 'store_1', name: 'CELNET AGUAS CLARAS', coordenacao: 'Coord Leste', supervisao: 'Sup 1' },
    { id: 'store_2', name: 'CELNET TAGUATINGA', coordenacao: 'Coord Leste', supervisao: 'Sup 1' },
    { id: 'store_3', name: 'CELNET CEILANDIA', coordenacao: 'Coord Oeste', supervisao: 'Sup 2' },
  ]),
  fetchFpdRecords: vi.fn().mockResolvedValue([
    {
      id: 'rec_1',
      store: 'store_1',
      referente: '15/01/2025',
      fatura_paga: 10,
      envio_fatura: 5,
      promessa_pagto: 3,
      sem_contato: 2,
      cancelados: 1,
      pendente: 4,
      contato_realizado: 2,
      nao_tratados: 1,
      total_linhas: 28,
      created: '2025-01-15',
    },
    {
      id: 'rec_2',
      store: 'store_2',
      referente: '15/01/2025',
      fatura_paga: 8,
      envio_fatura: 4,
      promessa_pagto: 2,
      sem_contato: 1,
      cancelados: 2,
      pendente: 3,
      contato_realizado: 1,
      nao_tratados: 0,
      total_linhas: 21,
      created: '2025-01-15',
    },
    {
      id: 'rec_3',
      store: 'store_3',
      referente: '15/01/2025',
      fatura_paga: 15,
      envio_fatura: 7,
      promessa_pagto: 5,
      sem_contato: 3,
      cancelados: 4,
      pendente: 6,
      contato_realizado: 3,
      nao_tratados: 2,
      total_linhas: 45,
      created: '2025-01-15',
    },
  ]),
  fetchVendorConsolidations: vi.fn().mockResolvedValue([
    {
      id: 'vc_1',
      loja: 'CELNET AGUAS CLARAS',
      vendedor: 'Vendedor Aguas 1',
      fatura_paga: 5,
      envio_fatura: 2,
      promessa_pagto: 1,
      sem_contato: 0,
      cancelados: 1,
      pendente: 10,
      contato_realizado: 0,
      nao_tratados: 0,
      total_linhas: 19,
    },
    {
      id: 'vc_2',
      loja: 'CELNET TAGUATINGA',
      vendedor: 'Vendedor Taguatinga 1',
      fatura_paga: 3,
      envio_fatura: 1,
      promessa_pagto: 0,
      sem_contato: 1,
      cancelados: 0,
      pendente: 8,
      contato_realizado: 0,
      nao_tratados: 0,
      total_linhas: 13,
    },
    {
      id: 'vc_3',
      loja: 'CELNET CEILANDIA',
      vendedor: 'Vendedor Ceilandia 1',
      fatura_paga: 12,
      envio_fatura: 4,
      promessa_pagto: 2,
      sem_contato: 1,
      cancelados: 1,
      pendente: 25,
      contato_realizado: 1,
      nao_tratados: 0,
      total_linhas: 46,
    },
  ]),
  fetchFpdRecordsByStore: vi.fn().mockResolvedValue([]),
  deleteFpdRecord: vi.fn().mockResolvedValue(true),
  clearAllFpdRecords: vi.fn().mockResolvedValue(true),
  clearAllVendorConsolidations: vi.fn().mockResolvedValue(true),
  clearAllStores: vi.fn().mockResolvedValue(true),
}))

// Mock relacionamentoService
vi.mock('@/services/relacionamentoService', () => ({
  fetchDistinctAnalyticalLojas: vi
    .fn()
    .mockResolvedValue(['CELNET AGUAS CLARAS', 'CELNET TAGUATINGA', 'CELNET CEILANDIA']),
  insertMovelBatch: vi.fn(),
  insertResidencialBatch: vi.fn(),
  invalidateAnalyticalCache: vi.fn(),
  clearAllAnalyticalRows: vi
    .fn()
    .mockResolvedValue({ success: true, movelCount: 0, residencialCount: 0 }),
}))

describe('Regras de Acesso por Perfil nos 4 Módulos (Supervisor, Coordenador, ADM)', () => {
  const supervisorUser = {
    id: 'usr_sup_1',
    collectionId: 'users',
    collectionName: 'users',
    email: 'sup@celnet.com.br',
    name: 'Supervisor Carlos',
    role: 'Supervisor' as const,
    lojas: ['store_1', 'store_2'], // Aguas Claras e Taguatinga apenas
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  const coordenadorUser = {
    id: 'usr_coord_1',
    collectionId: 'users',
    collectionName: 'users',
    email: 'coord@celnet.com.br',
    name: 'Coordenadora Ana',
    role: 'Coordenador' as const,
    lojas: ['store_1'], // Aguas Claras apenas
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  const supervisorSemLoja = {
    id: 'usr_sup_sem_loja',
    collectionId: 'users',
    collectionName: 'users',
    email: 'sup.semloja@celnet.com.br',
    name: 'Supervisor Sem Loja',
    role: 'Supervisor' as const,
    lojas: [],
    created: '2025-01-01',
    updated: '2025-01-01',
  }

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

    const mockMovel = {
      getList: vi.fn().mockImplementation((_page, _perPage, options) => {
        const filter = options?.filter || ''
        if (filter.includes('store_3') || filter.includes('CEILANDIA')) {
          return Promise.resolve({ items: [], totalItems: 0, totalPages: 1 })
        }
        return Promise.resolve({
          items: [
            {
              id: 'm1',
              linha: 1,
              loja: 'CELNET AGUAS CLARAS',
              cliente: 'Cliente Aguas',
              vendedor: 'Vendedor Aguas 1',
              ocorrencias: 'Não Tratados',
            },
          ],
          totalItems: 10,
          totalPages: 1,
        })
      }),
      getFullList: vi.fn().mockResolvedValue([]),
    }

    const mockResidencial = {
      getList: vi.fn().mockImplementation(() =>
        Promise.resolve({
          items: [
            {
              id: 'r1',
              linha: 1,
              loja: 'CELNET AGUAS CLARAS',
              cliente: 'Cliente Res Aguas',
              vendedor: 'Vendedor Aguas 1',
              ocorrencias: 'Fatura(s) Paga(s)',
            },
          ],
          totalItems: 5,
          totalPages: 1,
        }),
      ),
      getFullList: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'movel') return mockMovel as any
      if (name === 'residencial') return mockResidencial as any
      return {
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0, totalPages: 1 }),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })
  })

  // 1. Ranking por Vendedor (/vendedores)
  describe('1. Ranking por Vendedor (/vendedores)', () => {
    it('Supervisor vê apenas vendedores de suas lojas vinculadas e dropdown restrito', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorUser,
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
        expect(screen.getByText('Vendedor Aguas 1')).toBeDefined()
        expect(screen.getByText('Vendedor Taguatinga 1')).toBeDefined()
        expect(screen.queryByText('Vendedor Ceilandia 1')).toBeNull()
      })

      // Seletor de loja deve listar apenas "Todas as Lojas (Suas Lojas)" + Aguas Claras + Taguatinga
      const storeSelect = screen.getByRole('combobox', {
        name: /selecionar loja/i,
      }) as HTMLSelectElement
      const options = Array.from(storeSelect.options).map((o) => o.text.trim())
      expect(options).toContain('Todas as Lojas (Suas Lojas)')
      expect(options).toContain('CELNET AGUAS CLARAS')
      expect(options).toContain('CELNET TAGUATINGA')
      expect(options).not.toContain('CELNET CEILANDIA')
    })

    it('Supervisor sem lojas vinculadas vê banner de aviso e nenhum vendedor', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorSemLoja,
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
        expect(screen.getByTestId('gerente-sem-loja-banner')).toBeDefined()
        expect(
          screen.getByText(/Nenhuma loja vinculada ao seu perfil de Supervisor/i),
        ).toBeDefined()
      })

      expect(screen.queryByText('Vendedor Aguas 1')).toBeNull()
      expect(screen.queryByText('Vendedor Taguatinga 1')).toBeNull()
      expect(screen.queryByText('Vendedor Ceilandia 1')).toBeNull()
    })
  })

  // 2. Principais Ofensores (/top-ofensores)
  describe('2. Principais Ofensores (/top-ofensores)', () => {
    it('Supervisor vê apenas ofensores de suas lojas e limite de Top 10', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorUser,
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
        expect(screen.getByText('Vendedor Aguas 1')).toBeDefined()
        expect(screen.getByText('Vendedor Taguatinga 1')).toBeDefined()
        expect(screen.queryByText('Vendedor Ceilandia 1')).toBeNull()
      })

      // Badge de perfil
      expect(screen.getByText(/Supervisor: Top 10/i)).toBeDefined()

      // Dropdown de loja não tem Ceilândia
      const storeSelect = screen.getByRole('combobox', {
        name: /selecionar loja/i,
      }) as HTMLSelectElement
      const options = Array.from(storeSelect.options).map((o) => o.text.trim())
      expect(options).toContain('Todas as Lojas (Suas Lojas)')
      expect(options).not.toContain('CELNET CEILANDIA')
    })

    it('Coordenador vê apenas ofensores da sua loja vinculada e limite de Top 20', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: coordenadorUser,
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
        expect(screen.getByText('Vendedor Aguas 1')).toBeDefined()
        expect(screen.queryByText('Vendedor Taguatinga 1')).toBeNull()
        expect(screen.queryByText('Vendedor Ceilandia 1')).toBeNull()
      })

      expect(screen.getByText(/Coordenador: Top 20/i)).toBeDefined()
    })

    it('Supervisor sem loja vinculada vê banner de aviso e tabela vazia', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorSemLoja,
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
        expect(screen.getByTestId('no-store-banner')).toBeDefined()
        expect(
          screen.getByText(/Nenhuma loja vinculada ao seu perfil de Supervisor/i),
        ).toBeDefined()
      })

      expect(screen.queryByText('Vendedor Aguas 1')).toBeNull()
    })
  })

  // 3. Painel de Lojas (/arquivos)
  describe('3. Painel de Lojas (/arquivos)', () => {
    it('Supervisor vê apenas suas lojas vinculadas no consolidado e nos totais', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorUser,
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
        expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
        expect(screen.getByText('CELNET TAGUATINGA')).toBeDefined()
        expect(screen.queryByText('CELNET CEILANDIA')).toBeNull()
      })

      // Lojas Cadastradas card deve mostrar 2 (e não 3)
      expect(screen.getByText('2')).toBeDefined()
    })

    it('Supervisor sem loja vinculada no Painel de Lojas vê banner orientando vínculo', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorSemLoja,
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
        expect(screen.getByTestId('no-store-banner')).toBeDefined()
        expect(
          screen.getByText(/Nenhuma loja vinculada ao seu perfil de Supervisor/i),
        ).toBeDefined()
      })

      expect(screen.queryByText('CELNET AGUAS CLARAS')).toBeNull()
      expect(screen.queryByText('CELNET TAGUATINGA')).toBeNull()
      expect(screen.queryByText('CELNET CEILANDIA')).toBeNull()
    })
  })

  // 4. Inadimplência (/relacionamento)
  describe('4. Inadimplência (/relacionamento)', () => {
    it('Supervisor vê no seletor de loja apenas suas lojas vinculadas e opção Todas', async () => {
      const user = userEvent.setup()
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorUser,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(<Relacionamento />)

      await waitFor(() => {
        expect(screen.getByText('Clientes Móvel')).toBeDefined()
      })

      const storeSelect = screen.getByRole('combobox', { name: /loja:/i })
      await user.click(storeSelect)

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Todas as Lojas/i })).toBeDefined()
        expect(screen.getByRole('option', { name: /CELNET AGUAS CLARAS/i })).toBeDefined()
        expect(screen.getByRole('option', { name: /CELNET TAGUATINGA/i })).toBeDefined()
        expect(screen.queryByRole('option', { name: /CELNET CEILANDIA/i })).toBeNull()
      })
    })

    it('Supervisor Jéssica NÃO vê lojas CALL/ILHA nem lojas de Luana na Inadimplência', async () => {
      const user = userEvent.setup()
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: {
          id: '9c4wgk0dup9yoko',
          collectionId: 'users',
          collectionName: 'users',
          email: 'jessica@celnet.com.br',
          name: 'Jessica',
          role: 'Supervisor',
          lojas: ['store-taguatinga'], // simula loja vinculada a ela
          created: '2025-01-01',
          updated: '2025-01-01',
        },
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(<Relacionamento />)

      await waitFor(() => {
        expect(screen.getByText('Clientes Móvel')).toBeDefined()
      })

      const storeSelect = screen.getByRole('combobox', { name: /loja:/i })
      await user.click(storeSelect)

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /CELNET TAGUATINGA/i })).toBeDefined()
        expect(screen.queryByRole('option', { name: /CELNET CALL NOVA SUIÇA/i })).toBeNull()
        expect(screen.queryByRole('option', { name: /CELNET AGUAS CLARAS/i })).toBeNull()
      })
    })

    it('Supervisor sem loja vinculada vê aviso amigável e contadores zerados', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: supervisorSemLoja,
        token: 'token',
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
        refreshAuth: vi.fn(),
      })

      render(<Relacionamento />)

      await waitFor(() => {
        expect(screen.getByTestId('no-store-banner')).toBeDefined()
        expect(
          screen.getByText(/Nenhuma loja vinculada ao seu perfil de Supervisor/i),
        ).toBeDefined()
      })

      expect(screen.queryByText('Cliente Aguas')).toBeNull()
    })
  })

  // 5. ADM intacto em todos os módulos
  describe('5. ADM intacto', () => {
    it('ADM visualiza todas as 3 lojas no Painel de Lojas e todos os vendedores no Ranking', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: admUser,
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
        expect(screen.getByText('CELNET AGUAS CLARAS')).toBeDefined()
        expect(screen.getByText('CELNET TAGUATINGA')).toBeDefined()
        expect(screen.getByText('CELNET CEILANDIA')).toBeDefined()
      })
    })
  })

  // 6. Visibilidade de Botões de Ação por Perfil (ADM vs Gerente, Supervisor, Coordenador)
  describe('6. Visibilidade de Botões de Ação por Perfil (Ranking Vendedores, Principais Ofensores, Painel de Lojas)', () => {
    const gerenteUser = {
      id: 'usr_gerente_1',
      collectionId: 'users',
      collectionName: 'users',
      email: 'gerente@celnet.com.br',
      name: 'Gerente Loja 1',
      role: 'Gerente' as const,
      lojas: ['store_1'],
      created: '2025-01-01',
      updated: '2025-01-01',
    }

    it('Ranking por Vendedor: ADM vê "Limpar Vendedores" e "Exportar .xlsx"', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: admUser,
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
        expect(screen.getByRole('button', { name: /Limpar Vendedores/i })).toBeDefined()
        expect(screen.getByRole('button', { name: /Exportar \.xlsx/i })).toBeDefined()
      })
    })

    it('Ranking por Vendedor: Gerente, Supervisor e Coordenador NÃO veem os botões', async () => {
      for (const nonAdmUser of [gerenteUser, supervisorUser, coordenadorUser]) {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: nonAdmUser,
          token: 'token',
          loading: false,
          login: vi.fn(),
          logout: vi.fn(),
          refreshAuth: vi.fn(),
        })

        const { unmount } = render(
          <MemoryRouter>
            <Vendedores />
          </MemoryRouter>,
        )

        await waitFor(() => {
          expect(screen.queryByRole('button', { name: /Limpar Vendedores/i })).toBeNull()
          expect(screen.queryByRole('button', { name: /Exportar \.xlsx/i })).toBeNull()
        })

        unmount()
      }
    })

    it('Principais Ofensores: ADM vê "Exportar Principais Ofensores (.xlsx)"', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: admUser,
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
        expect(screen.getByRole('button', { name: /Exportar Principais Ofensores/i })).toBeDefined()
      })
    })

    it('Principais Ofensores: Gerente, Supervisor e Coordenador NÃO veem o botão de exportar', async () => {
      for (const nonAdmUser of [gerenteUser, supervisorUser, coordenadorUser]) {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: nonAdmUser,
          token: 'token',
          loading: false,
          login: vi.fn(),
          logout: vi.fn(),
          refreshAuth: vi.fn(),
        })

        const { unmount } = render(
          <MemoryRouter>
            <TopOfensores />
          </MemoryRouter>,
        )

        await waitFor(() => {
          expect(
            screen.queryByRole('button', { name: /Exportar Principais Ofensores/i }),
          ).toBeNull()
        })

        unmount()
      }
    })

    it('Painel de Lojas: ADM vê "Limpar Dados" e "Exportar .xlsx"', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: admUser,
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
        expect(screen.getByRole('button', { name: /Limpar Dados/i })).toBeDefined()
        expect(screen.getByRole('button', { name: /Exportar \.xlsx/i })).toBeDefined()
      })
    })

    it('Painel de Lojas: Gerente, Supervisor e Coordenador NÃO veem os botões de ação', async () => {
      for (const nonAdmUser of [gerenteUser, supervisorUser, coordenadorUser]) {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: nonAdmUser,
          token: 'token',
          loading: false,
          login: vi.fn(),
          logout: vi.fn(),
          refreshAuth: vi.fn(),
        })

        const { unmount } = render(
          <MemoryRouter>
            <Arquivos />
          </MemoryRouter>,
        )

        await waitFor(() => {
          expect(screen.queryByRole('button', { name: /Limpar Dados/i })).toBeNull()
          expect(screen.queryByRole('button', { name: /Exportar \.xlsx/i })).toBeNull()
        })

        unmount()
      }
    })
  })
})
