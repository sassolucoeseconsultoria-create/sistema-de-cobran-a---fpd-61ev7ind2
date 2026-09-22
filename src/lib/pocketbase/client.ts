import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status
    return status === 401 || status === 403
  }
  return false
}

export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.includes('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  } catch {
    // best-effort
  }
}

export default pb
