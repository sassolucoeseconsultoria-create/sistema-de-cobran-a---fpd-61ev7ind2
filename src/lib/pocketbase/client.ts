import PocketBase, { ClientResponseError } from 'pocketbase'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'pb_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'pb_session_expired'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    return (err as { status?: number }).status === 401
  }
  return false
}

export function handleSessionExpired(redirectPath?: string): void {
  try {
    pb.authStore.clear()
    if (redirectPath && redirectPath !== '/login') {
      window.sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectPath)
    }
    window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, '1')
  } catch {
    // ignore sessionStorage errors in restricted environments
  }
}

export default pb
