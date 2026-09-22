import PocketBase, { ClientResponseError } from 'pocketbase'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status?: number }).status === 401
  }
  return false
}

export function handleSessionExpired(message = 'Sua sessão expirou. Faça login novamente.'): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && currentPath !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      window.location.href = '/login'
    }
  } catch {
    // fallback
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }
}

export default pb
