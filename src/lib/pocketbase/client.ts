import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect_after_login'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_banner_notice'

export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    if (error.status === 401 || error.status === 403) return true
    const msg = (error.message || '').toLowerCase()
    if (
      msg.includes('token') ||
      msg.includes('expired') ||
      msg.includes('unauthorized') ||
      msg.includes('authenticate')
    ) {
      return true
    }
  }
  if (error && typeof error === 'object') {
    const errObj = error as { status?: number; code?: number; message?: string }
    if (
      errObj.status === 401 ||
      errObj.status === 403 ||
      errObj.code === 401 ||
      errObj.code === 403
    ) {
      return true
    }
    const msg = (errObj.message || '').toLowerCase()
    if (
      msg.includes('token') ||
      msg.includes('expired') ||
      msg.includes('unauthorized') ||
      msg.includes('authenticate')
    ) {
      return true
    }
  }
  return false
}

export function handleSessionExpired(reason?: string): void {
  try {
    pb.authStore.clear()
  } catch {
    // ignore
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (reason) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, reason)
      }
      if (window.location && window.location.pathname && window.location.pathname !== '/login') {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + (window.location.search || ''),
        )
      }
    }
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export default pb
