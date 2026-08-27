import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}

  // PocketBase ClientResponseError typically has error.response?.data or error.data
  const errorObj = error as Record<string, any>
  const data =
    errorObj.response?.data || errorObj.data?.data || errorObj.data || errorObj.response || {}

  if (typeof data !== 'object' || data === null) return {}

  const errors: FieldErrors = {}

  const parseDetailMessage = (val: unknown): string | null => {
    if (!val) return null
    if (typeof val === 'string') return val
    if (typeof val === 'object') {
      const obj = val as Record<string, any>
      if (typeof obj.message === 'string' && obj.message) {
        return obj.message
      }
      if (typeof obj.code === 'string' && obj.code) {
        return obj.code
      }
      if (Array.isArray(obj)) {
        const found = obj.map(parseDetailMessage).filter(Boolean).join(', ')
        return found || null
      }
      // If object has nested fields (e.g. { data: { email: { message: ... } } })
      for (const subKey of Object.keys(obj)) {
        const subMsg = parseDetailMessage(obj[subKey])
        if (subMsg) return subMsg
      }
    }
    return null
  }

  for (const [key, detail] of Object.entries(data)) {
    if (key === 'message' || key === 'code') continue // skip top-level summary keys if found in data
    const message = parseDetailMessage(detail)
    if (message) {
      // PocketBase auth collections generate/validate "username" under the hood.
      // If an error is returned on "username", map it to "email" if email has no error yet.
      const targetKey = key === 'username' ? 'email' : key
      if (!errors[targetKey] || key !== 'username') {
        errors[targetKey] = message
      }
    }
  }

  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred.'

  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  if (error instanceof ClientResponseError) {
    return error.message || 'An unexpected error occurred.'
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred.'
}
