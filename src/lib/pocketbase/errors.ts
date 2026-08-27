export type FieldErrors = Record<string, string>

// Map PocketBase error codes or messages to user-friendly Portuguese messages
function translateValidationMessage(field: string, code?: string, rawMessage?: string): string {
  if (code === 'validation_values_mismatch') {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'As senhas digitadas não coincidem.'
    }
    return 'Os valores não coincidem.'
  }

  if (code === 'validation_not_unique' || code === 'validation_is_not_unique') {
    if (field === 'email' || field === 'username') {
      return 'Este e-mail já está sendo utilizado por outro usuário.'
    }
    return 'Já existe um registro com este valor.'
  }

  if (code === 'validation_length_out_of_range') {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return 'O tamanho do campo está fora do limite permitido.'
  }

  if (code === 'validation_invalid_email') {
    return 'Formato de e-mail inválido.'
  }

  if (code === 'validation_required') {
    if (field === 'name') return 'O nome completo é obrigatório.'
    if (field === 'email') return 'O e-mail é obrigatório.'
    if (field === 'password') return 'A senha é obrigatória.'
    return 'Este campo é obrigatório.'
  }

  // Fallbacks based on raw message inspection if code is missing/generic
  if (rawMessage) {
    const lower = rawMessage.toLowerCase()
    if (lower.includes('unique')) {
      if (field === 'email' || field === 'username') {
        return 'Este e-mail já está sendo utilizado por outro usuário.'
      }
      return 'Já existe um registro com este valor.'
    }
    if (lower.includes('match') || lower.includes('mismatch')) {
      return 'As senhas digitadas não coincidem.'
    }
    if (
      lower.includes('length') ||
      lower.includes('characters') ||
      lower.includes('between 8 and 72')
    ) {
      if (field === 'password' || field === 'passwordConfirm') {
        return 'A senha deve ter no mínimo 8 caracteres.'
      }
    }
    if (lower.includes('email')) {
      return 'Formato de e-mail inválido.'
    }
    return rawMessage
  }

  return 'Campo inválido.'
}

function processFieldDetail(field: string, detail: unknown, errors: FieldErrors) {
  if (!detail) return

  let targetField = field
  let code: string | undefined
  let message: string | undefined

  if (typeof detail === 'string') {
    message = detail
  } else if (Array.isArray(detail)) {
    message = detail
      .map((d) => (typeof d === 'string' ? d : (d as any)?.message || JSON.stringify(d)))
      .join(', ')
  } else if (typeof detail === 'object') {
    const obj = detail as Record<string, any>
    code = typeof obj.code === 'string' ? obj.code : undefined
    message = typeof obj.message === 'string' ? obj.message : undefined

    // If detail itself has nested data (e.g. data: { role: { message: ... } })
    if (obj.data && typeof obj.data === 'object') {
      for (const [subField, subDetail] of Object.entries(obj.data)) {
        processFieldDetail(subField, subDetail, errors)
      }
      return
    }
  }

  // Rule 2: When field === 'password' and code === 'validation_values_mismatch',
  // map the error to 'passwordConfirm'
  if (
    targetField === 'password' &&
    (code === 'validation_values_mismatch' || (message && message.toLowerCase().includes('match')))
  ) {
    targetField = 'passwordConfirm'
  }

  // Rule: username errors map to email if email has no error
  if (targetField === 'username') {
    if (!errors.email) {
      targetField = 'email'
    } else {
      return
    }
  }

  const translated = translateValidationMessage(targetField, code, message)
  if (!errors[targetField]) {
    errors[targetField] = translated
  }
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return (
    typeof val === 'object' && val !== null && !(val instanceof Response) && !Array.isArray(val)
  )
}

