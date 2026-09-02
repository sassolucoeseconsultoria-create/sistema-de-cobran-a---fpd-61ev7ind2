import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// Helper to translate common PocketBase validation error codes and messages into Portuguese
export function translateErrorMessage(codeOrMsg: string, field?: string): string {
  const text = String(codeOrMsg || '').toLowerCase()
  if (
    text.includes('unique') ||
    text.includes('not_unique') ||
    text.includes('validation_not_unique') ||
    text.includes('validation_is_not_unique')
  ) {
    return field === 'email' || field === 'username'
      ? 'Este e-mail já está sendo utilizado por outro usuário.'
      : 'Já existe um registro com este valor.'
  }
  if (
    text.includes('mismatch') ||
    text.includes('match') ||
    text.includes('validation_values_mismatch')
  ) {
    return 'As senhas digitadas não coincidem.'
  }
  if (
    text.includes('length') ||
    text.includes('out_of_range') ||
    text.includes('min 8') ||
    text.includes('min_length') ||
    text.includes('validation_length_out_of_range')
  ) {
    return field === 'password' || field === 'passwordConfirm'
      ? 'A senha deve ter no mínimo 8 caracteres.'
      : 'Tamanho inválido para este campo.'
  }
  if (
    text.includes('required') ||
    text.includes('validation_required') ||
    text.includes('missing')
  ) {
    return 'Este campo é obrigatório.'
  }
  if (
    text.includes('invalid_email') ||
    text.includes('validation_is_email') ||
    text.includes('invalid email')
  ) {
    return 'Formato de e-mail inválido.'
  }
  return codeOrMsg
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const rawSources: any[] = []
  const err = error as Record<string, any>

  if (err.response && typeof err.response === 'object' && !(err.response instanceof Response)) {
    if (err.response.data && typeof err.response.data === 'object') {
      rawSources.push(err.response.data)
    }
    rawSources.push(err.response)
  }
  if (err.data && typeof err.data === 'object') {
    if (err.data.data && typeof err.data.data === 'object') {
      rawSources.push(err.data.data)
    }
    rawSources.push(err.data)
  }
  if (err.originalError?.data && typeof err.originalError.data === 'object') {
    rawSources.push(err.originalError.data)
  }
  if (err.cause?.data && typeof err.cause.data === 'object') {
    rawSources.push(err.cause.data)
  }
  if (err.customFieldBucket && typeof err.customFieldBucket === 'object') {
    rawSources.push(err.customFieldBucket)
  }

  const errors: FieldErrors = {}
  const processedKeys = new Set<string>()

  for (const source of rawSources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue

    for (const [key, item] of Object.entries(source)) {
      if (['code', 'message', 'data', 'status', 'url'].includes(key)) continue
      if (processedKeys.has(key)) continue

      let itemCode = ''
      let itemMsg = ''

      if (item && typeof item === 'object') {
        const itemObj = item as { code?: string; message?: string }
        itemCode = itemObj.code || ''
        itemMsg = itemObj.message || ''
      } else if (typeof item === 'string' && item.trim().length > 0) {
        itemMsg = item
      }

      if (!itemCode && !itemMsg) continue

      const isMismatch =
        itemCode === 'validation_values_mismatch' ||
        itemMsg.toLowerCase().includes('mismatch') ||
        itemMsg.toLowerCase().includes('match')

      if (isMismatch && (key === 'password' || key === 'passwordConfirm')) {
        errors.passwordConfirm = 'As senhas digitadas não coincidem.'
        processedKeys.add('password')
        processedKeys.add('passwordConfirm')
        continue
      }

      const mappedKey = key === 'username' ? 'email' : key
      if (!errors[mappedKey]) {
        errors[mappedKey] = translateErrorMessage(itemCode || itemMsg, mappedKey)
        processedKeys.add(key)
      }
    }
  }

  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'
  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)
  if (msgs.length > 0) {
    return Array.from(new Set(msgs)).join(' ')
  }
  if (error instanceof ClientResponseError) {
    if (
      error.status === 400 &&
      (!error.message || error.message.toLowerCase().includes('failed to'))
    ) {
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }
    return error.message || 'Erro de validação. Verifique os campos e tente novamente.'
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = String((error as { message: unknown }).message)
    if (msg.toLowerCase().includes('failed to')) {
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }
    return msg
  }
  return 'Ocorreu um erro inesperado.'
}
