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
      authStore: {
        model: null,
      },
    },
    isSessionExpiredError: vi.fn(() => false),
    handleSessionExpired: vi.fn(),
  }
})

describe('Admin - Gestão de Usuários e Perfis', () => {
  const mockAdminUser: AuthContext.User = {
    id: 'usr_admin',
    collectionId: 'users',
    collectionName: 'users',
    email: 'admin@celnet.com.br',
    name: 'Admin Master',
    role: 'ADM',
    lojas: [],
    ativo: true,
    created: '2025-01-01',
    updated: '2025-01-01',
  }

  const mockUsersList: AuthContext.User[] = [
    {
      id: 'usr_admin',
      collectionId: 'users',
      collectionName: 'users',
      email: 'admin@celnet.com.br',
      name: 'Admin Master',
      role: 'ADM',
      lojas: [],
      ativo: true,
      created: '2025-01-01',
      updated: '2025-01-01',
    },
    {
      id: 'usr_gerente',
      collectionId: 'users',
      collectionName: 'users',
      email: 'gerente@celnet.com.br',
      name: 'Gerente Loja 1',
      role: 'Gerente',
      lojas: ['store_1'],
      ativo: true,
      created: '2025-01-02',
      updated: '2025-01-02',
    },
    {
      id: 'usr_super',
      collectionId: 'users',
      collectionName: 'users',
      email: 'supervisor@celnet.com.br',
      name: 'Supervisor Regional',
      role: 'Supervisor',
      lojas: ['store_1', 'store_2'],
      ativo: false,
      created: '2025-01-03',
      updated: '2025-01-03',
    },
  ]

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

    const usersCol = pb.collection('users') as any
    usersCol.getFullList.mockResolvedValue(mockUsersList)
    usersCol.create.mockImplementation((data: any) =>
      Promise.resolve({ id: `usr_${Date.now()}`, ...data }),
    )
    usersCol.update.mockImplementation((id: string, data: any) => Promise.resolve({ id, ...data }))
    usersCol.delete.mockResolvedValue(true)

    vi.spyOn(FpdService, 'fetchStores').mockResolvedValue([
      {
        id: 'store_1',
        name: 'CELNET AGUAS CLARAS',
        collectionId: 'stores',
        collectionName: 'stores',
      },
      {
        id: 'store_2',
        name: 'CELNET TAGUATINGA',
        collectionId: 'stores',
        collectionName: 'stores',
      },
    ])
    vi.spyOn(FpdService, 'fetchDistinctReferenceDates').mockResolvedValue([])
    vi.spyOn(RefDatePermService, 'fetchReferenceDatePermissions').mockResolvedValue([])
  })

  it('lista usuários na tabela com seus perfis e status ativo/inativo', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Master')).not.toBeNull()
      expect(screen.getByText('Gerente Loja 1')).not.toBeNull()
      expect(screen.getByText('Supervisor Regional')).not.toBeNull()
    })

    // Verifica se os e-mails estão presentes
    expect(screen.getByText('admin@celnet.com.br')).not.toBeNull()
    expect(screen.getByText('gerente@celnet.com.br')).not.toBeNull()
    expect(screen.getByText('supervisor@celnet.com.br')).not.toBeNull()

    // Status ativo/inativo renderizado na tabela
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0)
    expect(screen.getByText('Inativo')).not.toBeNull()
  })

  it('permite alternar status ativo/inativo de outro usuário', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Gerente Loja 1')).not.toBeNull()
    })

    const usersCol = pb.collection('users') as any

    // O switch do gerente (usr_gerente) está ativo (checked=true)
    const switchGerente = screen.getByRole('switch', { name: /status de gerente loja 1/i })
    expect(switchGerente).not.toBeNull()

    fireEvent.click(switchGerente)

    await waitFor(() => {
      expect(usersCol.update).toHaveBeenCalledWith('usr_gerente', { ativo: false })
    })
  })

  it('impede que o próprio usuário logado desative sua própria conta', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Admin Master')).not.toBeNull()
    })

    const switchAdmin = screen.getByRole('switch', { name: /status de admin master/i })
    expect(switchAdmin.hasAttribute('disabled')).toBe(true)
  })

  it('abre modal para cadastrar novo usuário', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Cadastrar Usuário')).not.toBeNull()
    })

    fireEvent.click(screen.getByText('Cadastrar Usuário'))

    expect(screen.getByRole('heading', { name: /cadastrar novo usuário/i })).not.toBeNull()
    expect(screen.getByPlaceholderText(/carlos eduardo silva/i)).not.toBeNull()
  })

  it('abre modal de redefinição de senha ao clicar no ícone de chave', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Gerente Loja 1')).not.toBeNull()
    })

    const keyButtons = screen.getAllByTitle('Redefinir senha')
    expect(keyButtons.length).toBeGreaterThan(0)

    // Clica no botão de redefinir senha do gerente
    fireEvent.click(keyButtons[1])

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /redefinir senha/i })).not.toBeNull()
    })

    const usersCol = pb.collection('users') as any
    const passwordInputs = screen.getAllByPlaceholderText(/mínimo 8 caracteres/i)
    const newPassInput = passwordInputs[passwordInputs.length - 1]
    const confirmInput = screen.getByPlaceholderText(/repita a nova senha/i)

    fireEvent.change(newPassInput, { target: { value: 'NovaSenha@999' } })
    fireEvent.change(confirmInput, { target: { value: 'NovaSenha@999' } })

    const submitBtn = screen.getByRole('button', { name: /salvar nova senha/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(usersCol.update).toHaveBeenCalledWith('usr_gerente', {
        password: 'NovaSenha@999',
        passwordConfirm: 'NovaSenha@999',
      })
    })
  })

  it('filtra usuários por role', async () => {
    render(
      <TooltipProvider>
        <Admin />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Gerente Loja 1')).not.toBeNull()
    })

    // Clica no filtro ADM
    const admFilterBtn = screen.getByRole('button', { name: /^adm$/i })
    fireEvent.click(admFilterBtn)

    expect(screen.getByText('Admin Master')).not.toBeNull()
    expect(screen.queryByText('Gerente Loja 1')).toBeNull()
    expect(screen.queryByText('Supervisor Regional')).toBeNull()
  })
})