function inspectObjectForFieldErrors(obj: unknown, errors: FieldErrors, visited: Set<unknown>) {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return
  visited.add(obj)

  // Avoid inspecting Response objects
  if (typeof Response !== 'undefined' && obj instanceof Response) {
    return
  }

  const record = obj as Record<string, any>

  // Check known container properties first
  const candidateKeys = ['data', 'response', 'originalError', 'cause', 'errors']
  for (const key of candidateKeys) {
    const candidate = record[key]
    if (candidate && typeof candidate === 'object') {
      if (isPlainObject(candidate)) {
        // If candidate has data property
        if (candidate.data && isPlainObject(candidate.data)) {
          for (const [f, d] of Object.entries(candidate.data)) {
            processFieldDetail(f, d, errors)
          }
        }
        // Also check directly on candidate
        for (const [f, d] of Object.entries(candidate)) {
          if (f !== 'data' && f !== 'response' && f !== 'originalError' && f !== 'cause') {
            if (isFieldValidationError(d)) {
              processFieldDetail(f, d, errors)
            }
          }
        }
      }
    }
  }

  // Check if current obj itself contains field errors
  for (const [f, d] of Object.entries(record)) {
    if (
      f !== 'data' &&
      f !== 'response' &&
      f !== 'originalError' &&
      f !== 'cause' &&
      f !== 'stack'
    ) {
      if (isFieldValidationError(d)) {
        processFieldDetail(f, d, errors)
      }
    }
  }

  // Recursively inspect all enumerable properties
  for (const [, val] of Object.entries(record)) {
    if (val && typeof val === 'object' && !visited.has(val)) {
      inspectObjectForFieldErrors(val, errors, visited)
    }
  }
}

function isFieldValidationError(val: unknown): boolean {
  if (!val) return false
  if (typeof val === 'string') return true
  if (Array.isArray(val) && val.length > 0) return true
  if (typeof val === 'object' && !(val instanceof Response)) {
    const obj = val as Record<string, any>
    if ('code' in obj || 'message' in obj || 'data' in obj) {
      return true
    }
  }
  return false
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') {
    return {}
  }

  // Detailed debug log in development
  if (import.meta.env?.DEV) {
    try {
      const errObj = error as Record<string, any>
      console.log('[extractFieldErrors Debug]', {
        constructor: errObj.constructor?.name,
        allKeys: Object.keys(errObj),
        ownPropertyNames: Object.getOwnPropertyNames(errObj),
        status: errObj.status,
        message: errObj.message,
        data: errObj.data,
        response: errObj.response,
        responseIsResponse: typeof Response !== 'undefined' && errObj.response instanceof Response,
        originalError: errObj.originalError,
        cause: errObj.cause,
      })
    } catch {
      // Ignore logging errors
    }
  }

  const errors: FieldErrors = {}
  const visited = new Set<unknown>()

  const err = error as Record<string, any>

  // 1. First priority: err.data
  if (err.data && typeof err.data === 'object' && !(err.data instanceof Response)) {
    const dataObj = err.data as Record<string, any>
    // Sometimes err.data has .data inside
    const innerData = dataObj.data && typeof dataObj.data === 'object' ? dataObj.data : dataObj
    for (const [field, detail] of Object.entries(innerData)) {
      processFieldDetail(field, detail, errors)
    }
  }

  // 2. Second priority: err.response?.data (when err.response is a plain object, not native Response)
  if (err.response && isPlainObject(err.response)) {
    const respData = err.response.data || err.response
    if (isPlainObject(respData)) {
      for (const [field, detail] of Object.entries(respData)) {
        processFieldDetail(field, detail, errors)
      }
    }
  }

  // 3. Third priority: originalError or cause
  if (err.originalError && isPlainObject(err.originalError)) {
    const origData = err.originalError.data || err.originalError
    if (isPlainObject(origData)) {
      for (const [field, detail] of Object.entries(origData)) {
        processFieldDetail(field, detail, errors)
      }
    }
  }

  if (err.cause && isPlainObject(err.cause)) {
    const causeData = err.cause.data || err.cause
    if (isPlainObject(causeData)) {
      for (const [field, detail] of Object.entries(causeData)) {
        processFieldDetail(field, detail, errors)
      }
    }
  }

  // 4. Last resort fallback: iterate over all enumerable and own properties of err
  // Searching for known validation fields (password, passwordConfirm, email, username, name, fone, role, etc.)
  // or objects that look like validation details
  if (Object.keys(errors).length === 0) {
    inspectObjectForFieldErrors(err, errors, visited)
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

  if (typeof error === 'object') {
    const errObj = error as Record<string, any>
    const msg = errObj.message || (error instanceof Error ? error.message : '')
    if (msg) {
      if (
        msg.includes('Failed to create record') ||
        msg.includes('Failed to update record') ||
        msg.includes('Validation failed') ||
        msg.includes('Something went wrong')
      ) {
        return 'Erro de validação. Verifique os campos e tente novamente.'
      }
      return msg
    }
  }

  if (typeof error === 'string') return error

  return 'Ocorreu um erro inesperado.'
}
