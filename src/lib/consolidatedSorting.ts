import type { ConsolidatedRow } from '@/types/fpd'

/**
 * Ordenação de exibição do Consolidado de Acompanhamento de FPD (tabela da rota "/").
 *
 * Convenção de tabela de negócio (cobrança):
 * - 1º clique em uma coluna = ordena do MAIOR para o MENOR (desc);
 * - 2º clique na mesma coluna = do MENOR para o MAIOR (asc), alternando a cada clique;
 * - LOJAS (coluna alfabética) segue a mesma alternância: 1º clique Z→A, 2º A→Z;
 * - Apenas ordenação de EXIBIÇÃO: não altera dados, exportação .xlsx, consolidação
 *   nem contadores da tela.
 *
 * A linha de TOTAIS (rodapé fixo) NUNCA entra na ordenação — ela é renderizada
 * fora do corpo da tabela e por isso não precisa ser filtrada aqui.
 */

export type ConsolidatedSortColumn =
  | 'storeName'
  | 'coordenacao'
  | 'supervisao'
  | 'totalLinhas'
  | 'faturaPaga'
  | 'naoTratados'
  | 'pendente'
  | 'envioFatura'
  | 'promessaPagto'
  | 'semContato'
  | 'cancelados'
  | 'contatoRealizado'

export type SortDirection = 'desc' | 'asc'

export interface ConsolidatedSortState {
  column: ConsolidatedSortColumn
  direction: SortDirection
}

/** Colunas de texto (ordenam alfabeticamente com locale 'pt-BR'). */
const TEXT_COLUMNS: ReadonlySet<ConsolidatedSortColumn> = new Set([
  'storeName',
  'coordenacao',
  'supervisao',
])

/** Colunas numéricas da tabela (todas as demais são numéricas). */
export const CONSOLIDATED_SORT_COLUMNS: readonly ConsolidatedSortColumn[] = [
  'storeName',
  'coordenacao',
  'supervisao',
  'totalLinhas',
  'faturaPaga',
  'naoTratados',
  'pendente',
  'envioFatura',
  'promessaPagto',
  'semContato',
  'cancelados',
  'contatoRealizado',
]

function getTextValue(row: ConsolidatedRow, column: ConsolidatedSortColumn): string {
  const value = row[column]
  return typeof value === 'string' ? value : ''
}

function getNumericValue(row: ConsolidatedRow, column: ConsolidatedSortColumn): number {
  const value = row[column]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Ordena as linhas por uma coluna, SEM alterar a ordem relativa das linhas empatadas
 * (sort estável): preserva a ordem atual de exibição como critério de desempate.
 *
 * @param rows    linhas do consolidado (a linha de totais NÃO faz parte desta lista)
 * @param column  coluna clicada
 * @param direction 'desc' (maior→menor) ou 'asc' (menor→maior)
 */
export function sortConsolidatedRows(
  rows: ConsolidatedRow[],
  column: ConsolidatedSortColumn,
  direction: SortDirection,
): ConsolidatedRow[] {
  const sorted = [...rows]

  if (TEXT_COLUMNS.has(column)) {
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
    sorted.sort((a, b) => {
      const result = collator.compare(getTextValue(a, column), getTextValue(b, column))
      return direction === 'desc' ? -result : result
    })
    return sorted
  }

  sorted.sort((a, b) => {
    const result = getNumericValue(a, column) - getNumericValue(b, column)
    return direction === 'desc' ? -result : result
  })
  return sorted
}

/**
 * Estado de ordenação para um clique no cabeçalho:
 * - coluna nova → sempre começa em 'desc' (do maior para o menor);
 * - mesma coluna → alterna desc ↔ asc.
 */
export function nextSortState(
  current: ConsolidatedSortState | null,
  column: ConsolidatedSortColumn,
): ConsolidatedSortState {
  if (!current || current.column !== column) {
    return { column, direction: 'desc' }
  }
  return { column, direction: current.direction === 'desc' ? 'asc' : 'desc' }
}
