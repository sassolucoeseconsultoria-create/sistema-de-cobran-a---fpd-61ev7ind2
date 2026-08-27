import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// Translations for PocketBase validation codes
const CODE_TRANSLATIONS: Record<string, string> = {
  validation_not_unique: 'Este e-mail já está sendo utilizado por outro usuário.',
  validation_is_not_unique: 'Já existe um registro com este valor.',
  validation_invalid_email: 'Formato de e-mail inválido.',
  validation_length_out_of_range: 'A senha deve ter no mínimo 8 caracteres.',
  validation_values_mismatch: 'As senhas digitadas não coincidem.',
  validation_required: 'Este campo é obrigatório.',
  validation_min_length: 'A senha deve ter no mínimo 8 caracteres.',
  validation_missing_required_field: 'Este campo é obrigatório.',
}

function translateValidation(
  detail: unknown,
  fallbackMessage?: string,
): { message: string; code?: string } | null {
  if (!detail) return null

  if (typeof detail === 'string') {
    return { message: detail }
  }

  if (typeof detail === 'object') {
    const code =
      'code' in detail && typeof (detail as any).code === 'string'
        ? (detail as any).code
        : undefined
    const msg =
      'message' in detail && typeof (detail as any).message === 'string'
        ? (detail as any).message
        : fallbackMessage

    if (code && CODE_TRANSLATIONS[code]) {
      return { message: CODE_TRANSLATIONS[code], code }
    }

    if (msg) {
      return { message: msg, code }
    }
  }

  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  if (typeof Response !== 'undefined' && value instanceof Response) return false
  if (value instanceof Error) return false
  if (Array.isArray(value)) return false
  return true
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const err = error as any
  const errors: FieldErrors = {}

  // List of candidate objects to check for field errors
  const candidates: unknown[] = []

  // 1. err.data and err.response?.data
  if (err.data && isPlainObject(err.data)) {
    candidates.push(err.data)
    if (isPlainObject(err.data.data)) {
      candidates.push(err.data.data)
    }
  }

  if (err.response) {
    if (isPlainObject(err.response.data)) {
      candidates.push(err.response.data)
    }
    // err.response directly as a plain object (PocketBase 0.26.x JSON body)
    if (isPlainObject(err.response)) {
      candidates.push(err.response)
    }
  }

  // 2. Fallbacks: originalError.data, cause.data, customFieldBucket, etc.
  if (err.originalError && isPlainObject(err.originalError.data)) {
    candidates.push(err.originalError.data)
  }
  if (err.cause && isPlainObject(err.cause.data)) {
    candidates.push(err.cause.data)
  }

  // Also inspect any object properties on err that could contain field errors (fallback when response is native Response)
  for (const [propKey, propVal] of Object.entries(err)) {
    if (
      propKey !== 'data' &&
      propKey !== 'response' &&
      propKey !== 'originalError' &&
      propKey !== 'cause' &&
      propKey !== 'stack' &&
      isPlainObject(propVal)
    ) {
      candidates.push(propVal)
    }
  }

  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) continue

    for (const [field, detail] of Object.entries(candidate)) {
      // Ignore meta fields in candidate if candidate is err.response or error wrapper
      if (['status', 'message', 'code', 'data'].includes(field) && typeof detail !== 'object') {
        continue
      }

      // If detail is an object with code/message or string
      if (
        (detail && typeof detail === 'object' && ('code' in detail || 'message' in detail)) ||
        typeof detail === 'string'
      ) {
        const trans = translateValidation(detail)
        if (trans) {
          // Special rule: validation_values_mismatch on password or passwordConfirm -> map exclusively to passwordConfirm
          if (trans.code === 'validation_values_mismatch' || field === 'passwordConfirm') {
            errors.passwordConfirm = CODE_TRANSLATIONS.validation_values_mismatch || trans.message
          } else if (field === 'password' && !errors.password) {
            errors.password = trans.message
          } else if (field === 'username') {
            // Map username to email if email does not already exist
            if (!errors.email) {
              errors.email = trans.message
            }
          } else if (!errors[field]) {
            errors[field] = trans.message
          }
        }
      } else if (isPlainObject(detail)) {
        // Nested object check (e.g. nested: { data: { role: { message: ... } } })
        if (isPlainObject((detail as any).data)) {
          for (const [nestedField, nestedDetail] of Object.entries((detail as any).data)) {
            const trans = translateValidation(nestedDetail)
            if (trans && !errors[nestedField]) {
              errors[nestedField] = trans.message
            }
          }
        }
      }
    }
  }

  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)

  // Deduplicate messages
  const uniqueMsgs = Array.from(new Set(msgs)).filter(Boolean)
  if (uniqueMsgs.length > 0) {
    return uniqueMsgs.join(' ')
  }

  const anyErr = error as any
  const status = anyErr?.status

  if (
    status === 400 &&
    (anyErr?.message === 'Failed to create record.' ||
      anyErr?.message === 'Failed to update record.' ||
      !anyErr?.message)
  ) {
    return 'Erro de validação. Verifique os campos e tente novamente.'
  }

  if (
    typeof anyErr?.message === 'string' &&
    anyErr.message.trim() &&
    anyErr.message !== 'Failed to create record.' &&
    anyErr.message !== 'Failed to update record.'
  ) {
    return anyErr.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Ocorreu um erro inesperado.'
}
