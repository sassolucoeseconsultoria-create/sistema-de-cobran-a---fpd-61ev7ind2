import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// Map PocketBase validation codes / common messages to clear Portuguese translations
const CODE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Este campo é obrigatório.',
  validation_not_unique: 'Este valor já está sendo utilizado.',
  validation_is_not_unique: 'Já existe um registro com este valor.',
  validation_invalid_email: 'Formato de e-mail inválido.',
  validation_invalid_url: 'URL inválida.',
  validation_values_mismatch: 'As senhas digitadas não coincidem.',
  validation_length_out_of_range: 'O tamanho do campo está fora do limite permitido.',
  validation_min_length: 'O tamanho mínimo não foi atingido.',
  validation_max_length: 'O tamanho máximo foi excedido.',
}

function translateFieldMessage(field: string, code?: string, rawMsg?: string): string {
  // 1. Specific field + code rules
  if (code === 'validation_values_mismatch' || (rawMsg && /values (must )?match/i.test(rawMsg))) {
    return 'As senhas digitadas não coincidem.'
  }

  if (
    field === 'email' &&
    (code === 'validation_not_unique' || code === 'validation_is_not_unique')
  ) {
    return 'Este e-mail já está sendo utilizado por outro usuário.'
  }

  if (
    field === 'username' &&
    (code === 'validation_not_unique' || code === 'validation_is_not_unique')
  ) {
    return 'Este e-mail já está sendo utilizado por outro usuário.'
  }

  if (field === 'password' && code === 'validation_length_out_of_range') {
    return 'A senha deve ter no mínimo 8 caracteres.'
  }

  if (field === 'passwordConfirm' && code === 'validation_length_out_of_range') {
    return 'A confirmação de senha deve ter no mínimo 8 caracteres.'
  }

  if (field === 'email' && code === 'validation_invalid_email') {
    return 'Formato de e-mail inválido.'
  }

  // 2. Generic code translations
  if (code && CODE_TRANSLATIONS[code]) {
    return CODE_TRANSLATIONS[code]
  }

  // 3. Raw message translation if recognizable
  if (rawMsg) {
    const lower = rawMsg.toLowerCase()
    if (lower.includes('must be unique') || lower.includes('already exists')) {
      return field === 'email' || field === 'username'
        ? 'Este e-mail já está sendo utilizado por outro usuário.'
        : 'Este valor já está em uso.'
    }
    if (
      lower.includes('must match') ||
      lower.includes("don't match") ||
      lower.includes('não coincidem')
    ) {
      return 'As senhas digitadas não coincidem.'
    }
    if (lower.includes('invalid email') || lower.includes('e-mail inválido')) {
      return 'Formato de e-mail inválido.'
    }
    if (
      lower.includes('length must be between') ||
      lower.includes('least 8 chars') ||
      lower.includes('too short')
    ) {
      return field === 'password' || field === 'passwordConfirm'
        ? 'A senha deve ter no mínimo 8 caracteres.'
        : 'Tamanho inválido.'
    }
    // Return original message if clean and non-generic
    if (
      !lower.includes('failed to create') &&
      !lower.includes('failed to update') &&
      !lower.includes('something went wrong') &&
      !lower.includes('cannot be blank')
    ) {
      return rawMsg
    }
    if (lower.includes('cannot be blank') || lower.includes('is required')) {
      return 'Este campo é obrigatório.'
    }
  }

  return 'Campo inválido.'
}

/**
 * Extracts per-field error messages from a PocketBase error or error object.
 * Maps validation_values_mismatch to passwordConfirm EXCLUSIVELY.
 */
