import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect_after_login'
export const SESSION_EXPIRED_BANNER_KEY = 'auth_session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number })?.status
  return status === 401 || status === 403
}

export function handleSessionExpired(message?: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        message || 'Sua sessão expirou. Faça login novamente.',
      )
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
    }
  } catch {
    // Ignore storage errors
  }
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb
