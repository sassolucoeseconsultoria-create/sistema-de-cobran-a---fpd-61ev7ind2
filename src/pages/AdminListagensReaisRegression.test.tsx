import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import Admin from '@/pages/Admin'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { isSessionExpiredError, handleSessionExpired } from '@/lib/pocketbase/client'
import * as FpdService from '@/services/fpdService'
import * as RefDatePermService from '@/services/referenceDatePermissionService'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { StoreRecord } from '@/types/fpd'

vi.mock('@/hooks/use-realtime', () => ({
  default: vi.fn(),
  useRealtime: vi.fn(),
}))

vi.mock('@/lib/pocketbase/client', () => {
  const collectionMock = {
    getFullList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  return {
    default: {
      collection: vi.fn(() => collectionMock),
      authStore: {
        model: null,
      },
    },
    isSessionExpiredError: vi.fn(() => false),
    handleSessionExpired: vi.fn(),
    // O módulo real reexporta ./session — manter a superfície compatível
    AUTH_REDIRECT_KEY: 'auth_redirect',
    SESSION_EXPIRED_BANNER_KEY: 'session_expired_banner',
  }
})

/**
 * Regressão: no /admin a lista de usuários aparecia VAZIA (retorno silencioso
 * em caso de erro) e a lista de lojas descartava as lojas reais criadas em
 * execução que não casavam EXATAMENTE com a lista fixa (CALL JK, CALL UP,
 * CALL ARNIQUEIRAS, CALL NOVA SUIÇA, ILHA RESIDENCIAL...).
 */
describe('Admin - exibição de usuários e lojas reais (regressão tela vazia)', () => {
  const mockAdminUser: AuthContext.User = {
    id: 'usr_admin',
    collectionId: 'users',
    collectionName: 'users',
    email: 'mind3adm@gmail.com',
    name: 'Admin Celnet',
    role: 'ADM',
    lojas: [],
    ativo: true,
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  // 40 usuários existem no banco; para o teste bastam alguns representativos
  const mockUsersList: AuthContext.User[] = [
    mockAdminUser,
    {
      id: 'usr_andre',
      collectionId: 'users',
      collectionName: 'users',
      email: 'andrecassiocelnet@gmail.com',
      name: 'André Cássio',
      role: 'Supervisor',
      lojas: ['st_jk'],
      ativo: true,
      created: '2025-01-02',
      updated: '2025-01-02',
    },
    {
      id: 'usr_karen',
      collectionId: 'users',
      collectionName: 'users',
      email: 'karennatashacelnet@gmail.com',
      name: 'Karen Natasha',
      role: 'Gerente',
      lojas: ['st_ilha'],
      ativo: true,
      created: '2025-01-03',
      updated: '2025-01-03',
    },
  ]

  // Lojas reais do banco: as duas primeiras estão na lista fixa; as demais
  // foram criadas em execução e NÃO fazem parte de FIXED_STORE_NAMES.
  const realStores: StoreRecord[] = [
    { id: 'st_1', name: 'CELNET AGUAS CLARAS', collectionId: 'stores', collectionName: 'stores' },
    { id: 'st_2', name: 'CELNET TAGUATINGA', collectionId: 'stores', collectionName: 'stores' },
    { id: 'st_jk', name: 'CELNET CALL JK', collectionId: 'stores', collectionName: 'stores' },
    {
      id: 'st_up',
      name: 'CELNET CALL UP',
      collectionId: 'stores',
      collectionName: 'stores',
    },
    {
      id: 'st_arn',
      name: 'CELNET CALL ARNIQUEIRAS',
      collectionId: 'stores',
      collectionName: 'stores',
    },
    {
      id: 'st_ns',
      name: 'CELNET CALL NOVA SUIÇA',
      collectionId: 'stores',
      collectionName: 'stores',
    },
    {
      id: 'st_ilha',
      name: 'CELNET ILHA RESIDENCIAL',
      collectionId: 'stores',
      collectionName: 'stores',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSessionExpiredError).mockReturnValue(false)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const usersCol = pb.collection('users') as any
    usersCol.getFullList.mockResolvedValue(mockUsersList)
    usersCol.create.mockImplementation((data: any) =>
      Promise.resolve({ id: `usr_${Date.now()}`, ...data }),
    )
    usersCol.update.mockImplementation((id: string, data: any) => Promise.resolve({ id, ...data }))
    usersCol.delete.mockResolvedValue(true)

    vi.spyOn(FpdService, 'fetchStores').mockResolvedValue(realStores)
    vi.spyOn(FpdService, 'fetchDistinctReferenceDates').mockResolvedValue([])
    vi.spyOn(RefDatePermService, 'fetchReferenceDatePermissions').mockResolvedValue([])
  })

  it('mostra todos os usuários cadastrados do banco na tabela', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })
    expect(screen.getByText('André Cássio')).not.toBeNull()
    expect(screen.getByText('Karen Natasha')).not.toBeNull()
  })

  it('exibe TODAS as lojas reais do banco, incluindo as criadas em execução (fora da lista fixa)', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })

    fireEvent.click(screen.getByText('Cadastrar Usuário'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /cadastrar novo usuário/i })).not.toBeNull()
    })

    // Modal de vínculo: as 7 lojas reais — inclusive as 5 fora da lista fixa
    expect(screen.getByText('CELNET CALL JK')).not.toBeNull()
    expect(screen.getByText('CELNET CALL UP')).not.toBeNull()
    expect(screen.getByText('CELNET CALL ARNIQUEIRAS')).not.toBeNull()
    expect(screen.getByText('CELNET CALL NOVA SUIÇA')).not.toBeNull()
    expect(screen.getByText('CELNET ILHA RESIDENCIAL')).not.toBeNull()
    expect(screen.getByText('CELNET AGUAS CLARAS')).not.toBeNull()
    expect(screen.getByText('CELNET TAGUATINGA')).not.toBeNull()
  })

  it('não duplica nem substitui as lojas reais pela lista fixa local', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })

    fireEvent.click(screen.getByText('Cadastrar Usuário'))

    await waitFor(() => {
      expect(screen.getByText('CELNET CALL JK')).not.toBeNull()
    })

    // Cada loja real aparece exatamente uma vez (sem duplicação com fallback local)
    expect(screen.getAllByText('CELNET CALL JK')).toHaveLength(1)
    expect(screen.getAllByText('CELNET ILHA RESIDENCIAL')).toHaveLength(1)
  })

  it('mostra aviso visível quando a busca de usuários falha (não fica silenciosamente vazia)', async () => {
    const usersCol = pb.collection('users') as any
    usersCol.getFullList.mockRejectedValue(new Error('network down'))

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).not.toBeNull()
    })
    // Mensagem de erro visível + botão de tentar novamente
    expect(screen.getByText(/não foi possível buscar os usuários cadastrados/i)).not.toBeNull()
    expect(screen.getByRole('button', { name: /tentar novamente/i })).not.toBeNull()
    // Nenhum usuário é exibido, mas o aviso está lá
    expect(screen.queryByText('André Cássio')).toBeNull()
  })

  it('sessão expirada na carga de usuários: aviso visível + mecanismo handleSessionExpired', async () => {
    const usersCol = pb.collection('users') as any
    const sessionErr = new Error('session expired')
    usersCol.getFullList.mockRejectedValue(sessionErr)
    vi.mocked(isSessionExpiredError).mockImplementation((err) => err === sessionErr)

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).not.toBeNull()
    })
    expect(screen.getByText(/sua sessão expirou.*faça login novamente/i)).not.toBeNull()
    expect(handleSessionExpired).toHaveBeenCalledWith(
      expect.stringMatching(/faça login novamente/i),
    )
    expect(screen.getByRole('button', { name: /tentar novamente/i })).not.toBeNull()
  })

  it('mostra aviso visível quando a busca de lojas falha', async () => {
    vi.spyOn(FpdService, 'fetchStores').mockRejectedValue(new Error('stores failed'))

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })

    await waitFor(() => {
      expect(screen.getByText(/não foi possível carregar a lista de lojas/i)).not.toBeNull()
    })
  })

  it('aviso de falha de lojas também aparece no modal de vínculo de usuário', async () => {
    vi.spyOn(FpdService, 'fetchStores').mockRejectedValue(new Error('stores failed'))

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })
    await waitFor(() => {
      expect(screen.getByText(/não foi possível carregar a lista de lojas/i)).not.toBeNull()
    })

    fireEvent.click(screen.getByText('Cadastrar Usuário'))

    const alerts = screen.getAllByRole('alert')
    const modalAlert = alerts.find((a) =>
      within(a).queryByText(/não foi possível carregar a lista de lojas/i),
    )
    expect(modalAlert).toBeDefined()
  })
})
