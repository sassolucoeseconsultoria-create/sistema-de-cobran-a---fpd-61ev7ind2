import PocketBase, { ClientResponseError } from 'pocketbase'
import { toast } from '@/hooks/use-toast'

export const AUTH_REDIRECT_KEY = 'auth_redirect_after_login'
export const SESSION_EXPIRED_BANNER_KEY = 'auth_session_expired_message'

const EXEMPT_AUTH_PATHS = [
  '/auth-with-password',
  '/auth-with-oauth2',
  '/auth-refresh',
  '/request-password-reset',
  '/confirm-password-reset',
  '/request-verification',
  '/confirm-verification',
]

export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof ClientResponseError) {
    return error.status === 401
  }
  const errObj = error as { status?: number; response?: { status?: number }; message?: string }
  if (errObj.status === 401 || errObj.response?.status === 401) {
    return true
  }
  if (typeof errObj.message === 'string' && errObj.message.includes('401')) {
    return true
  }
  return false
}

let isHandlingSessionExpiry = false

export function handleSessionExpired(reason = 'Sua sessão foi encerrada. Faça login novamente.') {
  if (typeof window === 'undefined') return

  if (!isHandlingSessionExpiry) {
    isHandlingSessionExpiry = true

    try {
      const currentPath = window.location.pathname + window.location.search
      if (!window.location.pathname.startsWith('/login')) {
        window.sessionStorage.setItem(AUTH_REDIRECT_KEY, currentPath)
      }
      window.sessionStorage.setItem(SESSION_EXPIRED_BANNER_KEY, reason)
    } catch {
      // sessionStorage might be restricted
    }

    try {
      pb.authStore.clear()
    } catch {
      // ignore
    }

    try {
      toast({
        title: 'Sessão encerrada',
        description: reason,
        variant: 'destructive',
      })
    } catch {
      // toast listener may not be mounted yet
    }

    // Se não estiver na página de login, redirecionar
    if (!window.location.pathname.startsWith('/login')) {
      setTimeout(() => {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.replace('/login')
        }
        isHandlingSessionExpiry = false
      }, 50)
    } else {
      isHandlingSessionExpiry = false
    }
  }
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

// Interceptador de 401 no método send
const originalSend = pb.send.bind(pb)
pb.send = async function (path: string, options: any) {
  try {
    return await originalSend(path, options)
  } catch (error: unknown) {
    const is401 = isSessionExpiredError(error)
    const isExempt = EXEMPT_AUTH_PATHS.some((exempt) => path.includes(exempt))

    // Se for 401 e a chamada era autenticada (ou o authStore possuía token ativo),
    // disparar a rotina centralizada de sessão expirada.
    if (is401 && !isExempt && (Boolean(pb.authStore.token) || pb.authStore.isValid)) {
      handleSessionExpired('Sua sessão foi encerrada. Faça login novamente.')
    }

    throw error
  }
}

export default pb
