/**
 * Cliente PocketBase do app — ponto de importação único.
 *
 * REGRA DE PROTEÇÃO (regressão recorrente, não remover):
 * este módulo DEVE exportar `{ pb }` + `default` e reexportar de './session':
 * AUTH_REDIRECT_KEY, SESSION_EXPIRED_BANNER_KEY, handleSessionExpired,
 * isSessionExpiredError. Derrubar qualquer uma dessas exportações quebra o
 * build (AuthContext, Admin e dezenas de telas importam daqui).
 */
import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export {
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from './session'
export default pb
