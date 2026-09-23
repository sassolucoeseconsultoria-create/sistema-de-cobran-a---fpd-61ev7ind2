import pb from '@/lib/pocketbase/client'
import { executeWithRateLimitRetry } from '@/lib/pocketbase/rateLimiter'
import type { ReferenceDatePermissionRecord } from '@/types/fpd'
import type { UserRole } from '@/contexts/AuthContext'

/**
 * Normaliza uma data de referência para evitar divergências por whitespace.
 */
export function normalizeReferenceDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  return String(dateStr).trim()
}

/**
 * Ordena datas de referência em ordem decrescente (da mais recente para a mais antiga).
 * Suporta formatos DD/MM/YYYY, ISO YYYY-MM-DD e strings gerais.
 */
export function sortReferenceDatesDesc(dates: string[]): string[] {
  return [...dates].sort((a, b) => {
    const normA = normalizeReferenceDate(a)
    const normB = normalizeReferenceDate(b)

    const partsA = normA.split('/')
    const partsB = normB.split('/')
    if (partsA.length === 3 && partsB.length === 3) {
      const dateA = new Date(Number(partsA[2]), Number(partsA[1]) - 1, Number(partsA[0])).getTime()
      const dateB = new Date(Number(partsB[2]), Number(partsB[1]) - 1, Number(partsB[0])).getTime()
      if (!isNaN(dateA) && !isNaN(dateB)) {
        return dateB - dateA
      }
    }

    // Tentar ISO YYYY-MM-DD
    const isoA = Date.parse(normA)
    const isoB = Date.parse(normB)
    if (!isNaN(isoA) && !isNaN(isoB)) {
      return isoB - isoA
    }

    return normB.localeCompare(normA)
  })
}

/**
 * Busca todas as configurações de permissão de data de referência gravadas no PocketBase.
 */
export async function fetchReferenceDatePermissions(): Promise<ReferenceDatePermissionRecord[]> {
  return await executeWithRateLimitRetry(() =>
    pb.collection('reference_date_permissions').getFullList<ReferenceDatePermissionRecord>({
      sort: '-created',
      requestKey: null,
    }),
  )
}

/**
 * Salva ou atualiza a permissão de uma data de referência.
 * Se a permissão para a data já existir, atualiza; senão, cria uma nova.
 */
export async function saveReferenceDatePermission(data: {
  referente: string
  gerente?: boolean
  supervisor?: boolean
  coordenador?: boolean
}): Promise<ReferenceDatePermissionRecord> {
  const normDate = normalizeReferenceDate(data.referente)
  if (!normDate) {
    throw new Error('Data de referência é obrigatória.')
  }

  // Verifica se já existe registro para essa data
  let existing: ReferenceDatePermissionRecord | null = null
  try {
    const escaped = normDate.replace(/"/g, '\\"')
    const list = await executeWithRateLimitRetry(() =>
      pb.collection('reference_date_permissions').getList<ReferenceDatePermissionRecord>(1, 1, {
        filter: `referente = "${escaped}"`,
        requestKey: null,
      }),
    )
    if (list.items.length > 0) {
      existing = list.items[0]
    }
  } catch {
    // ignore
  }

  const payload = {
    referente: normDate,
    gerente: data.gerente !== undefined ? Boolean(data.gerente) : true,
    supervisor: data.supervisor !== undefined ? Boolean(data.supervisor) : true,
    coordenador: data.coordenador !== undefined ? Boolean(data.coordenador) : true,
  }

  if (existing) {
    return await executeWithRateLimitRetry(() =>
      pb
        .collection('reference_date_permissions')
        .update<ReferenceDatePermissionRecord>(existing!.id, payload, { requestKey: null }),
    )
  }

  return await executeWithRateLimitRetry(() =>
    pb
      .collection('reference_date_permissions')
      .create<ReferenceDatePermissionRecord>(payload, { requestKey: null }),
  )
}

/**
 * Verifica se uma data de referência específica está habilitada para determinado perfil de usuário.
 * Regras:
 * - Se a role for 'ADM' ou undefined/desconhecida, sempre retorna true (ADM tem acesso irrestrito).
 * - Se não houver registro de permissão para a referência, retorna true por padrão (default true/true/true).
 * - Se houver registro, avalia a flag do perfil (Gerente -> gerente, Supervisor -> supervisor, Coordenador -> coordenador).
 *   Se a flag for explicitamente false, retorna false; se undefined/null, retorna true por padrão.
 */
export function isReferenceDateAllowedForRole(
  referente: string | null | undefined,
  role: UserRole | string | undefined,
  permissions: ReferenceDatePermissionRecord[],
): boolean {
  if (!role || role === 'ADM') return true
  if (!referente) return true

  const norm = normalizeReferenceDate(referente)
  if (!norm) return true

  const perm = permissions.find((p) => normalizeReferenceDate(p.referente) === norm)
  if (!perm) {
    // Default ao cadastrar nova referência ou referência sem registro = habilitada para todos
    return true
  }

  if (role === 'Gerente') {
    return perm.gerente !== false
  }
  if (role === 'Supervisor') {
    return perm.supervisor !== false
  }
  if (role === 'Coordenador') {
    return perm.coordenador !== false
  }

  return true
}

/**
 * Filtra uma lista de datas de referência mantendo apenas aquelas autorizadas para o perfil.
 * Preserva a ordenação original.
 */
export function filterReferenceDatesForRole(
  dates: string[],
  role: UserRole | string | undefined,
  permissions: ReferenceDatePermissionRecord[],
): string[] {
  if (!role || role === 'ADM') return dates
  return dates.filter((d) => isReferenceDateAllowedForRole(d, role, permissions))
}
