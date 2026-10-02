import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    if (err.status === 401) return true
    if (
      err.status === 400 &&
      (err.message?.toLowerCase().includes('failed to authenticate') ||
        err.message?.toLowerCase().includes('token'))
    ) {
      return true
    }
  }
  const str = String(err).toLowerCase()
  return (
    str.includes('401') ||
    str.includes('token is expired') ||
    str.includes('failed to authenticate') ||
    str.includes('token expired')
  )
}

export function handleSessionExpired(customMessage?: string): void {
  try {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname + window.location.search
      if (pathname && !pathname.includes('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, pathname)
      }
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        customMessage || 'Sua sessão foi encerrada. Faça login novamente.',
      )
    }
  } catch {
    // ignore
  }
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb
