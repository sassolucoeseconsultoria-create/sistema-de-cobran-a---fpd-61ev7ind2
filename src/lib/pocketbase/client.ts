import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_banner'

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof ClientResponseError) {
    return err.status === 401 || err.status === 403
  }
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const msg = String((err as { message?: string })?.message || '').toLowerCase()
  return msg.includes('token expired') || msg.includes('failed to authenticate')
}

export function handleSessionExpired(message?: string) {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        message || 'Sua sessão foi encerrada. Faça login novamente.',
      )
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  } catch (e) {
    console.error('Erro ao redirecionar após expiração de sessão:', e)
  }
}

export { pb }
export default pb
