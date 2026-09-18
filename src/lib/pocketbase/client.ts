import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const errorObj = err as Record<string, unknown>
  const status = errorObj.status || errorObj.statusCode || errorObj.code
  if (status === 401 || status === 403) return true

  const msg = String(errorObj.message || errorObj.data || '').toLowerCase()
  if (
    msg.includes('token') &&
    (msg.includes('expired') || msg.includes('invalid') || msg.includes('revoked'))
  ) {
    return true
  }
  if (msg.includes('session expired') || msg.includes('failed to authenticate')) {
    return true
  }

  return false
}

export function handleSessionExpired(reason?: string) {
  try {
    if (typeof window !== 'undefined') {
      if (reason) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, reason)
      }
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && currentPath !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
    }
  } catch {
    // ignore
  }
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb
