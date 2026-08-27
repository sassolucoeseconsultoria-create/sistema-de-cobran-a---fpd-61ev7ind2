export type FieldErrors = Record<string, string>

// Map standard PocketBase validation error codes or English messages to clear Portuguese messages
export function translateErrorMessage(field: string, code?: string, rawMessage?: string): string {
  const codeStr = String(code || '').toLowerCase()
  const msgStr = String(rawMessage || '').toLowerCase()

  if (
    codeStr === 'validation_not_unique' ||
    codeStr === 'validation_is_not_unique' ||
    msgStr.includes('unique') ||
    msgStr.includes('already in use')
  ) {
    if (field === 'email' || field === 'username') {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    return 'Já existe um registro com este valor.'
  }

  if (
    codeStr === 'validation_values_mismatch' ||
    msgStr.includes('values must match') ||
    msgStr.includes("values don't match") ||
    msgStr.includes('mismatch')
  ) {
    return 'As senhas digitadas não coincidem.'
  }

  if (
    codeStr === 'validation_length_out_of_range' ||
    codeStr === 'validation_min_text_constraint' ||
    msgStr.includes('length must be') ||
    msgStr.includes('at least 8')
  ) {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return rawMessage || 'Tamanho de campo inválido.'
  }

  if (
    codeStr === 'validation_invalid_email' ||
    msgStr.includes('invalid email') ||
    msgStr.includes('valid email')
  ) {
    return 'Formato de e-mail inválido.'
  }

  if (
    codeStr === 'validation_required' ||
    msgStr.includes('required') ||
    msgStr.includes('cannot be blank')
  ) {
    if (field === 'name') return 'O nome é obrigatório'
    if (field === 'email') return 'O e-mail é obrigatório'
    if (field === 'password') return 'A senha é obrigatória'
    return 'Este campo é obrigatório.'
  }

  return rawMessage || 'Campo inválido.'
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function isNativeResponse(val: unknown): boolean {
  if (typeof Response !== 'undefined' && val instanceof Response) return true
  // Duck typing for Response instances
  if (
    isPlainObject(val) &&
    'ok' in val &&
    'status' in val &&
    typeof (val as any).json === 'function'
  ) {
    return true
  }
  return false
}

// Recursive helper to extract field errors from any raw dictionary
function collectErrorsFromObject(obj: Record<string, any>, collected: FieldErrors, depth = 0) {
  if (depth > 4 || !obj || typeof obj !== 'object') return

  for (const [key, val] of Object.entries(obj)) {
    // Skip internal transport or metadata keys
    if (
      ['status', 'message', 'code', 'url', 'headers', 'stack', 'name'].includes(key) &&
      depth === 0
    ) {
      continue
    }

    if (val === null || val === undefined) continue

    // Case 1: Value is a string error message
    if (typeof val === 'string' && val.trim().length > 0) {
      if (key === 'password' && val.toLowerCase().includes('match')) {
        collected.passwordConfirm = 'As senhas digitadas não coincidem.'
        delete collected.password
      } else {
        collected[key] = translateErrorMessage(key, undefined, val)
      }
      continue
    }

    // Case 2: Value is an object with { code, message }
    if (isPlainObject(val) && ('message' in val || 'code' in val)) {
      const code = typeof val.code === 'string' ? val.code : undefined
      const message = typeof val.message === 'string' ? val.message : ''

      if (code === 'validation_values_mismatch' || message.toLowerCase().includes('match')) {
        // Special mapping: password / passwordConfirm mismatch always maps to passwordConfirm
        collected.passwordConfirm = 'As senhas digitadas não coincidem.'
        delete collected.password
      } else {
        collected[key] = translateErrorMessage(key, code, message)
      }

      // If val also has nested data (e.g. val.data), inspect it
      if (isPlainObject(val.data)) {
        collectErrorsFromObject(val.data, collected, depth + 1)
      }
      continue
    }

    // Case 3: Nested container object (e.g. nested: { data: { role: ... } } or val.data)
    if (isPlainObject(val) && !isNativeResponse(val)) {
      collectErrorsFromObject(val, collected, depth + 1)
    }
  }
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) {
    return {}
  }

  const anyErr = error as Record<string, any>
  const errors: FieldErrors = {}

  // List candidate error sources to inspect
  const candidateSources: { name: string; value: any }[] = []

  // 1. err.response?.data
  if (isPlainObject(anyErr.response?.data)) {
    candidateSources.push({ name: 'err.response.data', value: anyErr.response.data })
  }

  // 2. err.data
  if (isPlainObject(anyErr.data)) {
    candidateSources.push({ name: 'err.data', value: anyErr.data })
  }

  // 3. err.response (if not a native Response with .ok)
  if (isPlainObject(anyErr.response) && !isNativeResponse(anyErr.response)) {
    candidateSources.push({ name: 'err.response', value: anyErr.response })
  }

  // 4. err.originalError?.data or err.originalError
  if (isPlainObject(anyErr.originalError?.data)) {
    candidateSources.push({ name: 'err.originalError.data', value: anyErr.originalError.data })
  } else if (isPlainObject(anyErr.originalError)) {
    candidateSources.push({ name: 'err.originalError', value: anyErr.originalError })
  }

  // 5. err.cause?.data or err.cause
  if (isPlainObject(anyErr.cause?.data)) {
    candidateSources.push({ name: 'err.cause.data', value: anyErr.cause.data })
  } else if (isPlainObject(anyErr.cause)) {
    candidateSources.push({ name: 'err.cause', value: anyErr.cause })
  }

  // 6. Any other object properties on anyErr (excluding standard error fields and native Response)
  for (const [k, v] of Object.entries(anyErr)) {
    if (
      [
        'status',
        'message',
        'code',
        'url',
        'headers',
        'stack',
        'name',
        'response',
        'data',
        'originalError',
        'cause',
      ].includes(k)
    ) {
      continue
    }
    if (isPlainObject(v) && !isNativeResponse(v)) {
      candidateSources.push({ name: `err.${k}`, value: v })
    }
  }

  try {
    console.log(
      '[extractFieldErrors] sources encontradas:',
      candidateSources.map((s) => s.name),
    )
  } catch {
    // Ignore logging errors in environments without console
  }

  // Process all candidate sources
  for (const source of candidateSources) {
    collectErrorsFromObject(source.value, errors, 0)
  }

  // Map username error to email if email does not have an error
  if (errors.username) {
    if (!errors.email) {
      errors.email = errors.username
    }
    delete errors.username
  }

  try {
    console.log('[extractFieldErrors] resultado:', errors)
  } catch {
    // Ignore logging errors
  }

  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)

  if (msgs.length > 0) {
    // Remove duplicates while maintaining order
    const uniqueMsgs = Array.from(new Set(msgs))
    return uniqueMsgs.join(' ')
  }

  const anyErr = error as Record<string, any>
  const rawMsg = anyErr?.message || (error instanceof Error ? error.message : '')

  if (
    anyErr?.status === 400 &&
    (!rawMsg ||
      rawMsg.toLowerCase().includes('failed to') ||
      rawMsg.toLowerCase().includes('something went wrong'))
  ) {
    return 'Erro de validação. Verifique os campos e tente novamente.'
  }

  return rawMsg || 'Ocorreu um erro inesperado.'
}
