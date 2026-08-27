import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// Map friendly message translations for known PB validation codes / strings
const translateMessage = (field: string, code?: string, rawMsg?: string): string => {
  if (
    code === 'validation_not_unique' ||
    code === 'validation_is_not_unique' ||
    (rawMsg && /unique/i.test(rawMsg))
  ) {
    if (field === 'email' || field === 'username') {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    return 'Já existe um registro com este valor.'
  }
  if (code === 'validation_length_out_of_range') {
    if (field === 'password') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return 'Tamanho do campo fora do intervalo permitido.'
  }
  if (code === 'validation_values_mismatch') {
    if (field === 'passwordConfirm') {
      return 'As senhas digitadas não coincidem.'
    }
    return 'Os valores não coincidem.'
  }
  if (code === 'validation_invalid_email') {
    return 'Formato de e-mail inválido.'
  }
  if (code === 'validation_required') {
    return 'Este campo é obrigatório.'
  }
  if (rawMsg) {
    if (/email must be unique/i.test(rawMsg) || /username must be unique/i.test(rawMsg)) {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    if (/values (must|don't) match/i.test(rawMsg)) {
      return 'As senhas digitadas não coincidem.'
    }
    if (/length must be between/i.test(rawMsg) && field === 'password') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return rawMsg
  }
  return 'Campo inválido.'
}

const isPlainObject = (val: unknown): val is Record<string, any> => {
  return (
    typeof val === 'object' && val !== null && !(val instanceof Response) && !Array.isArray(val)
  )
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const err = error as Record<string, any>

  // Look for validation errors container in various possible locations in PocketBase errors:
  // 1. err.data.data (nested data container)
  // 2. err.data (standard ClientResponseError.data)
  // 3. err.response?.data (standard ClientResponseError response.data)
  // 4. err.response (raw response object when data is empty or response itself contains the fields)
  // 5. err.originalError?.data
  // 6. err.cause?.data
  let rawData: Record<string, any> | null = null

  if (isPlainObject(err.data?.data) && Object.keys(err.data.data).length > 0) {
    rawData = err.data.data
  } else if (isPlainObject(err.data) && Object.keys(err.data).length > 0) {
    rawData = err.data
  } else if (isPlainObject(err.response?.data) && Object.keys(err.response.data).length > 0) {
    rawData = err.response.data
  } else if (
    isPlainObject(err.originalError?.data) &&
    Object.keys(err.originalError.data).length > 0
  ) {
    rawData = err.originalError.data
  } else if (isPlainObject(err.cause?.data) && Object.keys(err.cause.data).length > 0) {
    rawData = err.cause.data
  } else if (isPlainObject(err.response) && Object.keys(err.response).length > 0) {
    // Check if response contains validation keys directly
    rawData = err.response
  }

  if (!rawData || typeof rawData !== 'object') return {}

  const errors: FieldErrors = {}

  // Known metadata keys in response that are not field validation items
  const ignoreKeys = new Set(['code', 'message', 'status', 'data'])

  const parseItem = (field: string, detail: unknown) => {
    if (!detail || ignoreKeys.has(field)) return

    if (typeof detail === 'string') {
      errors[field] = translateMessage(field, undefined, detail)
    } else if (Array.isArray(detail)) {
      const first = detail[0]
      if (typeof first === 'string') {
        errors[field] = translateMessage(field, undefined, first)
      } else if (isPlainObject(first)) {
        errors[field] = translateMessage(field, first.code, first.message)
      }
    } else if (isPlainObject(detail)) {
      // Check if nested detail has a 'data' property (nested validation structure)
      if (isPlainObject(detail.data)) {
        for (const [subField, subDetail] of Object.entries(detail.data)) {
          parseItem(subField, subDetail)
        }
      } else if (typeof detail.message === 'string' || typeof detail.code === 'string') {
        errors[field] = translateMessage(field, detail.code, detail.message)
      }
    }
  }

  for (const [field, detail] of Object.entries(rawData)) {
    parseItem(field, detail)
  }

  // If username error exists but email error does not, map username error to email
  if (errors.username && !errors.email) {
    errors.email = errors.username
  }

  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  if (error instanceof ClientResponseError) {
    return error.message || 'Ocorreu um erro inesperado.'
  }

  if (error instanceof Error) {
    return error.message || 'Ocorreu um erro inesperado.'
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    return (error as any).message
  }

  return 'Ocorreu um erro inesperado.'
}
