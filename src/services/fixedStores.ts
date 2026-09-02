import type { StoreRecord } from '@/types/fpd'

/**
 * Lista FIXA de lojas do sistema (31 opções, nesta ordem exata).
 *
 * Fonte de verdade da tela de Administração (/admin) para o vínculo
 * de lojas nos formulários de cadastro/edição de usuários.
 *
 * A lista canônica também vive no backend em
 * `pocketbase/migrations/0023_align_fixed_store_list.js` — mantenha os
 * dois lados em sincronia.
 */
export const FIXED_STORE_NAMES: string[] = [
  'CELNET AGUAS CLARA',
  'CELNET ALEXANIA',
  'CELNET APARECIDA SHOPPING',
  'CELNET ARAGUAIA',
  'CELNET AV. MANGALO',
  'CELNET BOULEVARD SHOPPING',
  'CELNET BRASILIA SHOPPING',
  'CELNET CALL ARNIQUEIRAS',
  'CELNET CALL JK',
  'CELNET CALL NOVA SUIÇA',
  'CELNET CALL UP',
  'CELNET CEILANDIA',
  'CELNET CIDADE LIVRE',
  'CELNET DF PLAZA',
  'CELNET GAMA SHOPPING',
  'CELNET GARAVELO',
  'CELNET GOIANIA FLAMBOYANT',
  'CELNET ILHA RESIDENCIAL',
  'CELNET ILHA RESIDENCIAL GAMA DF',
  'CELNET INHUMAS',
  'CELNET LUZIANIA',
  'CELNET MANHATTAN SHOPPING',
  'CELNET MATRIZ PLANALTINA DF',
  'CELNET NEROPOLIS',
  'CELNET NOVA SUIÇA',
  'CELNET PARK SHOPPING',
  'CELNET PLANALTINA GO',
  'CELNET SANTA MARIA',
  'CELNET SHOPPING BENTIVI',
  'CELNET SHOPPING JK',
  'CELNET TERRAÇO SHOPPING',
  'CELNET TRINDADE',
]

/**
 * Converte a lista fixa de nomes em StoreRecord-like (id = nome), preservando
 * a ordem definida em FIXED_STORE_NAMES.
 */
export function fixedStoresAsRecords(): StoreRecord[] {
  return FIXED_STORE_NAMES.map((name) => ({
    id: name,
    name,
    coordenacao: '',
    supervisao: '',
    created: '',
    updated: '',
    collectionId: '',
    collectionName: 'stores',
  }))
}

/**
 * Ordena uma lista de nomes de lojas segundo a ordem da lista fixa.
 */
export function sortStoreNamesByFixedOrder(names: string[]): string[] {
  const order = new Map(FIXED_STORE_NAMES.map((n, i) => [n, i]))
  return [...names].sort((a, b) => {
    const ia = order.get(a) ?? Number.MAX_SAFE_INTEGER
    const ib = order.get(b) ?? Number.MAX_SAFE_INTEGER
    return ia - ib
  })
}
