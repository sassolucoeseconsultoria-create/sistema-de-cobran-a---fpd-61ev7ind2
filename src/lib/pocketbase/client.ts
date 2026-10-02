import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const message = String((err as { message?: string })?.message || '').toLowerCase()
  return (
    message.includes('token') ||
    message.includes('unauthorized') ||
    message.includes('autentica') ||
    message.includes('sessão') ||
    message.includes('expired')
  )
}

export function handleSessionExpired(message?: string): void {
  pb.authStore.clear()
  if (typeof window !== 'undefined') {
    if (message) {
      try {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      } catch {
        // ignore storage errors
      }
    }
  }
}

export { pb }
export default pb
