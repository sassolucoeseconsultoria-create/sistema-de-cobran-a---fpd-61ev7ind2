import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_banner'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  const err = error as { status?: number; response?: { message?: string }; message?: string }
  if (err.status === 401) return true
  const msg = `${err.response?.message || ''} ${err.message || ''}`.toLowerCase()
  return (
    msg.includes('token expired') ||
    msg.includes('token is expired') ||
    msg.includes('token invalid') ||
    msg.includes('failed to authenticate') ||
    msg.includes('the request requires valid user authorization')
  )
}

export function handleSessionExpired(customMessage?: string): void {
  try {
    const currentPath = window.location.pathname + window.location.search
    if (currentPath && currentPath !== '/login') {
      window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
    }
    window.sessionStorage.setItem(
      SESSION_EXPIRED_BANNER_KEY,
      customMessage || 'Sua sessão expirou. Faça login novamente para continuar.',
    )
  } catch {
    // ignore sessionStorage errors in restricted iframe/private contexts
  }
}

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export default pb
