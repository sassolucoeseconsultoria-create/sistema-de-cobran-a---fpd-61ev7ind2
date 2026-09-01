import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Filter,
  X,
  RotateCcw,
  Table,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Store,
  Sparkles,
  RefreshCw,
  Code2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import {
  fetchRelacionamentoRows,
  fetchDistinctRelacionamentoLojas,
  deleteRelacionamentoRow,
  clearAllRelacionamentoRows,
} from '@/services/relacionamentoService'
import type { RelacionamentoRecord, RelacionamentoAba } from '@/types/fpd'
import { cn } from '@/lib/utils'

export const Relacionamento: React.FC = () => {
  const { toast } = useToast()

  // Data state
  const [rows, setRows] = useState<RelacionamentoRecord[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedAba, setSelectedAba] = useState<RelacionamentoAba | 'TODAS'>('TODAS')
  const [selectedLoja, setSelectedLoja] = useState<string>('TODAS')
  const [availableLojas, setAvailableLojas] = useState<string[]>([])

  // Expanded row IDs for JSON inspection
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  // Modal dialog for detailed JSON view
  const [detailRow, setDetailRow] = useState<RelacionamentoRecord | null>(null)

  // Delete single / clear all dialogs
  const [rowToDelete, setRowToDelete] = useState<RelacionamentoRecord | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // Load distinct store names
  const loadLojas = useCallback(async () => {
    try {
      const lojas = await fetchDistinctRelacionamentoLojas()
      setAvailableLojas(lojas)
    } catch {
      // ignore
    }
  }, [])

  // Load rows from backend
  const loadRows = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetchRelacionamentoRows({
        page,
        perPage,
        search: debouncedSearch,
        aba: selectedAba,
        loja: selectedLoja,
        sort: '-created',
      })
      setRows(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar as linhas analíticas de Inadimplência.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, perPage, debouncedSearch, selectedAba, selectedLoja, toast])

  // Initial load
  useEffect(() => {
    loadLojas()
  }, [loadLojas])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  // Real-time subscription to 'relacionamento'
  useRealtime<RelacionamentoRecord>('relacionamento', () => {
    loadRows()
    loadLojas()
  })

  // Toggle JSON expansion inline
  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Clear filters
  const hasActiveFilters =
    debouncedSearch !== '' || selectedAba !== 'TODAS' || selectedLoja !== 'TODAS'

  const handleClearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setSelectedAba('TODAS')
    setSelectedLoja('TODAS')
    setPage(1)
  }

  // Handle single deletion
  const handleDeleteRow = async (id: string) => {
    try {
      await deleteRelacionamentoRow(id)
      toast({
        title: 'Linha excluída',
        description: 'A linha analítica foi removida com sucesso.',
      })
      setRowToDelete(null)
      loadRows()
      loadLojas()
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a linha selecionada.',
        variant: 'destructive',
      })
    }
  }

  // Handle clear all
  const handleClearAll = async () => {
    try {
      setIsClearing(true)
      const count = await clearAllRelacionamentoRows()
      toast({
        title: 'Base analítica limpa',
        description: `${count} registro(s) de inadimplência foram removidos com sucesso.`,
      })
      setClearDialogOpen(false)
      loadRows()
      loadLojas()
    } catch {
      toast({
        title: 'Erro ao limpar dados',
        description: 'Não foi possível limpar a base de Inadimplência.',
        variant: 'destructive',
      })
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Context Card */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#12365A]/5 text-[#12365A]">
              <Database className="w-5 h-5 text-[#0E9F8A]" />
            </span>
            <h2 className="text-base font-bold text-[#12365A] tracking-tight">
              Banco Analítico de Inadimplência (Móvel & Residencial)
            </h2>
            <Badge
              variant="outline"
              className="bg-[#0E9F8A]/10 text-[#0E9F8A] border-[#0E9F8A]/30 text-[11px] font-semibold"
            >
              Linha a Linha
            </Badge>
          </div>
          <p className="text-xs text-[#5B6B82] max-w-3xl leading-relaxed">
            Armazenamento analítico detalhado das planilhas de Móvel e Residencial com layout
            flexível (JSON). Permite consultar e auditar cada linha individual e seus atributos de
            origem.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5B6B82] block">
              Total de Linhas
            </span>
            <span className="text-lg font-bold text-[#12365A] tabular-nums">
              {totalItems.toLocaleString('pt-BR')}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadRows()}
            disabled={loading}
            className="h-9 text-xs text-[#12365A] border-[#E3E9F2] hover:bg-slate-50 gap-1.5"
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-[#0E9F8A]', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          {totalItems > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="h-9 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Linhas</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 sm:p-5 border-b border-[#E3E9F2] bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por loja ou arquivo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A97AC] hover:text-[#12233A]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Select Aba Filter */}
            <div className="w-full sm:w-44">
              <Select
                value={selectedAba}
                onValueChange={(val) => {
                  setSelectedAba(val as RelacionamentoAba | 'TODAS')
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]">
                  <div className="flex items-center gap-2 truncate">
                    <Filter className="w-3.5 h-3.5 text-[#8A97AC] shrink-0" />
                    <span>
                      Aba:{' '}
                      <strong>{selectedAba === 'TODAS' ? 'Todas as Abas' : selectedAba}</strong>
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="TODAS" className="text-xs">
                    Todas as Abas
                  </SelectItem>
                  <SelectItem value="Móvel" className="text-xs font-medium text-[#12365A]">
                    Móvel
                  </SelectItem>
                  <SelectItem value="Residencial" className="text-xs font-medium text-[#0E9F8A]">
                    Residencial
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Select Loja Filter */}
            {availableLojas.length > 0 && (
              <div className="w-full sm:w-48">
                <Select
                  value={selectedLoja}
                  onValueChange={(val) => {
                    setSelectedLoja(val)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]">
                    <div className="flex items-center gap-2 truncate">
                      <Store className="w-3.5 h-3.5 text-[#8A97AC] shrink-0" />
                      <span className="truncate">
                        Loja: <strong>{selectedLoja === 'TODAS' ? 'Todas' : selectedLoja}</strong>
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-white max-h-56">
                    <SelectItem value="TODAS" className="text-xs">
                      Todas as Lojas
                    </SelectItem>
                    {availableLojas.map((l) => (
                      <SelectItem key={l} value={l} className="text-xs uppercase">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 text-xs text-[#5B6B82] hover:text-[#12233A] gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar filtros</span>
              </Button>
            )}
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[#5B6B82]">Exibir:</span>
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="h-8 text-xs rounded-md border border-[#E3E9F2] bg-white px-2 text-[#12365A] focus:outline-none focus:border-[#0E9F8A]"
            >
              <option value={10}>10 linhas</option>
              <option value={25}>25 linhas</option>
              <option value={50}>50 linhas</option>
              <option value={100}>100 linhas</option>
            </select>
          </div>
        </div>

        {/* Analytical Table */}
        <div className="relative overflow-x-auto max-h-[65vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Table Head */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                <th className="px-3.5 py-3.5 w-12 text-center border-r border-[#1e456f]">#</th>
                <th className="px-3.5 py-3.5 min-w-[130px] border-r border-[#1e456f]">Aba</th>
                <th className="px-3.5 py-3.5 min-w-[180px] border-r border-[#1e456f]">Loja</th>
                <th className="px-3.5 py-3.5 min-w-[200px] border-r border-[#1e456f]">
                  Arquivo de Origem
                </th>
                <th className="px-3 py-3.5 w-24 text-center border-r border-[#1e456f]">Linha</th>
                <th className="px-3.5 py-3.5 min-w-[320px] border-r border-[#1e456f]">
                  Dados (Campos Flexíveis)
                </th>
                <th className="px-3 py-3.5 w-24 text-center">Ações</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-7 h-7 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs sm:text-sm">
                        Carregando linhas analíticas de Inadimplência...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-[#8A97AC]">
                        <Database className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-[#12365A] text-sm">
                          Nenhuma linha analítica cadastrada ainda.
                        </p>
                        <p className="text-xs text-[#5B6B82]">
                          {hasActiveFilters
                            ? 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar os filtros ou a busca.'
                            : 'O modelo de dados de Inadimplência está pronto para receber as linhas analíticas das planilhas Móvel e Residencial.'}
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearFilters}
                          className="text-xs mt-1"
                        >
                          Limpar Filtros
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isExpanded = !!expandedRowIds[row.id]
                  const dadosKeys = Object.keys(row.dados || {})
                  const isMovel = row.aba === 'Móvel'

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={cn(
                          'hover:bg-[#F0F5FC] transition-colors group',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          isExpanded && 'bg-[#F0F5FC]/70',
                        )}
                      >
                        {/* Index */}
                        <td className="px-3.5 py-3 text-center text-xs text-slate-400 font-mono border-r border-[#E3E9F2]">
                          {(page - 1) * perPage + idx + 1}
                        </td>

                        {/* Aba */}
                        <td className="px-3.5 py-3 border-r border-[#E3E9F2]">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px] font-bold px-2 py-0.5',
                              isMovel
                                ? 'bg-[#12365A]/10 text-[#12365A] border-[#12365A]/30'
                                : 'bg-[#0E9F8A]/10 text-[#0E9F8A] border-[#0E9F8A]/30',
                            )}
                          >
                            {row.aba}
                          </Badge>
                        </td>

                        {/* Loja */}
                        <td className="px-3.5 py-3 font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                          {row.loja ? (
                            <span className="uppercase tracking-wide text-xs">{row.loja}</span>
                          ) : (
                            <span className="text-slate-300 italic text-xs">Não informada</span>
                          )}
                        </td>

                        {/* Arquivo de Origem */}
                        <td className="px-3.5 py-3 text-xs text-[#5B6B82] border-r border-[#E3E9F2]">
                          {row.arquivo ? (
                            <div
                              className="flex items-center gap-1.5 max-w-[280px]"
                              title={row.arquivo}
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-[#0E9F8A] shrink-0" />
                              <span className="truncate font-mono">{row.arquivo}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>

                        {/* Linha */}
                        <td className="px-3 py-3 text-center text-xs font-mono font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                          {row.linha !== undefined && row.linha !== null ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              #{row.linha}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Dados Preview & Toggle */}
                        <td className="px-3.5 py-3 border-r border-[#E3E9F2]">
                          {dadosKeys.length === 0 ? (
                            <span className="text-xs text-slate-300 italic">
                              Nenhum campo registrado
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              {/* Preview chips of first 3 keys */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {dadosKeys.slice(0, 3).map((key) => {
                                  const val = String(row.dados?.[key] ?? '')
                                  return (
                                    <span
                                      key={key}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[#12365A] text-[11px] border border-slate-200 max-w-[180px]"
                                      title={`${key}: ${val}`}
                                    >
                                      <strong className="text-[#5B6B82] font-mono text-[10px] uppercase truncate max-w-[80px]">
                                        {key}:
                                      </strong>
                                      <span className="truncate font-medium">{val || '—'}</span>
                                    </span>
                                  )
                                })}

                                {dadosKeys.length > 3 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 h-5 bg-slate-200 text-slate-700"
                                  >
                                    +{dadosKeys.length - 3} campos
                                  </Badge>
                                )}
                              </div>

                              {/* Toggle expand button */}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(row.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E9F8A] hover:text-[#0c8a77] hover:underline"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-3.5 h-3.5" />
                                      <span>Recolher campos</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                      <span>Ver todos os {dadosKeys.length} campos</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailRow(row)}
                              className="h-7 w-7 p-0 text-[#5B6B82] hover:text-[#0E9F8A] hover:bg-[#0E9F8A]/10"
                              title="Visualizar JSON completo"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRowToDelete(row)}
                              className="h-7 w-7 p-0 text-[#8A97AC] hover:text-red-600 hover:bg-red-50"
                              title="Excluir esta linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable JSON Detail View row */}
                      {isExpanded && (
                        <tr className="bg-[#F8FAFC] border-b border-[#E3E9F2]">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="bg-white rounded-lg border border-[#E3E9F2] p-4 space-y-3 shadow-inner">
                              <div className="flex items-center justify-between border-b pb-2">
                                <div className="flex items-center gap-2">
                                  <Code2 className="w-4 h-4 text-[#0E9F8A]" />
                                  <span className="text-xs font-bold text-[#12365A] uppercase tracking-wider">
                                    Mapa de Colunas e Valores (Layout Flexível)
                                  </span>
                                </div>
                                <span className="text-[11px] text-[#5B6B82]">
                                  {dadosKeys.length} colunas registradas
                                </span>
                              </div>

                              {/* Key-value grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                                {dadosKeys.map((k) => {
                                  const v = row.dados?.[k]
                                  return (
                                    <div
                                      key={k}
                                      className="p-2.5 rounded-md bg-[#F8FAFC] border border-[#E3E9F2] text-xs space-y-0.5 hover:border-[#0E9F8A]/50 transition-colors"
                                    >
                                      <span
                                        className="text-[10px] uppercase font-bold text-[#5B6B82] block truncate"
                                        title={k}
                                      >
                                        {k}
                                      </span>
                                      <span
                                        className="font-semibold text-[#12365A] block truncate font-mono text-xs"
                                        title={String(v ?? '')}
                                      >
                                        {v !== null && v !== undefined && v !== '' ? (
                                          String(v)
                                        ) : (
                                          <span className="text-slate-300 italic font-sans font-normal">
                                            —
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#E3E9F2] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5B6B82]">
            <div>
              Mostrando <strong>{(page - 1) * perPage + 1}</strong> a{' '}
              <strong>{Math.min(page * perPage, totalItems)}</strong> de{' '}
              <strong>{totalItems.toLocaleString('pt-BR')}</strong> linhas analíticas
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
                className="h-8 px-2.5 text-xs text-[#12365A]"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                <span>Anterior</span>
              </Button>

              <div className="px-2 text-xs font-semibold text-[#12365A]">
                Página {page} de {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || loading}
                className="h-8 px-2.5 text-xs text-[#12365A]"
              >
                <span>Próxima</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail JSON Dialog */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="sm:max-w-2xl bg-white max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#0E9F8A]" />
              <span>Registro Analítico #{detailRow?.linha || detailRow?.id}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Detalhes completos e estrutura de dados JSON da linha analítica.
            </DialogDescription>
          </DialogHeader>

          {detailRow && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Metadata strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg border border-[#E3E9F2] text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">Aba</span>
                  <span className="font-semibold text-[#12365A]">{detailRow.aba}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">Loja</span>
                  <span className="font-semibold text-[#12365A] uppercase">
                    {detailRow.loja || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                    Linha Orig.
                  </span>
                  <span className="font-semibold text-[#12365A] font-mono">
                    #{detailRow.linha ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                    Criado em
                  </span>
                  <span className="font-semibold text-[#12365A]">
                    {detailRow.created ? new Date(detailRow.created).toLocaleString('pt-BR') : '—'}
                  </span>
                </div>
              </div>

              {/* Arquivo info */}
              {detailRow.arquivo && (
                <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E3E9F2] text-xs flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0E9F8A]" />
                  <span className="text-[#5B6B82]">Arquivo:</span>
                  <span className="font-semibold font-mono text-[#12365A]">
                    {detailRow.arquivo}
                  </span>
                </div>
              )}

              {/* JSON code block */}
              <div>
                <span className="text-xs font-bold text-[#12365A] block mb-1">
                  Conteúdo do Campo 'dados' (JSON):
                </span>
                <pre className="p-3.5 rounded-lg bg-[#0E2A47] text-slate-100 text-xs font-mono overflow-x-auto max-h-72 shadow-inner">
                  {JSON.stringify(detailRow.dados || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDetailRow(null)} className="text-xs">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Excluir Linha Analítica?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Esta ação removerá permanentemente esta linha da base analítica de Inadimplência.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setRowToDelete(null)} className="text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => rowToDelete && handleDeleteRow(rowToDelete.id)}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              Sim, excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Confirmation Dialog */}
      <Dialog
        open={clearDialogOpen}
        onOpenChange={(open) => !isClearing && setClearDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Limpar todas as linhas de Inadimplência?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82] leading-relaxed">
              Tem certeza que deseja apagar todas as {totalItems.toLocaleString('pt-BR')} linhas
              analíticas da base de Inadimplência? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={isClearing}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={isClearing}
              className="text-xs bg-red-600 hover:bg-red-700 gap-1.5"
            >
              {isClearing && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{isClearing ? 'Limpando...' : 'Sim, limpar tudo'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Relacionamento
