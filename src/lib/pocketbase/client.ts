import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_banner'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401
  }
  const errObj = error as { status?: number; response?: { status?: number }; message?: string }
  if (errObj.status === 401 || errObj.response?.status === 401) {
    return true
  }
  const msg = typeof errObj.message === 'string' ? errObj.message.toLowerCase() : ''
  return (
    msg.includes('token expired') ||
    msg.includes('token is invalid') ||
    msg.includes('unauthorized') ||
    msg.includes('session expired')
  )
}

export function handleSessionExpired(customMessage?: string): void {
  try {
    pb.authStore.clear()
    const message = customMessage || 'Sua sessão foi encerrada. Faça login novamente.'
    window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
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
