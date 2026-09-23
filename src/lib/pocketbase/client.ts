import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { status?: number; response?: { message?: string } }
  if (anyErr.status === 401 || anyErr.status === 403) return true
  if (
    typeof anyErr.response?.message === 'string' &&
    /token|expire|unauthor/i.test(anyErr.response.message)
  ) {
    return true
  }
  return false
}

export function handleSessionExpired(message?: string): void {
  pb.authStore.clear()
  try {
    if (typeof window !== 'undefined') {
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.includes('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      window.location.href = '/login'
    }
  } catch (e) {
    console.warn('[pocketbase] Falha ao redirecionar após expiração:', e)
  }
}

export default pb
