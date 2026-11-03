/**
 * Sessão: utilitários compartilhados entre AuthContext, Login e as telas.
 *
 * `handleSessionExpired` limpa a sessão, grava o aviso que a tela de Login
 * exibe e memoriza a rota original para devolver o usuário a ela após novo
 * login. `isSessionExpiredError` detecta 401/403/token expirado/refresh falho
 * em qualquer erro do PocketBase. `AUTH_REDIRECT_KEY` e
 * `SESSION_EXPIRED_BANNER_KEY` são as chaves de sessionStorage usadas na
 * comunicação entre as telas.
 */
import pb from './instance'

export const AUTH_REDIRECT_KEY = 'auth_redirect_path'
export const SESSION_EXPIRED_BANNER_KEY = 'session_expired_banner'

function clearAuthSession(): void {
  try {
    pb.authStore.clear()
  } catch {
    // ignore
  }
}

export function handleSessionExpired(message?: string): void {
  clearAuthSession()
  try {
    if (message) {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
    }
    const currentPath = window.location.pathname + window.location.search + window.location.hash
    const isLoginRoute = /^\/login(\/|$)/.test(currentPath)
    if (currentPath && currentPath !== '/' && !isLoginRoute) {
      window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
    }
  } catch {
    // ignore
  }
}

export function isSessionExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number | string }).status
  if (status === 401 || status === 403) return true

  const response = (err as { response?: { status?: number | string } }).response
  const responseStatus = response?.status
  if (responseStatus === 401 || responseStatus === 403) return true

  const message = err instanceof Error ? err.message : String(err ?? '')
  return (
    message.includes('session expired') ||
    message.includes('The request requires a valid authentication token') ||
    message.includes('refresh token') ||
    message.includes('token invalid')
  )
}
