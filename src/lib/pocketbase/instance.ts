import PocketBase from 'pocketbase'

// Instância ÚNICA de PocketBase do app. Não criar outra instância em
// nenhum outro arquivo (isso divide o authStore e desautentica requests).
// `client.ts` reexporta esta mesma instância para todo o projeto.
const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export { pb }
export default pb
