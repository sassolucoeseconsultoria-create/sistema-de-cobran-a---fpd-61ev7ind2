import PocketBase, { ClientResponseError } from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Detecta se um erro retornado pelo PocketBase indica sessão expirada ou token inválido (HTTP 401/403).
 */
export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false

  if (err instanceof ClientResponseError) {
    if (err.status === 401) return true
    if (err.status === 403) {
      const msg = (err.message || '').toLowerCase()
      if (
        msg.includes('token') ||
        msg.includes('auth') ||
        msg.includes('expired') ||
        msg.includes('unauthorized') ||
        msg.includes('forbidden')
      ) {
        return true
      }
    }
  }

  const anyErr = err as { status?: number; response?: { message?: string }; message?: string }
  if (anyErr?.status === 401) return true
  if (typeof anyErr?.message === 'string') {
    const msg = anyErr.message.toLowerCase()
    if (
      msg.includes('token expired') ||
      msg.includes('token is expired') ||
      msg.includes('failed to authenticate') ||
      msg.includes('unauthorized')
    ) {
      return true
    }
  }

  return false
}

/**
 * Executa o encerramento da sessão expirada:
 * - Limpa o authStore do PocketBase
 * - Registra a mensagem de aviso para a tela de login
 * - Salva o destino atual para redirecionamento pós-login
 * - Redireciona para /login sem perder a rota de retorno
 */
export function handleSessionExpired(
  message = 'Sua sessão foi encerrada. Faça login novamente.',
): void {
  try {
    pb.authStore.clear()
  } catch {
    // ignora erro ao limpar authStore
  }

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
    } catch {
      // ignora restrições de sessionStorage
    }

    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
  }
}

export default pb
