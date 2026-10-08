import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect_after_login'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number }).status
  return status === 401 || status === 403
}

export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
      const currentPath = window.location.pathname + window.location.search
      if (currentPath !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
        window.location.href = '/login'
      }
    }
  } catch (e) {
    console.error('Erro ao redirecionar por sessão expirada:', e)
  }
}

export default pb
