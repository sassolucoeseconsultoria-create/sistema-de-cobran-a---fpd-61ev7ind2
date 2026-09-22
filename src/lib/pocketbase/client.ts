import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401 || error.status === 403
  }
  const status = (error as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const message = String((error as { message?: string })?.message || '').toLowerCase()
  return (
    message.includes('token expired') ||
    message.includes('token is expired') ||
    message.includes('session expired') ||
    message.includes('the request requires valid user authorization token') ||
    message.includes('unauthorized')
  )
}

export function handleSessionExpired(reason?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        reason || 'Sua sessão expirou. Faça login novamente.',
      )
      if (
        window.location.pathname !== '/login' &&
        !window.sessionStorage.getItem(AUTH_REDIRECT_KEY)
      ) {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + window.location.search,
        )
      }
      window.location.href = '/login'
    }
  } catch {
    // ignore
  }
}

export { pb }
export default pb
