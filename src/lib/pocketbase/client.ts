import PocketBase, { ClientResponseError } from 'pocketbase'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number })?.status
  return status === 401 || status === 403
}

export function handleSessionExpired(reason?: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        reason || 'Sua sessão foi encerrada. Faça login novamente.',
      )
    }
  } catch {
    // ignore sessionStorage errors
  }
  pb.authStore.clear()
}

export default pb
