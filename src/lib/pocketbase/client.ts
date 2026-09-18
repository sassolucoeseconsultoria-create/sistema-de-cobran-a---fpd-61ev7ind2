import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: number }).status
    if (status === 401) return true
    const message = (err as { message?: string }).message
    if (message && (message.includes('401') || message.includes('Failed to authenticate') || message.includes('The request requires valid record authorization token.'))) {
      return true
    }
  }
  return false
}

export function handleSessionExpired(customMessage?: string): void {
  try {
    pb.authStore.clear()
    const msg = customMessage || 'Sua sessão foi encerrada. Faça login novamente.'
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, msg)
      const currentPath = window.location.pathname + window.location.search
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
        window.location.href = '/login'
      }
    }
  } catch {
    // ignore
  }
}

export default pb
