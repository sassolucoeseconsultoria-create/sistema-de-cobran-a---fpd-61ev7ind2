import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsolidatedSortColumn, ConsolidatedSortState } from '@/lib/consolidatedSorting'

interface SortableHeaderCellProps {
  column: ConsolidatedSortColumn
  label: string
  className?: string
  /** Quando true, aplica fundo sólido do cabeçalho na célula (coluna fixa da esquerda). */
  sticky?: boolean
  /** Conteúdo customizado da célula (ex.: chip colorido). O indicador deve estar dentro dele. */
  inner?: ReactNode
  sortState: ConsolidatedSortState | null
  onSort: (column: ConsolidatedSortColumn) => void
}

/**
 * Cabeçalho clicável que ordena a tabela do Consolidado (rota "/").
 * Indicador visual: seta para baixo = do maior para o menor (desc, 1º clique);
 * seta para cima = do menor para o maior (asc). Colunas inativas exibem
 * apenas um indicador neutro apagado.
 */
export function SortableHeaderCell({
  column,
  label,
  className,
  sticky = false,
  inner,
  sortState,
  onSort,
}: SortableHeaderCellProps) {
  const isActive = sortState?.column === column

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSort(column)
    }
  }

  return (
    <th
      scope="col"
      role="columnheader"
      aria-sort={isActive ? (sortState?.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
      data-sort-column={column}
      className={cn('p-0', className)}
      style={!sticky ? { backgroundColor: '#12365A' } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ordenar por ${label}`}
        title={`Ordenar por ${label}`}
        data-testid={`sortable-header-${column}`}
        onClick={() => onSort(column)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center justify-center gap-1 h-full w-full select-none cursor-pointer transition-colors',
          'hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E9F8A]',
        )}
      >
        {inner ? (
          inner
        ) : (
          <>
            {label}
            <SortIndicator column={column} sortState={sortState} />
          </>
        )}
      </div>
    </th>
  )
}

interface SortIndicatorProps {
  column: ConsolidatedSortColumn
  sortState: ConsolidatedSortState | null
}

/**
 * Seta indicadora da direção atual da ordenação.
 * Coluna ativa: seta para baixo (desc — do maior para o menor, padrão do 1º clique)
 * ou seta para cima (asc). Coluna inativa: indicador neutro apagado.
 */
export function SortIndicator({ column, sortState }: SortIndicatorProps) {
  const isActive = sortState?.column === column

  return (
    <span
      aria-hidden="true"
      data-testid={`sort-indicator-${column}`}
      className={cn(
        'inline-flex items-center justify-center w-3.5 h-3.5 shrink-0',
        isActive ? 'text-[#67e8f9]' : 'text-white/40',
      )}
    >
      {isActive ? (
        sortState?.direction === 'desc' ? (
          <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUp className="w-3 h-3" />
        )
      ) : (
        <ChevronsUpDown className="w-3 h-3 opacity-50" />
      )}
    </span>
  )
}
