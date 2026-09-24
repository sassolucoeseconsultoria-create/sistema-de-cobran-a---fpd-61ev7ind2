import pb from '@/lib/pocketbase/client'
import { executeWithRateLimitRetry } from '@/lib/pocketbase/rateLimiter'
import type { UserRole } from '@/contexts/AuthContext'

export interface ConfigBotaoRecord {
  id: string
  collectionId: string
  collectionName: string
  tela_id: string
  tela_nome: string
  botao_id: string
  botao_nome: string
  adm: boolean
  coordenador: boolean
  supervisor: boolean
  gerente: boolean
  ordem?: number
  created: string
  updated: string
}

export type RoleConfigField = 'adm' | 'coordenador' | 'supervisor' | 'gerente'

/**
 * Normaliza a role recebida para o formato padrão do sistema:
 * 'Administrador' -> 'ADM'
 * 'Coordenador', 'Supervisor', 'Gerente' -> mantidos
 */
export function normalizeUserRole(role?: string | null): UserRole | 'ADM' | string {
  if (!role) return ''
  const trimmed = role.trim()
  if (trimmed.toUpperCase() === 'ADMINISTRADOR' || trimmed.toUpperCase() === 'ADM') {
    return 'ADM'
  }
  return trimmed
}

/**
 * Busca todas as configurações de botões salvas no PocketBase ordenadas pelo campo `ordem`.
 * Em caso de falha de rede/requisição, captura o erro, emite console.warn e retorna [].
 */
export async function fetchConfigBotoes(): Promise<ConfigBotaoRecord[]> {
  try {
    return await executeWithRateLimitRetry(() =>
      pb.collection('config_botoes').getFullList<ConfigBotaoRecord>({
        sort: 'ordem',
        requestKey: null,
      }),
    )
  } catch (err: unknown) {
    console.warn('Falha ao carregar configurações de botões do backend:', err)
    return []
  }
}

/**
 * Atualiza o acesso de um perfil específico para determinado botão configurado.
 */
export async function updateConfigBotaoRole(
  id: string,
  roleField: RoleConfigField,
  enabled: boolean,
): Promise<ConfigBotaoRecord> {
  return await executeWithRateLimitRetry(() =>
    pb.collection('config_botoes').update<ConfigBotaoRecord>(
      id,
      {
        [roleField]: enabled,
      },
      { requestKey: null },
    ),
  )
}

/**
 * Verifica se um botão específico está visível para determinado perfil de usuário.
 *
 * Regras:
 * 1. Role "ADM" (ou normalizada de "Administrador") sempre vê os botões por padrão, a menos
 *    que o registro de config determine expressamente `adm === false`.
 * 2. Fallback padrão seguro caso o registro não exista ou a lista de configs esteja vazia
 *    (ex.: erro de rede): ADM vê (`true`), demais perfis não veem (`false`).
 * 3. Se houver registro daquele botão na tela:
 *    - ADM: config.adm !== false
 *    - Coordenador: config.coordenador === true
 *    - Supervisor: config.supervisor === true
 *    - Gerente: config.gerente === true
 *    - Outros: false
 */
export function isButtonVisibleForRole(
  configs: ConfigBotaoRecord[] | null | undefined,
  telaId: string,
  botaoId: string,
  userRole?: string | null,
): boolean {
  const normRole = normalizeUserRole(userRole)

  if (!configs || configs.length === 0) {
    // Fallback padrão seguro se registros ou rede falharem: ADM vê, demais não
    return normRole === 'ADM'
  }

  const found = configs.find((c) => c.tela_id === telaId && c.botao_id === botaoId)

  if (!found) {
    // Se o registro para a tela e botão não foi cadastrado, fallback seguro
    return normRole === 'ADM'
  }

  if (normRole === 'ADM') {
    return found.adm !== false
  }

  if (normRole.toLowerCase() === 'coordenador') {
    return found.coordenador === true
  }

  if (normRole.toLowerCase() === 'supervisor') {
    return found.supervisor === true
  }

  if (normRole.toLowerCase() === 'gerente') {
    return found.gerente === true
  }

  return false
}
