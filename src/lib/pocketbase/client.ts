import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401
  }
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; response?: { status?: number }; message?: string }
    if (err.status === 401 || err.response?.status === 401) {
      return true
    }
    if (typeof err.message === 'string' && /401|unauthorized|token.*expired/i.test(err.message)) {
      return true
    }
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
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  } catch {
    // ignore in non-browser environments
  }
}

export default pb
