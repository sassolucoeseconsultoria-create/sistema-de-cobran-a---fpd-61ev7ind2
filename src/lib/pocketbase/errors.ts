import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/**
 * Maps PocketBase validation codes and field contexts to friendly Portuguese messages.
 */
function translatePocketBaseError(field: string, code?: string, originalMessage?: string): string {
  if (code === 'validation_length_out_of_range') {
    if (field === 'password') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return 'O comprimento do campo está fora do limite permitido.'
  }

  if (code === 'validation_values_mismatch') {
    if (field === 'passwordConfirm') {
      return 'As senhas digitadas não coincidem.'
    }
    return 'Os valores não coincidem.'
  }

  if (
    code === 'validation_invalid_email' ||
    (field === 'email' && code === 'validation_invalid_format')
  ) {
    return 'Formato de e-mail inválido.'
  }

  if (
    code === 'validation_is_not_unique' ||
    code === 'validation_not_unique' ||
    (originalMessage && /must be unique/i.test(originalMessage))
  ) {
    if (field === 'email') {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    return 'Já existe um registro com este valor.'
  }

  if (
    code === 'validation_required' ||
    (originalMessage && /required|cannot be blank/i.test(originalMessage))
  ) {
    return 'Este campo é obrigatório.'
  }

  // Fallback to original PocketBase message or generic fallback
  if (originalMessage && typeof originalMessage === 'string' && originalMessage.trim().length > 0) {
    return originalMessage
  }

  return 'Valor inválido.'
}

/**
 * Extracts and maps field-specific validation errors from PocketBase errors.
 * Handles ClientResponseError, nested error.data.data, error.data, and error.response.data structures.
 */
export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const err = error as Record<string, any>
  let rawData: unknown = null

  // Priority order:
  // 1. err.data.data (nested PB structure)
  // 2. err.response?.data?.data
  // 3. err.data
  // 4. err.response?.data
  if (
    err.data &&
    typeof err.data === 'object' &&
    'data' in err.data &&
    err.data.data &&
    typeof err.data.data === 'object'
  ) {
    rawData = err.data.data
  } else if (
    err.response?.data &&
    typeof err.response.data === 'object' &&
    'data' in err.response.data &&
    err.response.data.data &&
    typeof err.response.data.data === 'object'
  ) {
    rawData = err.response.data.data
  } else if (err.data && typeof err.data === 'object') {
    rawData = err.data
  } else if (err.response?.data && typeof err.response.data === 'object') {
    rawData = err.response.data
  }

  if (!rawData || typeof rawData !== 'object') return {}

  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(rawData as Record<string, any>)) {
    if (detail === null || detail === undefined) continue

    if (typeof detail === 'string') {
      errors[field] = detail
      continue
    }

    if (Array.isArray(detail)) {
      if (detail.length > 0 && typeof detail[0] === 'string') {
        errors[field] = detail[0]
      }
      continue
    }

    if (typeof detail === 'object') {
      // Check if nested further like { data: { role: { message: '...' } } }
      if ('data' in detail && detail.data && typeof detail.data === 'object') {
        for (const [subField, subDetail] of Object.entries(detail.data as Record<string, any>)) {
          if (subDetail && typeof subDetail === 'object' && 'message' in subDetail) {
            const subMsg = (subDetail as any).message
            const subCode = (subDetail as any).code
            errors[field] = translatePocketBaseError(subField, subCode, subMsg)
          }
        }
        if (errors[field]) continue
      }

      const code = typeof detail.code === 'string' ? detail.code : undefined
      const message = typeof detail.message === 'string' ? detail.message : undefined

      if (code || message) {
        errors[field] = translatePocketBaseError(field, code, message)
      }
    }
  }

  // If username error exists but email doesn't, map username error to email (PocketBase auth collection standard)
  if (errors.username && !errors.email) {
    errors.email = errors.username
  }

  return errors
}

/**
 * Gets a user-friendly error message, combining field errors or translating server error messages.
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  if (error instanceof ClientResponseError) {
    if (error.message) {
      if (error.message.includes('Failed to create record')) {
        return 'Falha ao criar o registro. Verifique os dados informados.'
      }
      if (error.message.includes('Failed to update record')) {
        return 'Falha ao atualizar o registro. Verifique os dados informados.'
      }
      if (error.message.includes('Failed to authenticate')) {
        return 'Falha na autenticação. Verifique seu e-mail e senha.'
      }
      return error.message
    }
    return 'Ocorreu um erro na requisição ao servidor.'
  }

  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    const rawMsg = (error as any).message
    if (rawMsg.includes('Failed to create record')) {
      return 'Falha ao criar o registro. Verifique os dados informados.'
    }
    return rawMsg
  }

  return 'Ocorreu um erro inesperado.'
}
