import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'fpd_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'fpd_session_expired_banner'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Identifica se um erro de API é causado por sessão expirada ou não autenticada (401).
 */
export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { status?: number; response?: { code?: number }; message?: string }
  if (anyErr.status === 401 || anyErr.response?.code === 401) {
    return true
  }
  const msg = String(anyErr.message || '')
  return msg.includes('401') || msg.toLowerCase().includes('token is expired')
}

/**
 * Trata expiração de sessão redirecionando ou gravando o aviso para a tela de login.
 */
export function handleSessionExpired(
  notice = 'Sua sessão foi encerrada. Faça login novamente.',
): void {
  try {
    pb.authStore.clear()
    window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, notice)
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.sessionStorage.setItem(
        AUTH_REDIRECT_KEY,
        window.location.pathname + window.location.search,
      )
      window.location.href = '/login'
    }
  } catch {
    // sessionStorage indisponível
  }
}

export default pb
