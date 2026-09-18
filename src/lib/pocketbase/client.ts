import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  const errorObj = err as { status?: number; response?: { message?: string }; message?: string }
  if (errorObj.status === 401) return true
  const msg = (errorObj.message || errorObj.response?.message || '').toLowerCase()
  return (
    msg.includes('token') &&
    (msg.includes('expired') || msg.includes('invalid') || msg.includes('unauthorized'))
  )
}

export function handleSessionExpired(customMessage?: string): void {
  pb.authStore.clear()
  if (typeof window !== 'undefined') {
    if (customMessage) {
      try {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, customMessage)
      } catch {
        /* intentionally ignored */
      }
    }
    const currentPath = window.location.pathname + window.location.search
    if (currentPath && currentPath !== '/login') {
      try {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      } catch {
        /* intentionally ignored */
      }
    }
  }
}

export default pb
