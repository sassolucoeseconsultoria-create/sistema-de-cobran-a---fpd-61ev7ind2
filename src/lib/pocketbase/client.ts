import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_notice'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  const errorObj = err as { status?: number; response?: { message?: string; code?: number } }
  if (errorObj.status === 401) return true
  const msg = String((err as any)?.message || '')
  if (msg.includes('The request requires valid record authorization token')) return true
  if (msg.includes('Failed to authenticate')) return true
  return false
}

export function handleSessionExpired(message?: string): void {
  try {
    // Limpar senha da sessão imediatamente ao expirar
    window.sessionStorage.removeItem('fpd_session_user_pw')
    if (message) {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
    }
  } catch {
    // ignore
  }
}

export { pb }
export default pb
