import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Checa se o erro retornado pelo PocketBase indica que a sessão do usuário expirou (HTTP 401).
 */
export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as { status?: number; response?: { code?: number }; message?: string }
    if (errorObj.status === 401 || errorObj.response?.code === 401) {
      return true
    }
    const msg = errorObj.message || ''
    if (
      msg.includes('The request requires valid record authorization token') ||
      msg.includes('Failed to authenticate')
    ) {
      return true
    }
  }
  return false
}

/**
 * Trata sessão expirada limpando os dados locais e sinalizando a tela de login.
 */
export function handleSessionExpired(message?: string): void {
  try {
    pb.authStore.clear()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_EXPIRED_BANNER_KEY,
        message || 'Sua sessão expirou. Faça login novamente.',
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

export default pb