export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const errors: FieldErrors = {}
  const rawData: Record<string, any> = {}

  // Identify where validation data lives
  const candidate = error as any
  const sources = [
    candidate.response?.data,
    candidate.data?.data,
    candidate.data,
    candidate.response,
    candidate.originalError?.data,
    candidate.cause?.data,
    candidate.customFieldBucket,
  ]

  for (const src of sources) {
    if (
      src &&
      typeof src === 'object' &&
      !(typeof Response !== 'undefined' && src instanceof Response)
    ) {
      for (const [key, val] of Object.entries(src)) {
        // Avoid copying internal error properties like status, message, etc.
        if (['status', 'message', 'code', 'data', 'response', 'name', 'stack'].includes(key)) {
          continue
        }
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          rawData[key] = val
        } else if (typeof val === 'string' && val.trim().length > 0) {
          rawData[key] = { message: val }
        }
      }
    }
  }

  // Also check top-level if error itself has field-like entries
  for (const [key, val] of Object.entries(candidate)) {
    if (
      [
        'name',
        'message',
        'status',
        'response',
        'data',
        'originalError',
        'cause',
        'stack',
        'isAbort',
        'url',
      ].includes(key)
    ) {
      continue
    }
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      ('message' in val || 'code' in val)
    ) {
      rawData[key] = val
    } else if (typeof val === 'string' && val.trim().length > 0) {
      rawData[key] = { message: val }
    }
  }

  // Process and translate fields
  for (const [field, detail] of Object.entries(rawData)) {
    if (!detail || typeof detail !== 'object') continue

    // If detail is nested data wrapper: { data: { role: { message: ... } } }
    if (detail.data && typeof detail.data === 'object') {
      const nested = extractFieldErrors(detail)
      for (const [nKey, nVal] of Object.entries(nested)) {
        errors[nKey] = nVal
      }
      continue
    }

    const code = typeof detail.code === 'string' ? detail.code : undefined
    const rawMsg = typeof detail.message === 'string' ? detail.message : undefined

    const translated = translateFieldMessage(field, code, rawMsg)

    // Rule: validation_values_mismatch or password mismatch belongs EXCLUSIVELY to passwordConfirm
    if (
      code === 'validation_values_mismatch' ||
      rawMsg?.toLowerCase().includes('must match') ||
      rawMsg?.toLowerCase().includes("don't match")
    ) {
      errors.passwordConfirm = 'As senhas digitadas não coincidem.'
      // If PocketBase put it on password, do NOT keep it on password
      continue
    }

    // Map username errors to email if email not already set
    if (field === 'username') {
      if (!errors.email) {
        errors.email = translated
      }
      continue
    }

    errors[field] = translated
  }

  return errors
}

/**
 * Returns a human-friendly error message summary for toasts / alerts.
 * If field errors exist, returns a concise summary or the unique error messages.
 * Never concatenates repetitive generic messages like "Campo inválido. Failed to create record. Campo inválido."
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  // If passed an already extracted FieldErrors record
  if (
    typeof error === 'object' &&
    !(error instanceof Error) &&
    !('response' in error) &&
    !('status' in error)
  ) {
    const values = Object.values(error as Record<string, string>).filter(
      (v) => typeof v === 'string' && v.trim().length > 0 && v !== 'Campo inválido.',
    )
    const uniqueValues = Array.from(new Set(values))
    if (uniqueValues.length === 1) return uniqueValues[0]
    if (uniqueValues.length > 1) return uniqueValues.join(' ')
    return 'Erro de validação. Verifique os campos destacados.'
  }

  const fieldErrors = extractFieldErrors(error)
  const values = Object.values(fieldErrors).filter(
    (v) => typeof v === 'string' && v.trim().length > 0 && v !== 'Campo inválido.',
  )
  const uniqueValues = Array.from(new Set(values))

  // If we have specific field error messages, return them cleanly
  if (uniqueValues.length === 1) {
    return uniqueValues[0]
  }
  if (uniqueValues.length > 1) {
    return uniqueValues.join(' ')
  }

  // If there were field errors but they only mapped to generic placeholders
  if (Object.keys(fieldErrors).length > 0) {
    return 'Erro de validação. Verifique os campos destacados abaixo.'
  }

  // PocketBase ClientResponseError or custom object
  if (
    error instanceof ClientResponseError ||
    (typeof error === 'object' && 'status' in (error as any))
  ) {
    const pbErr = error as any
    const status = pbErr.status
    const rawMsg = typeof pbErr.message === 'string' ? pbErr.message : ''

    if (status === 400) {
      if (
        rawMsg &&
        !rawMsg.toLowerCase().includes('failed to create') &&
        !rawMsg.toLowerCase().includes('failed to update')
      ) {
        return rawMsg
      }
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }

    if (status === 401 || status === 403) {
      return 'Você não tem permissão para realizar esta ação.'
    }

    if (status === 404) {
      return 'Registro não encontrado.'
    }

    if (status === 0 || !status) {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.'
    }

    if (
      rawMsg &&
      !rawMsg.toLowerCase().includes('failed to') &&
      !rawMsg.toLowerCase().includes('something went wrong')
    ) {
      return rawMsg
    }

    return 'Erro ao processar requisição no servidor.'
  }

  if (error instanceof Error) {
    const msg = error.message
    if (
      msg &&
      !msg.toLowerCase().includes('failed to create') &&
      !msg.toLowerCase().includes('failed to update') &&
      !msg.toLowerCase().includes('[object object]')
    ) {
      return msg
    }
  }

  return 'Ocorreu um erro inesperado. Tente novamente.'
}
