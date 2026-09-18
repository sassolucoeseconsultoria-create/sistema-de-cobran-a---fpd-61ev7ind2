import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number }).status
  if (status === 401 || status === 403) return true
  const msg = (err as { message?: string }).message || String(err)
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('token expired') ||
    msg.includes('Invalid token') ||
    msg.includes('The request requires valid record authorization token')
  )
}

export function handleSessionExpired(noticeMessage?: string): void {
  pb.authStore.clear()
  try {
    if (noticeMessage) {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, noticeMessage)
    }
  } catch {
    // ignore
  }
}

export { pb }
export default pb
