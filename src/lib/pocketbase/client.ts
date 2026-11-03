import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }

// Reexporta os utilitários de sessão (chaves de redirecionamento/banner e
// detecção de sessão expirada) — a remoção destas reexportações quebra o build.
export {
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from './session'

export default pb
