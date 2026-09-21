import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const msg = String((err as { message?: string })?.message || '').toLowerCase()
  return (
    msg.includes('token expired') || msg.includes('session expired') || msg.includes('unauthorized')
  )
}

export function handleSessionExpired(message?: string): void {
  pb.authStore.clear()
  if (typeof window !== 'undefined') {
    if (message) {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
    }
    const currentPath = window.location.pathname + window.location.search
    if (!currentPath.includes('/login')) {
      window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      window.location.href = '/login'
    }
  }
}

export { pb }
export default pb
