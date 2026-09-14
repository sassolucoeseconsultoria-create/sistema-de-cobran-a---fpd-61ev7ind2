import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Erro desconhecido.'

  const errObj = error as {
    status?: number
    statusCode?: number
    message?: string
    response?: { message?: string; data?: Record<string, unknown> }
  }

  // Friendly PT-BR message for HTTP 429
  const responseObj = errObj.response as
    | { status?: number; message?: string; data?: Record<string, unknown> }
    | undefined
  if (
    errObj.status === 429 ||
    errObj.statusCode === 429 ||
    responseObj?.status === 429 ||
    (errObj.message && errObj.message.toLowerCase().includes('too many requests')) ||
    (responseObj?.message && responseObj.message.toLowerCase().includes('too many requests'))
  ) {
    return 'Importação mais lenta por limite de requisições: aguarde, o processo continua automaticamente.'
  }

  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
  }

  const msgs = Object.values(extractFieldErrors(error))
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  if (error.response?.message) {
    if (error.response.message.toLowerCase().includes('too many requests')) {
      return 'Importação mais lenta por limite de requisições: aguarde, o processo continua automaticamente.'
    }
    return error.response.message
  }

  return error.message || 'Ocorreu um erro inesperado.'
}
