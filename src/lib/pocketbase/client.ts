import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb

// Reexport obrigatório (regressão recorrente de build — ver clientSurface.test.ts)
export {
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from './session'
