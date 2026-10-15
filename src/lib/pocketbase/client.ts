import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect_to'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_notice'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as { status?: number; response?: { message?: string }; message?: string }

  if (err.status === 401) {
    return true
  }

  const message = (err.message || err.response?.message || '').toLowerCase()
  if (message.includes('token') && (message.includes('expired') || message.includes('invalid'))) {
    return true
  }

  return false
}

export function handleSessionExpired(
  message = 'Sua sessão foi encerrada. Faça login novamente.',
): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  } catch (err) {
    console.warn('[client] Failed to handle session expired redirect', err)
  }
}

export default pb
