import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401 || error.status === 403
  }
  const status = (error as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const msg = String((error as { message?: string })?.message || '').toLowerCase()
  return msg.includes('token') || msg.includes('expired') || msg.includes('unauthorized')
}

export function handleSessionExpired(message = 'Sua sessão expirou. Faça login novamente.'): void {
  try {
    pb.authStore.clear()
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

export { pb }
export default pb
