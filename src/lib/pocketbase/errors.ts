import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/**
 * Mapeia mensagens ou códigos de erro comuns do PocketBase para português
 */
function translateValidationMessage(
  code: string | undefined,
  rawMsg: string | undefined,
  field: string,
): string {
  // Código de erro direto
  if (code === 'validation_length_out_of_range') {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
    return 'O comprimento do campo está fora do limite permitido.'
  }
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
  if (code === 'validation_invalid_email') {
    return 'Formato de e-mail inválido.'
  }
  if (code === 'validation_required') {
    return 'Este campo é obrigatório.'
  }

  // Mensagem textual em inglês do PocketBase
  const msg = rawMsg || ''
  if (/email.*unique/i.test(msg) || /username.*unique/i.test(msg)) {
    return 'Este e-mail já está sendo utilizado por outro usuário.'
  }
  if (/unique/i.test(msg)) {
    return 'Já existe um registro com este valor.'
  }
  if (/match/i.test(msg) && (field === 'password' || field === 'passwordConfirm')) {
    return 'As senhas digitadas não coincidem.'
  }
  if (/match/i.test(msg)) {
    return 'Os valores não coincidem.'
  }
  if (/length must be between/i.test(msg) || /at least 8/i.test(msg) || /too short/i.test(msg)) {
    if (field === 'password' || field === 'passwordConfirm') {
      return 'A senha deve ter no mínimo 8 caracteres.'
    }
  }
  if (/invalid email/i.test(msg)) {
    return 'Formato de e-mail inválido.'
  }
  if (/required/i.test(msg)) {
    return 'Este campo é obrigatório.'
  }

  return rawMsg || 'Campo inválido.'
}

/**
 * Função auxiliar para verificar se um objeto tem formato de item de erro de validação
 */
function isErrorDetail(val: unknown): val is { code?: string; message?: string } {
  if (!val || typeof val !== 'object') return false
  return 'message' in val || 'code' in val
}

/**
 * Extrai recursivamente ou por iteração os erros de validação por campo.
 * Tenta:
 * 1. err.data (PocketBase SDK mapeia errData?.data || {})
 * 2. err.response?.data (quando response é objeto com .data ou Response parseado)
 * 3. err.response diretamente (quando PocketBase SDK 0.26.x retorna objeto plano com os campos na raiz)
 * 4. Fallbacks em originalError.data ou cause.data ou outras propriedades do erro
 */
