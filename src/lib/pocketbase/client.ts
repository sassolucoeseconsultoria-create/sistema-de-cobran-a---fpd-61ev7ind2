import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number }).status
  if (status === 401) return true
  const message = String((err as { message?: string }).message || '').toLowerCase()
  return (
    message.includes('token') &&
    (message.includes('expired') || message.includes('invalid') || message.includes('revoked'))
  )
}

export function handleSessionExpired(customMessage?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      if (customMessage) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, customMessage)
      }
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.includes('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      window.location.href = '/login'
    }
  } catch {
    // Ignore storage/navigation errors
  }
}

export default pb
