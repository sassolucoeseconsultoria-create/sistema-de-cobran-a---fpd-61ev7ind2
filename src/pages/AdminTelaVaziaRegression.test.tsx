import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Admin from '@/pages/Admin'
import * as AuthContext from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import * as FpdService from '@/services/fpdService'
import * as RefDatePermService from '@/services/referenceDatePermissionService'
import { TooltipProvider } from '@/components/ui/tooltip'

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
      authStore: { model: null },
    },
    pb: undefined,
    isSessionExpiredError: vi.fn(() => false),
    handleSessionExpired: vi.fn(),
    AUTH_REDIRECT_KEY: 'auth_redirect',
    SESSION_EXPIRED_BANNER_KEY: 'session_expired_banner',
  }
})

/**
 * Regressão do sintoma RECORRENTE "requests 200 mas tela vazia": o backend
 * responde 200 para users e stores, mas o /admin renderiza sem usuários e sem
 * lojas. O banco SEMPRE tem registros (40 usuários, 32 lojas) — lista vazia
 * sem filtro ativo é carga incompleta e precisa de aviso + "Tentar novamente".
 */
describe('Admin - requests 200 mas tela vazia (regressão)', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })
    vi.spyOn(FpdService, 'fetchDistinctReferenceDates').mockResolvedValue([])
    vi.spyOn(RefDatePermService, 'fetchReferenceDatePermissions').mockResolvedValue([])
  })

  it('users 200 com lista vazia: aviso visível + botão Tentar novamente (nunca silêncio)', async () => {
    const usersCol = pb.collection('users') as any
    // O backend respondeu 200 mas o payload veio sem registros
    usersCol.getFullList.mockResolvedValue([])
    vi.spyOn(FpdService, 'fetchStores').mockResolvedValue([
      { id: 'st_1', name: 'CELNET TAGUATINGA', collectionId: 'stores', collectionName: 'stores' },
    ])

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    // A tela NÃO mostra "Nenhum usuário encontrado" seco: mostra aviso de
    // carga incompleta com ação de recarregar
    await waitFor(() => {
      expect(screen.getByText(/o servidor não retornou nenhum usuário/i)).not.toBeNull()
    })
    const retryBtn = screen.getAllByRole('button', { name: /tentar novamente/i })[0]
    expect(retryBtn).toBeDefined()

    // "Tentar novamente" recarrega — agora com dados, a tabela aparece
    usersCol.getFullList.mockResolvedValue([mockAdminUser])
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })
  })

  it('stores 200 com lista vazia: aviso visível (não renderiza seletor de lojas vazio em silêncio)', async () => {
    const usersCol = pb.collection('users') as any
    usersCol.getFullList.mockResolvedValue([mockAdminUser])
    vi.spyOn(FpdService, 'fetchStores').mockResolvedValue([])

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })

    await waitFor(() => {
      expect(screen.getByText(/a lista de lojas veio vazia do servidor/i)).not.toBeNull()
    })
  })

  it('remontagem em sequência: promessa órfã não deixa loading preso nem sobrescreve estado', async () => {
    const usersCol = pb.collection('users') as any
    // Primeira chamada (montagem que será descartada) nunca resolve;
    // segunda (montagem atual) resolve com dados
    let resolveSecond!: (v: AuthContext.User[]) => void
    usersCol.getFullList
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(
        () =>
          new Promise<AuthContext.User[]>((resolve) => {
            resolveSecond = resolve
          }),
      )
    vi.spyOn(FpdService, 'fetchStores').mockResolvedValue([])

    const { unmount } = render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )
    unmount()

    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    // A segunda montagem resolve e a tabela aparece (loading não ficou preso)
    await waitFor(() => {
      expect(usersCol.getFullList).toHaveBeenCalledTimes(2)
    })
    resolveSecond([mockAdminUser])

    await waitFor(() => {
      expect(screen.getByText('Admin Celnet')).not.toBeNull()
    })
    expect(screen.queryByText(/carregando/i)).toBeNull()
  })
})
