import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401
  }
  const err = error as { status?: number; response?: { code?: number; status?: number } }
  return err.status === 401 || err.response?.code === 401 || err.response?.status === 401
}

export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
      const currentPath = window.location.pathname + window.location.search
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
        window.location.href = '/login'
      }
    }
  } catch (e) {
    console.error('[handleSessionExpired] Erro ao tratar expiração de sessão:', e)
  }
}

export { pb }
export default pb
