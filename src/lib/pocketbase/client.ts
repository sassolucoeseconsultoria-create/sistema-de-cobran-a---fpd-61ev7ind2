import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_notice'

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  const err = error as { status?: number; response?: { status?: number; message?: string } }
  if (err.status === 401 || err.response?.status === 401) {
    return true
  }
  const msg = String(err.response?.message || (error as Error)?.message || '').toLowerCase()
  return (
    msg.includes('token expired') ||
    msg.includes('token invalid') ||
    msg.includes('unauthorized') ||
    msg.includes('failed to authenticate')
  )
}

export function handleSessionExpired(message = 'Sua sessão foi encerrada. Faça login novamente.') {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      if (window.location.pathname !== '/login') {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_KEY,
          window.location.pathname + window.location.search,
        )
        window.location.href = '/login'
      }
    }
  } catch (e) {
    console.error('Erro ao redirecionar para login:', e)
  }
}

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export default pb
