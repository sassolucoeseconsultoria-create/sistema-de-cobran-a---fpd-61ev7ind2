export type FieldErrors = Record<string, string>

// Map PocketBase validation codes and messages to user-friendly pt-BR text
export function translateValidationMessage(
  code: string | undefined,
  message: string | undefined,
  field?: string,
): string {
  const codeStr = (code || '').toLowerCase()
  const msgStr = (message || '').toLowerCase()
  const combined = `${codeStr} ${msgStr}`

  if (
    combined.includes('mismatch') ||
    combined.includes('validation_values_mismatch') ||
    codeStr === 'validation_values_mismatch'
  ) {
    return 'As senhas digitadas não coincidem.'
  }

  if (
    combined.includes('unique') ||
    combined.includes('not_unique') ||
    codeStr === 'validation_not_unique' ||
    codeStr === 'validation_is_not_unique'
  ) {
    if (field === 'email' || field === 'username') {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    return 'Já existe um registro com este valor.'
  }

  if (
    combined.includes('length') ||
    combined.includes('out_of_range') ||
    combined.includes('min_length') ||
    codeStr === 'validation_length_out_of_range'
  ) {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return 'Tamanho inválido para este campo.'
  }

  if (
    combined.includes('invalid_email') ||
    combined.includes('validation_is_email') ||
    codeStr === 'validation_invalid_email' ||
    codeStr === 'validation_is_email'
  ) {
    return 'Formato de e-mail inválido.'
  }

  if (
    combined.includes('required') ||
    combined.includes('validation_required') ||
    codeStr === 'validation_required'
  ) {
    return 'Este campo é obrigatório.'
  }

  return message || code || 'Campo inválido.'
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const err = error as any
  const errors: FieldErrors = {}

  // Candidates for raw validation data dictionary
  const rawSources: any[] = []

  // Check err.response (can be plain object in PB 0.26.x or nested .data)
  if (err.response && typeof err.response === 'object' && !(err.response instanceof Response)) {
    if (err.response.data && typeof err.response.data === 'object') {
      rawSources.push(err.response.data)
    }
    rawSources.push(err.response)
  }

  // Check err.data (can have nested .data or direct field dict)
  if (err.data && typeof err.data === 'object') {
    if (err.data.data && typeof err.data.data === 'object') {
      rawSources.push(err.data.data)
    }
    rawSources.push(err.data)
  }

  // Check originalError / cause / custom fallback buckets
  if (err.originalError?.data && typeof err.originalError.data === 'object') {
    rawSources.push(err.originalError.data)
  }
  if (err.cause?.data && typeof err.cause.data === 'object') {
    rawSources.push(err.cause.data)
  }
  if (err.customFieldBucket && typeof err.customFieldBucket === 'object') {
    rawSources.push(err.customFieldBucket)
  }

  const processedKeys = new Set<string>()

  for (const source of rawSources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue

    for (const [rawField, detail] of Object.entries(source)) {
      // Skip metadata keys
      if (['code', 'message', 'data', 'status', 'url'].includes(rawField)) continue
      if (processedKeys.has(rawField)) continue

      let fieldName = rawField
      let code: string | undefined
      let message: string | undefined

      if (typeof detail === 'string') {
        message = detail
      } else if (detail && typeof detail === 'object') {
        const itemObj = detail as { code?: string; message?: string; [key: string]: any }
        code = typeof itemObj.code === 'string' ? itemObj.code : undefined
        message = typeof itemObj.message === 'string' ? itemObj.message : undefined
      }

      if (!code && !message) continue

      // Map validation_values_mismatch specifically to passwordConfirm
      const isMismatch =
        code === 'validation_values_mismatch' ||
        (message && message.toLowerCase().includes('mismatch')) ||
        (message && message.toLowerCase().includes('match'))

      if (isMismatch && (fieldName === 'password' || fieldName === 'passwordConfirm')) {
        errors.passwordConfirm = 'As senhas digitadas não coincidem.'
        processedKeys.add('password')
        processedKeys.add('passwordConfirm')
        continue
      }

      // Map username errors to email if not already present
      if (fieldName === 'username') {
        fieldName = 'email'
      }

      if (!errors[fieldName]) {
        errors[fieldName] = translateValidationMessage(code, message, fieldName)
        processedKeys.add(rawField)
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
    // Unique messages joined
    const uniqueMsgs = Array.from(new Set(msgs))
    return uniqueMsgs.join(' ')
  }

  const err = error as any
  if (typeof err.message === 'string' && err.message.trim().length > 0) {
    if (
      err.message.includes('Failed to create record') ||
      err.message.includes('Failed to update record')
    ) {
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }
    return err.message
  }

  return 'Ocorreu um erro inesperado.'
}
