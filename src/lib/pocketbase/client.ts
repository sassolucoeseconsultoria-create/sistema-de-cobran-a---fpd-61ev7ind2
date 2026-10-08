import PocketBase, { ClientResponseError } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Verifica se um erro representa sessão expirada ou inválida (status 401 do PocketBase,
 * código 401 na resposta ou mensagens típicas de token expirado/inválido).
 * Nunca lança exceção.
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  try {
    if (error instanceof ClientResponseError) {
      if (error.status === 401) return true
      if (error.response?.code === 401) return true
    }
    const errObj = error as { status?: number; response?: { code?: number }; message?: string }
    if (errObj.status === 401 || errObj.response?.code === 401) {
      return true
    }
    if (typeof errObj.message === 'string') {
      const msg = errObj.message.toLowerCase()
      if (
        msg.includes('session expired') ||
        msg.includes('token expired') ||
        msg.includes('invalid or expired token')
      ) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Limpa o estado de autenticação local e redireciona para /login preservando a URL de retorno.
 */
export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
  } catch {
    // ignorar falhas no clear
  }
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname + window.location.search
    try {
      if (currentPath && currentPath !== '/login') {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      if (message) {
        window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      }
    } catch {
      // ignore sessionStorage errors
    }
    const redirectParam =
      currentPath && currentPath !== '/login' ? `?redirect=${encodeURIComponent(currentPath)}` : ''
    const msgParam = message
      ? `${redirectParam ? '&' : '?'}message=${encodeURIComponent(message)}`
      : ''
    window.location.href = `/login${redirectParam}${msgParam}`
  }
}

export { pb }
export default pb
