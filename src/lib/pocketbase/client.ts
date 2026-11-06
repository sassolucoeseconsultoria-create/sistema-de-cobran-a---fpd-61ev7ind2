/**
 * SUPERFÍCIE ÚNICA de acesso ao PocketBase do app.
 *
 * REGRA INEGOCIÁVEL (regressão que já derrubou o build 5×): este módulo DEVE
 * exportar `pb` como named export E default, além de reexportar de './session':
 *   AUTH_REDIRECT_KEY, SESSION_EXPIRED_BANNER_KEY, handleSessionExpired,
 *   isSessionExpiredError.
 * AuthContext, Admin, Login, serviços e testes importam daqui — nunca de
 * 'pocketbase' direto nem de outra instância paralela.
 */
export { pb, default } from './instance'
export {
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from './session'
