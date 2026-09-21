import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect_after_login'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { status?: number; response?: { message?: string } }
  if (err.status === 401) return true
  const msg = err.response?.message?.toLowerCase() || ''
  return msg.includes('token') || msg.includes('expired') || msg.includes('unauthorized')
}

export function handleSessionExpired(message?: string): void {
  try {
    if (typeof window !== 'undefined') {
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + window.location.search,
        )
        window.location.href = '/login'
      }
    }
  } catch {
    /* intentionally ignored */
  }
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb
