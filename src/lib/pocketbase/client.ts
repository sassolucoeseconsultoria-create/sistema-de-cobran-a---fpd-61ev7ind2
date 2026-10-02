import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'pb_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'pb_session_expired'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const message = String((err as { message?: string })?.message || '').toLowerCase()
  return message.includes('token') && (message.includes('expired') || message.includes('invalid'))
}

export function handleSessionExpired(message?: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        message || 'Sua sessão expirou. Faça login novamente.',
      )
    }
  } catch {
    // ignore sessionStorage errors
  }
}

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export default pb
