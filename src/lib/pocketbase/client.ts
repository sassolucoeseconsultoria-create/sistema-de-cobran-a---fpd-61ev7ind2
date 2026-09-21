import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as Record<string, unknown>
    const status = errorObj.status
    if (status === 401 || status === 403) {
      return true
    }
    const message = typeof errorObj.message === 'string' ? errorObj.message.toLowerCase() : ''
    if (
      message.includes('token') ||
      message.includes('session expired') ||
      message.includes('failed to authenticate') ||
      message.includes('sessão') ||
      message.includes('unauthorized')
    ) {
      return true
    }
  }
  return false
}

export function handleSessionExpired(
  noticeMessage = 'Sua sessão foi encerrada. Faça login novamente.',
) {
  try {
    pb.authStore.clear()
    window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, noticeMessage)
    if (window.location.pathname !== '/login') {
      window.sessionStorage.setItem(
        AUTH_REDIRECT_KEY,
        window.location.pathname + window.location.search,
      )
      window.location.href = '/login'
    }
  } catch {
    // ignore
  }
}

export default pb