export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  const anyErr = error as Record<string, unknown>
  const errors: FieldErrors = {}

  // Coleção de possíveis fontes de dicionários de validação
  const candidateSources: unknown[] = []

  // 1. err.data
  if (anyErr.data && typeof anyErr.data === 'object') {
    candidateSources.push(anyErr.data)
  }

  // 2. err.response?.data
  if (
    anyErr.response &&
    typeof anyErr.response === 'object' &&
    !(typeof Response !== 'undefined' && anyErr.response instanceof Response)
  ) {
    const respObj = anyErr.response as Record<string, unknown>
    if (respObj.data && typeof respObj.data === 'object') {
      candidateSources.push(respObj.data)
    }
    // 3. err.response diretamente (se for um objeto plano e não uma Response)
    candidateSources.push(respObj)
  }

  // 4. Fallbacks: originalError.data, cause.data, etc.
  if (anyErr.originalError && typeof anyErr.originalError === 'object') {
    const orig = anyErr.originalError as Record<string, unknown>
    if (orig.data && typeof orig.data === 'object') candidateSources.push(orig.data)
    if (orig.response && typeof orig.response === 'object') candidateSources.push(orig.response)
  }
  if (anyErr.cause && typeof anyErr.cause === 'object') {
    const c = anyErr.cause as Record<string, unknown>
    if (c.data && typeof c.data === 'object') candidateSources.push(c.data)
  }

  // Percorre todas as propriedades de anyErr para achar buckets de campos com erros
  for (const [k, v] of Object.entries(anyErr)) {
    if (
      ![
        'status',
        'message',
        'name',
        'stack',
        'originalError',
        'cause',
        'response',
        'data',
      ].includes(k) &&
      v &&
      typeof v === 'object' &&
      !(typeof Response !== 'undefined' && v instanceof Response)
    ) {
      candidateSources.push(v)
    }
  }

  // Processa as fontes encontradas
  for (const src of candidateSources) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue

    for (const [key, val] of Object.entries(src as Record<string, unknown>)) {
      // Ignora chaves reservadas ou de metadados como 'message', 'code', 'status' caso seja a raiz de response
      if (['message', 'code', 'status'].includes(key) && typeof val === 'string') {
        continue
      }

      // Se for uma string direta
      if (typeof val === 'string' && val.trim().length > 0) {
        if (!errors[key]) {
          errors[key] = translateValidationMessage(undefined, val, key)
        }
        continue
      }

      // Se for um objeto com message ou code
      if (isErrorDetail(val)) {
        const detail = val as { code?: string; message?: string }
        const code = detail.code
        const rawMsg = typeof detail.message === 'string' ? detail.message : undefined

        // Mapeamento especial: quando o campo for `password` com código `validation_values_mismatch`,
        // ou mensagem de mismatch, redirecione para `passwordConfirm`
        if (
          key === 'password' &&
          (code === 'validation_values_mismatch' || (rawMsg && /match/i.test(rawMsg)))
        ) {
          errors.passwordConfirm = 'As senhas digitadas não coincidem.'
          continue
        }

        if (
          key === 'passwordConfirm' &&
          (code === 'validation_values_mismatch' || (rawMsg && /match/i.test(rawMsg)))
        ) {
          errors.passwordConfirm = 'As senhas digitadas não coincidem.'
          continue
        }

        const translated = translateValidationMessage(code, rawMsg, key)
        if (!errors[key]) {
          errors[key] = translated
        }
        continue
      }

      // Se for aninhado (ex: nested.data.role)
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const nested = val as Record<string, unknown>
        if (nested.data && typeof nested.data === 'object') {
          for (const [nKey, nVal] of Object.entries(nested.data as Record<string, unknown>)) {
            if (isErrorDetail(nVal)) {
              const d = nVal as { code?: string; message?: string }
              if (!errors[nKey]) {
                errors[nKey] = translateValidationMessage(d.code, d.message, nKey)
              }
            }
          }
        }
      }
    }
  }

  // Tratamento de username para email se username existir nos erros e email não
  if (errors.username && !errors.email) {
    errors.email = errors.username
    delete errors.username
  } else if (errors.username && errors.email) {
    delete errors.username
  }

  return errors
}

/**
 * Retorna mensagem de erro formatada em português para exibição ao usuário
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro inesperado.'

  // Se houver erros por campo, combina mensagens únicas
  const fieldErrors = extractFieldErrors(error)
  const msgs = Array.from(new Set(Object.values(fieldErrors))).filter(Boolean)

  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  if (error instanceof ClientResponseError) {
    const rawMsg = error.message || ''
    if (/Failed to create record/i.test(rawMsg) || /Failed to authenticate/i.test(rawMsg)) {
      if (error.status === 400) {
        return 'Erro de validação. Verifique os campos e tente novamente.'
      }
      if (error.status === 403 || error.status === 401) {
        return 'Acesso não autorizado ou credenciais inválidas.'
      }
      if (error.status === 404) {
        return 'Registro não encontrado.'
      }
    }
    return translateValidationMessage(undefined, rawMsg, 'general')
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const anyErr = error as Record<string, unknown>
    const rawMsg = typeof anyErr.message === 'string' ? anyErr.message : ''
    if (
      anyErr.status === 400 &&
      (!rawMsg || /Failed to create record/i.test(rawMsg) || /Something went wrong/i.test(rawMsg))
    ) {
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }
    if (rawMsg) {
      return rawMsg
    }
  }

  if (error instanceof Error) {
    const msg = error.message
    if (/Failed to create record/i.test(msg)) {
      return 'Erro de validação. Verifique os campos e tente novamente.'
    }
    return msg
  }

  return 'Ocorreu um erro inesperado.'
}
