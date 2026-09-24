import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as any)?.status
  const message = String((err as any)?.message || '').toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    message.includes('token') ||
    message.includes('unauthorized') ||
    message.includes('expired')
  )
}

export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        message || 'Sua sessão foi encerrada. Faça login novamente.',
      )
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + window.location.search,
        )
        window.location.href = '/login'
      }
    }
  } catch {
    // ignore
  }
}

export { pb }
export default pb
