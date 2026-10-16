import pb, { isSessionExpiredError } from '@/lib/pocketbase/client'
import type { User, UserRole } from '@/contexts/AuthContext'

export interface CreateUserData {
  name: string
  email: string
  fone?: string
  password: string
  passwordConfirm: string
  role: UserRole
  lojas?: string[]
  ativo?: boolean
}

export interface UpdateUserData {
  name?: string
  email?: string
  fone?: string
  password?: string
  passwordConfirm?: string
  role?: UserRole
  lojas?: string[]
  ativo?: boolean
}

/**
 * Busca a lista completa de usuários cadastrados
 */
export async function listUsers(): Promise<User[]> {
  return pb.collection('users').getFullList<User>({
    sort: '-created',
    requestKey: null,
  })
}

/**
 * Cria um novo usuário
 */
export async function createUser(data: CreateUserData): Promise<User> {
  const payload: Record<string, any> = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    emailVisibility: true,
    fone: (data.fone || '').trim(),
    role: data.role,
    lojas: data.role === 'ADM' ? [] : data.lojas || [],
    password: data.password.trim(),
    passwordConfirm: data.passwordConfirm.trim(),
    ativo: data.ativo !== false,
  }

  return pb.collection('users').create<User>(payload)
}

/**
 * Atualiza um usuário existente
 */
export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const payload: Record<string, any> = {}

  if (data.name !== undefined) payload.name = data.name.trim()
  if (data.email !== undefined) payload.email = data.email.trim().toLowerCase()
  if (data.fone !== undefined) payload.fone = data.fone.trim()
  if (data.role !== undefined) payload.role = data.role
  if (data.ativo !== undefined) payload.ativo = data.ativo
  if (data.lojas !== undefined) {
    payload.lojas = data.role === 'ADM' ? [] : data.lojas
  }

  if (data.password && data.password.trim().length > 0) {
    payload.password = data.password.trim()
    payload.passwordConfirm = (data.passwordConfirm || data.password).trim()
  }

  payload.emailVisibility = true

  return pb.collection('users').update<User>(id, payload)
}

/**
 * Alterna status de ativação do usuário (ativo / desativado)
 */
export async function toggleUserStatus(id: string, currentAtivo: boolean): Promise<User> {
  return pb.collection('users').update<User>(id, {
    ativo: !currentAtivo,
  })
}

/**
 * Redefine a senha de um usuário diretamente (requer privilégio de ADM)
 */
export async function resetUserPassword(id: string, newPassword: string): Promise<User> {
  const clean = newPassword.trim()
  return pb.collection('users').update<User>(id, {
    password: clean,
    passwordConfirm: clean,
  })
}

/**
 * Exclui um usuário do sistema
 */
export async function deleteUser(id: string): Promise<boolean> {
  return pb.collection('users').delete(id)
}
