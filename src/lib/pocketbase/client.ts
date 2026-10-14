import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_fpd_session_expired_notice'

export const isSessionExpiredError = (err: unknown): boolean => {
  if (!err) return false
  const status = (err as { status?: number })?.status
  if (status === 401) return true
  const msg = (err as Error)?.message || String(err)
  return (
    msg.includes('The request requires valid record authorization token') ||
    msg.includes('Failed to authenticate') ||
    msg.includes('token is expired')
  )
}

export const handleSessionExpired = (
  message = 'Sua sessão foi encerrada. Faça login novamente.',
): void => {
  try {
    window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
    if (window.location.pathname !== '/login') {
      window.sessionStorage.setItem(
        AUTH_REDIRECT_KEY,
        window.location.pathname + window.location.search,
      )
    }
  } catch {
    // ignore
  }
}

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export default pb
