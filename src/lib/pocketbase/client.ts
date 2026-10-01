import PocketBase from 'pocketbase'

export const AUTH_REDIRECT_KEY = 'celnet_auth_redirect'
export const SESSION_EXPIRED_BANNER_KEY = 'celnet_session_expired_notice'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Verifica se um erro retornado pelo PocketBase (ou requisição fetch)
 * indica que a sessão/token expirou ou é inválido (401 Unauthorized).
 */
export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false

  const errObj = err as {
    status?: number
    statusCode?: number
    response?: { status?: number; message?: string }
    message?: string
  }

  if (errObj.status === 401 || errObj.statusCode === 401 || errObj.response?.status === 401) {
    return true
  }

  const msg = typeof errObj.message === 'string' ? errObj.message.toLowerCase() : ''
  if (
    msg.includes('the request requires higher authorization') ||
    msg.includes('failed to authenticate') ||
    msg.includes('token expired') ||
    msg.includes('token is expired') ||
    msg.includes('token is invalid') ||
    msg.includes('unauthorized')
  ) {
    return true
  }

  return false
}

/**
 * Trata o encerramento da sessão: limpa a authStore, salva o aviso para
 * a tela de login e redireciona o usuário para /login preservando o destino.
 */
export function handleSessionExpired(
  message = 'Sua sessão foi encerrada. Faça login novamente.',
): void {
  try {
    pb.authStore.clear()
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined') {
    try {
      const currentPath = window.location.pathname + window.location.search
      if (currentPath && !currentPath.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, message)
    } catch {
      // ignore
    }

    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  }
}

export { pb }
export default pb
