import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/**
 * Traduz mensagens comuns de erro do PocketBase para o português amigável.
 */
export function translateErrorMessage(field: string, rawMessage: string): string {
  const msg = (rawMessage || '').toLowerCase()

  if (msg.includes('unique') || msg.includes('already exists') || msg.includes('already in use')) {
    if (field === 'email') return 'Este e-mail já está cadastrado no sistema.'
    if (field === 'username') return 'Este nome de usuário já está em uso.'
    return `Este ${field} já está em uso.`
  }

  if (
    msg.includes('length') ||
    msg.includes('must be at least') ||
    msg.includes('min') ||
    msg.includes('short')
  ) {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return `O campo ${field} não tem o tamanho mínimo exigido.`
  }

  if (msg.includes('match') || msg.includes('equal') || msg.includes("values don't match")) {
    if (field === 'passwordConfirm') return 'A confirmação de senha não coincide com a senha.'
    return 'Os valores informados não coincidem.'
  }

  if (msg.includes('blank') || msg.includes('required') || msg.includes('cannot be empty')) {
    if (field === 'email') return 'O e-mail é obrigatório.'
    if (field === 'name') return 'O nome é obrigatório.'
    if (field === 'password') return 'A senha é obrigatória.'
    if (field === 'role') return 'O perfil de acesso é obrigatório.'
    return `O campo ${field} é obrigatório.`
  }

  if (msg.includes('valid email') || msg.includes('invalid email')) {
    return 'Por favor, insira um endereço de e-mail válido.'
  }

  if (msg.includes('failed to create') || msg.includes('failed to update')) {
    return 'Não foi possível salvar o registro. Verifique os dados informados.'
  }

  return rawMessage || 'Dados inválidos.'
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error) return {}

  // Se for ClientResponseError do PocketBase
  if (
    error instanceof ClientResponseError ||
    (typeof error === 'object' && error !== null && 'response' in error)
  ) {
    const errObj = error as ClientResponseError
    const data = errObj.response?.data
    if (data && typeof data === 'object') {
      const errors: FieldErrors = {}
      for (const [field, detail] of Object.entries(data)) {
        if (
          detail &&
          typeof detail === 'object' &&
          'message' in detail &&
          typeof (detail as { message: unknown }).message === 'string'
        ) {
          const raw = (detail as { message: string }).message
          errors[field] = translateErrorMessage(field, raw)
        } else if (typeof detail === 'string') {
          errors[field] = translateErrorMessage(field, detail)
        }
      }
      if (Object.keys(errors).length > 0) {
        return errors
      }
    }
  }

  return {}
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  if (
    error instanceof ClientResponseError ||
    (typeof error === 'object' && error !== null && 'response' in error)
  ) {
    const errObj = error as ClientResponseError
    const fieldErrors = extractFieldErrors(errObj)
    const msgs = Object.values(fieldErrors)

    if (msgs.length > 0) {
      return msgs.join(' ')
    }

    // Tradução de mensagens comuns de nível superior do PocketBase
    const baseMsg = errObj.message || ''
    if (baseMsg.toLowerCase().includes('failed to create record')) {
      return 'Não foi possível criar o usuário. Verifique se a senha tem pelo menos 8 caracteres ou se o e-mail já existe.'
    }
    if (baseMsg.toLowerCase().includes('failed to update record')) {
      return 'Não foi possível atualizar o usuário. Verifique os dados informados.'
    }
    if (baseMsg.toLowerCase().includes('failed to authenticate')) {
      return 'Credenciais inválidas. Verifique o e-mail e a senha.'
    }
    if (errObj.status === 403 || baseMsg.toLowerCase().includes('not allowed')) {
      return 'Você não tem permissão para realizar esta ação.'
    }

    return baseMsg || 'Ocorreu um erro ao processar a requisição.'
  }

  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}
