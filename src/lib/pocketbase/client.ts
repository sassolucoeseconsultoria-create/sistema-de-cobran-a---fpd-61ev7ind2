import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

// Exporta o cliente também como nomeado: alguns módulos (ex. batchImportService)
// importam `{ pb }` de '@/lib/pocketbase/client'.
export { pb }
export default pb

// Reexporta os utilitários de sessão (módulo formalizado em session.ts).
// Histórico: os importadores (AuthContext, ClientesMovel, etc.) consomem essas
// funções a partir de '@/lib/pocketbase/client' — esta reexportação é o que
// mantém o build passando (regressão recorrente nas versões 0.0.175/0.0.181).
export {
  AUTH_REDIRECT_KEY,
  SESSION_EXPIRED_BANNER_KEY,
  handleSessionExpired,
  isSessionExpiredError,
} from './session'
