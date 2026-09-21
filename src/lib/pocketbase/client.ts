import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (err instanceof ClientResponseError) {
    return err.status === 401
  }
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: unknown }).status === 401
  }
  return false
}

export function handleSessionExpired(message = 'Sua sessão expirou. Faça login novamente.'): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + window.location.search,
        )
        window.location.href = '/login'
      }
    }
  } catch {
    // Ignore errors in non-browser or test environments
  }
}

export default pb
