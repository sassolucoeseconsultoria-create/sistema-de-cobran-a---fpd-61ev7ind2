import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  listUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
} from './userService'

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
    },
    isSessionExpiredError: vi.fn(() => false),
  }
})

describe('userService', () => {
  const mockCol = pb.collection('users') as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listUsers calls getFullList with correct sorting', async () => {
    const mockUsers = [
      { id: '1', email: 'user1@test.com', name: 'User 1', role: 'ADM', ativo: true },
    ]
    mockCol.getFullList.mockResolvedValueOnce(mockUsers)

    const res = await listUsers()
    expect(mockCol.getFullList).toHaveBeenCalledWith({
      sort: '-created',
      requestKey: null,
    })
    expect(res).toEqual(mockUsers)
  })

  it('createUser trims and sends correct payload', async () => {
    mockCol.create.mockImplementationOnce((payload: any) =>
      Promise.resolve({ id: 'u123', ...payload }),
    )

    const result = await createUser({
      name: '  Novo Usuário  ',
      email: '  NOVO@TEST.COM ',
      fone: ' (61) 99999-9999 ',
      password: 'senhaForte123',
      passwordConfirm: 'senhaForte123',
      role: 'Supervisor',
      lojas: ['loja1', 'loja2'],
      ativo: true,
    })

    expect(mockCol.create).toHaveBeenCalledWith({
      name: 'Novo Usuário',
      email: 'novo@test.com',
      emailVisibility: true,
      fone: '(61) 99999-9999',
      role: 'Supervisor',
      lojas: ['loja1', 'loja2'],
      password: 'senhaForte123',
      passwordConfirm: 'senhaForte123',
      ativo: true,
    })
    expect(result.id).toBe('u123')
  })

  it('createUser sets lojas to empty array if role is ADM', async () => {
    mockCol.create.mockImplementationOnce((payload: any) =>
      Promise.resolve({ id: 'uAdmin', ...payload }),
    )

    await createUser({
      name: 'Admin Test',
      email: 'adm@test.com',
      password: 'senhaForte123',
      passwordConfirm: 'senhaForte123',
      role: 'ADM',
      lojas: ['loja1'],
    })

    expect(mockCol.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ADM',
        lojas: [],
      }),
    )
  })

  it('updateUser updates fields correctly', async () => {
    mockCol.update.mockResolvedValueOnce({ id: 'u1', name: 'Updated Name' })

    const res = await updateUser('u1', {
      name: ' Updated Name ',
      role: 'Coordenador',
      lojas: ['lojaA'],
    })

    expect(mockCol.update).toHaveBeenCalledWith('u1', {
      name: 'Updated Name',
      role: 'Coordenador',
      lojas: ['lojaA'],
      emailVisibility: true,
    })
    expect(res.name).toBe('Updated Name')
  })

  it('toggleUserStatus inverts the ativo flag', async () => {
    mockCol.update.mockResolvedValueOnce({ id: 'u1', ativo: false })
    const res = await toggleUserStatus('u1', true)
    expect(mockCol.update).toHaveBeenCalledWith('u1', { ativo: false })
    expect(res.ativo).toBe(false)

    mockCol.update.mockResolvedValueOnce({ id: 'u1', ativo: true })
    const res2 = await toggleUserStatus('u1', false)
    expect(mockCol.update).toHaveBeenCalledWith('u1', { ativo: true })
    expect(res2.ativo).toBe(true)
  })

  it('resetUserPassword updates password and passwordConfirm', async () => {
    mockCol.update.mockResolvedValueOnce({ id: 'u1' })
    await resetUserPassword('u1', 'novaSenha123')
    expect(mockCol.update).toHaveBeenCalledWith('u1', {
      password: 'novaSenha123',
      passwordConfirm: 'novaSenha123',
    })
  })

  it('deleteUser calls delete on collection', async () => {
    mockCol.delete.mockResolvedValueOnce(true)
    const result = await deleteUser('u1')
    expect(mockCol.delete).toHaveBeenCalledWith('u1')
    expect(result).toBe(true)
  })
})
