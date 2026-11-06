import { describe, it, expect, vi } from 'vitest'
import pb, {
  pb as namedPb,
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from '@/lib/pocketbase/client'
import instancePb from '@/lib/pocketbase/instance'
import * as sessionModule from '@/lib/pocketbase/session'

/**
 * REGRA INEGOCIÁVEL (regressão que já derrubou o build 5×):
 * src/lib/pocketbase/client.ts DEVE exportar { pb } + default e reexportar
 * de './session': AUTH_REDIRECT_KEY, SESSION_EXPIRED_BANNER_KEY,
 * handleSessionExpired, isSessionExpiredError.
 *
 * Além disso, a instância do client e a da session têm de ser a MESMA —
 * instâncias paralelas dividem o authStore e desautenticam requests
 * silenciosamente (sintoma "requests 200 mas tela vazia/sem dados").
 */
describe('Superfície do client PocketBase (regressão build)', () => {
  it('exporta pb como named E default', () => {
    expect(namedPb).toBeDefined()
    expect(pb).toBeDefined()
    expect(namedPb).toBe(pb)
  })

  it('reexporta os utilitários de sessão de ./session', () => {
    expect(AUTH_REDIRECT_KEY).toBe(sessionModule.AUTH_REDIRECT_KEY)
    expect(SESSION_EXPIRED_BANNER_KEY).toBe(sessionModule.SESSION_EXPIRED_BANNER_KEY)
    expect(handleSessionExpired).toBe(sessionModule.handleSessionExpired)
    expect(isSessionExpiredError).toBe(sessionModule.isSessionExpiredError)
  })

  it('handleSessionExpired limpa o authStore da MESMA instância usada pelo app', () => {
    const clearSpy = vi.spyOn(instancePb.authStore, 'clear')
    handleSessionExpired('Sua sessão foi encerrada. Faça login novamente.')
    expect(clearSpy).toHaveBeenCalledTimes(1)
    clearSpy.mockRestore()
  })

  it('isSessionExpiredError detecta 401/403 e mensagens de token', () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true)
    expect(isSessionExpiredError({ status: 403 })).toBe(true)
    expect(
      isSessionExpiredError(new Error('The request requires a valid authentication token')),
    ).toBe(true)
    expect(isSessionExpiredError(new Error('network down'))).toBe(false)
    expect(isSessionExpiredError(null)).toBe(false)
  })
})
