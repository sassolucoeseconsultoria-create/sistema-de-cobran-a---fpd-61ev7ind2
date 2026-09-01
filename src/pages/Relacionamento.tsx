import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  UploadCloud,
  FileUp,
  Smartphone,
  Home,
  Check,
  User,
  Phone,
  FileText,
  Calendar,
  DollarSign,
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
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import {
  fetchAnalyticalRows,
  fetchDistinctAnalyticalLojas,
  deleteAnalyticalRow,
  clearAllAnalyticalRows,
  insertMovelBatch,
  insertResidencialBatch,
} from '@/services/relacionamentoService'
import { parseAnalyticalXlsxFile, ParsedAnalyticalFileData } from '@/lib/analyticalImportParser'
import type {
  RelacionamentoAba,
  UnifiedAnalyticRecord,
  MovelRecord,
  ResidencialRecord,
} from '@/types/fpd'
import { cn } from '@/lib/utils'

export const Relacionamento: React.FC = () => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Data state
  const [rows, setRows] = useState<UnifiedAnalyticRecord[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalMovel, setTotalMovel] = useState(0)
  const [totalResidencial, setTotalResidencial] = useState(0)
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

  // Modal dialog for detailed JSON / typed attributes view
  const [detailRow, setDetailRow] = useState<UnifiedAnalyticRecord | null>(null)

  // Delete single / clear all dialogs
  const [rowToDelete, setRowToDelete] = useState<UnifiedAnalyticRecord | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Import Dialog State
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [parsedFilesData, setParsedFilesData] = useState<ParsedAnalyticalFileData[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatusMessage, setImportStatusMessage] = useState('')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== search) {
          setPage(1)
        }
        return search
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  // Load distinct store names
  const loadLojas = useCallback(async () => {
    try {
      const lojas = await fetchDistinctAnalyticalLojas()
      setAvailableLojas(lojas)
    } catch {
      // ignore
    }
  }, [])

  // Ref to track last request parameters and ignore stale responses
  const activeRequestIdRef = useRef(0)

  // Load rows from backend
  const loadRows = useCallback(
    async (showLoadingSpinner = true) => {
      const currentRequestId = ++activeRequestIdRef.current
      if (showLoadingSpinner) {
        setLoading(true)
      }
      try {
        const res = await fetchAnalyticalRows({
          page,
          perPage,
          search: debouncedSearch,
          aba: selectedAba,
          loja: selectedLoja,
          sort: '-created',
        })
        // Only update state if this is still the latest request
        if (currentRequestId === activeRequestIdRef.current) {
          setRows(res.items)
          setTotalItems(res.totalItems)
          setTotalPages(res.totalPages)
          setTotalMovel(res.totalMovel)
          setTotalResidencial(res.totalResidencial)
        }
      } catch (err) {
        if (currentRequestId === activeRequestIdRef.current) {
          console.error(err)
          toast({
            title: 'Erro ao carregar dados',
            description: 'Não foi possível carregar as linhas analíticas de Inadimplência.',
            variant: 'destructive',
          })
        }
      } finally {
        if (currentRequestId === activeRequestIdRef.current) {
          setLoading(false)
        }
      }
    },
    // Note: toast is omitted from deps to guarantee stable callback identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, perPage, debouncedSearch, selectedAba, selectedLoja],
  )

  // Initial load for lojas - once on mount
  useEffect(() => {
    loadLojas()
  }, [loadLojas])

  // Load rows when pagination or filter params change
  useEffect(() => {
    loadRows(true)
  }, [loadRows])

  // Real-time subscription to 'movel' and 'residencial':
  // Perform local state updates for immediate feedback and avoid full refetch loops
  useRealtime<MovelRecord>('movel', (e) => {
    if (e.action === 'create') {
      const newUnified: UnifiedAnalyticRecord = {
        ...e.record,
        aba: 'Móvel',
        rawRecord: e.record,
      }
      setRows((prev) => {
        // If current filter excludes 'Móvel', don't prepend
        if (selectedAba === 'Residencial') return prev
        if (selectedLoja !== 'TODAS' && e.record.loja && e.record.loja !== selectedLoja) return prev
        if (prev.some((r) => r.id === e.record.id && r.aba === 'Móvel')) return prev
        return [newUnified, ...prev].slice(0, perPage)
      })
      setTotalMovel((prev) => prev + 1)
      setTotalItems((prev) => prev + 1)
      if (e.record.loja && !availableLojas.includes(e.record.loja)) {
        setAvailableLojas((prev) => [...prev, e.record.loja].sort((a, b) => a.localeCompare(b)))
      }
    } else if (e.action === 'update') {
      setRows((prev) =>
        prev.map((r) =>
          r.id === e.record.id && r.aba === 'Móvel'
            ? { ...e.record, aba: 'Móvel', rawRecord: e.record }
            : r,
        ),
      )
    } else if (e.action === 'delete') {
      setRows((prev) => prev.filter((r) => !(r.id === e.record.id && r.aba === 'Móvel')))
      setTotalMovel((prev) => Math.max(0, prev - 1))
      setTotalItems((prev) => Math.max(0, prev - 1))
    }
  })

  useRealtime<ResidencialRecord>('residencial', (e) => {
    if (e.action === 'create') {
      const newUnified: UnifiedAnalyticRecord = {
        ...e.record,
        aba: 'Residencial',
        rawRecord: e.record,
      }
      setRows((prev) => {
        // If current filter excludes 'Residencial', don't prepend
        if (selectedAba === 'Móvel') return prev
        if (selectedLoja !== 'TODAS' && e.record.loja && e.record.loja !== selectedLoja) return prev
        if (prev.some((r) => r.id === e.record.id && r.aba === 'Residencial')) return prev
        return [newUnified, ...prev].slice(0, perPage)
      })
      setTotalResidencial((prev) => prev + 1)
      setTotalItems((prev) => prev + 1)
      if (e.record.loja && !availableLojas.includes(e.record.loja)) {
        setAvailableLojas((prev) => [...prev, e.record.loja].sort((a, b) => a.localeCompare(b)))
      }
    } else if (e.action === 'update') {
      setRows((prev) =>
        prev.map((r) =>
          r.id === e.record.id && r.aba === 'Residencial'
            ? { ...e.record, aba: 'Residencial', rawRecord: e.record }
            : r,
        ),
      )
    } else if (e.action === 'delete') {
      setRows((prev) => prev.filter((r) => !(r.id === e.record.id && r.aba === 'Residencial')))
      setTotalResidencial((prev) => Math.max(0, prev - 1))
      setTotalItems((prev) => Math.max(0, prev - 1))
    }
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
  const handleDeleteRow = async (item: UnifiedAnalyticRecord) => {
    try {
      await deleteAnalyticalRow(item.id, item.aba)
      toast({
        title: 'Linha excluída',
        description: `Linha analítica da tabela ${item.aba} removida com sucesso.`,
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
      const target = selectedAba === 'TODAS' ? undefined : selectedAba
      const counts = await clearAllAnalyticalRows(target)
      toast({
        title: 'Tabelas analíticas limpas',
        description: `${counts.movelCount} linha(s) de Móvel e ${counts.residencialCount} linha(s) de Residencial foram removidas.`,
      })
      setClearDialogOpen(false)
      loadRows()
      loadLojas()
    } catch {
      toast({
        title: 'Erro ao limpar dados',
        description: 'Não foi possível limpar as tabelas analíticas.',
        variant: 'destructive',
      })
    } finally {
      setIsClearing(false)
    }
  }

  // Handle files selection for import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        validFiles.push(file)
      }
    }

    if (validFiles.length === 0) {
      toast({
        title: 'Formato não suportado',
        description: 'Por favor, selecione arquivos de planilha no formato Excel (.xlsx).',
        variant: 'destructive',
      })
      return
    }

    setSelectedFiles(validFiles)
    setImportDialogOpen(true)
    setIsProcessingFiles(true)
    setParsedFilesData([])

    try {
      const parsedResults: ParsedAnalyticalFileData[] = []
      for (const file of validFiles) {
        const parsed = await parseAnalyticalXlsxFile(file)
        parsedResults.push(parsed)
      }
      setParsedFilesData(parsedResults)
    } catch (err: unknown) {
      const error = err as Error
      toast({
        title: 'Erro na leitura do arquivo',
        description: error?.message || 'Falha ao processar as abas do arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessingFiles(false)
      // Reset input value to allow selecting same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Execute import to Móvel and Residencial collections
  const handleConfirmImport = async () => {
    if (parsedFilesData.length === 0) return

    setIsImporting(true)
    setImportProgress(0)

    let totalMovelToInsert = 0
    let totalResidencialToInsert = 0
    parsedFilesData.forEach((pf) => {
      totalMovelToInsert += pf.totalMovelRows
      totalResidencialToInsert += pf.totalResidencialRows
    })

    const totalLinesAll = totalMovelToInsert + totalResidencialToInsert
    if (totalLinesAll === 0) {
      toast({
        title: 'Nenhum dado encontrado',
        description:
          'Não foram encontradas linhas de dados nas abas Móvel e Residencial dos arquivos selecionados.',
        variant: 'destructive',
      })
      setIsImporting(false)
      return
    }

    let insertedGlobalCount = 0

    try {
      for (let i = 0; i < parsedFilesData.length; i++) {
        const pf = parsedFilesData[i]
        setImportStatusMessage(
          `Importando arquivo ${i + 1} de ${parsedFilesData.length}: ${pf.fileName}...`,
        )

        // 1. Insert Móvel rows
        if (pf.movelSheet && pf.movelSheet.rows.length > 0) {
          setImportStatusMessage(
            `Gravando ${pf.movelSheet.rows.length} linhas na tabela MÓVEL (${pf.fileName})...`,
          )
          const movelBatchData = pf.movelSheet.rows.map((r) => ({
            arquivo: pf.fileName,
            linha: r.linha,
            loja: r.loja,
            vendedor: r.vendedor,
            cliente: r.cliente,
            dados: r.dados,
          }))

          await insertMovelBatch(movelBatchData, (insertedInBatch) => {
            const currentDone = insertedGlobalCount + insertedInBatch
            setImportProgress(Math.min(95, Math.round((currentDone / totalLinesAll) * 100)))
          })
          insertedGlobalCount += pf.movelSheet.rows.length
        }

        // 2. Insert Residencial rows
        if (pf.residencialSheet && pf.residencialSheet.rows.length > 0) {
          setImportStatusMessage(
            `Gravando ${pf.residencialSheet.rows.length} linhas na tabela RESIDENCIAL (${pf.fileName})...`,
          )
          const resBatchData = pf.residencialSheet.rows.map((r) => ({
            arquivo: pf.fileName,
            linha: r.linha,
            loja: r.loja,
            vendedor: r.vendedor,
            cliente: r.cliente,
            dados: r.dados,
            typedFields: r.typedFields,
          }))

          await insertResidencialBatch(resBatchData, (insertedInBatch) => {
            const currentDone = insertedGlobalCount + insertedInBatch
            setImportProgress(Math.min(95, Math.round((currentDone / totalLinesAll) * 100)))
          })
          insertedGlobalCount += pf.residencialSheet.rows.length
        }
      }

      setImportProgress(100)
      setImportStatusMessage('Importação analítica concluída com sucesso!')

      toast({
        title: 'Importação realizada com sucesso!',
        description: `${totalMovelToInsert} linhas gravadas em MÓVEL e ${totalResidencialToInsert} linhas gravadas em RESIDENCIAL.`,
      })

      // Reset and refresh
      setTimeout(() => {
        setImportDialogOpen(false)
        setSelectedFiles([])
        setParsedFilesData([])
        setIsImporting(false)
        loadRows()
        loadLojas()
      }, 600)
    } catch (err: unknown) {
      const error = err as Error
      console.error('Erro na importação:', err)
      toast({
        title: 'Erro durante a importação',
        description: error?.message || 'Ocorreu uma falha ao salvar as linhas no banco de dados.',
        variant: 'destructive',
      })
      setIsImporting(false)
    }
  }

  // Summary counts of parsed files
  const importSummary = useMemo(() => {
    let movelCount = 0
    let residencialCount = 0
    parsedFilesData.forEach((p) => {
      movelCount += p.totalMovelRows
      residencialCount += p.totalResidencialRows
    })
    return {
      movelCount,
      residencialCount,
      total: movelCount + residencialCount,
    }
  }, [parsedFilesData])

  return (
    <div className="space-y-6">
      {/* Hidden File Input for .xlsx import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".xlsx,.xls"
        multiple
        className="hidden"
      />

      {/* Top Banner Context Card */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#12365A]/5 text-[#12365A]">
              <Database className="w-5 h-5 text-[#0E9F8A]" />
            </span>
            <h2 className="text-base font-bold text-[#12365A] tracking-tight">
              Banco Analítico de Inadimplência
            </h2>
            <Badge
              variant="outline"
              className="bg-[#12365A]/10 text-[#12365A] border-[#12365A]/25 text-[11px] font-semibold gap-1"
            >
              <Smartphone className="w-3 h-3" /> Tabela MÓVEL
            </Badge>
            <Badge
              variant="outline"
              className="bg-[#0E9F8A]/10 text-[#0E9F8A] border-[#0E9F8A]/30 text-[11px] font-semibold gap-1"
            >
              <Home className="w-3 h-3" /> Tabela RESIDENCIAL
            </Badge>
          </div>
          <p className="text-xs text-[#5B6B82] max-w-3xl leading-relaxed">
            Armazenamento analítico separado para as tabelas <strong>Móvel</strong> e{' '}
            <strong>Residencial</strong>. Importe planilhas .xlsx com extração dinâmica de
            cabeçalhos e visualização linha a linha com layout flexível.
          </p>
        </div>

        {/* Action Controls & Totals */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Quick Counter Badges */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] text-right">
              <span className="text-[9px] uppercase font-bold tracking-wider text-[#5B6B82] block">
                Total Geral
              </span>
              <span className="text-base font-bold text-[#12365A] tabular-nums">
                {totalItems.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          {/* Import Button */}
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="h-9 px-3.5 text-xs font-semibold bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-xs gap-1.5 transition-all"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Importar Planilha</span>
          </Button>

          {/* Refresh Button */}
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

          {/* Clear Button */}
          {totalItems > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="h-9 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar Base</span>
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
                placeholder="Buscar por loja, vendedor, cliente ou arquivo..."
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

            {/* Select Aba / Origem Filter (Tabela Móvel / Residencial) */}
            <div className="w-full sm:w-52">
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
                      Tabela:{' '}
                      <strong>
                        {selectedAba === 'TODAS'
                          ? 'Todas (Móvel + Res.)'
                          : selectedAba === 'Móvel'
                            ? 'Móvel'
                            : 'Residencial'}
                      </strong>
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="TODAS" className="text-xs">
                    Todas as Tabelas
                  </SelectItem>
                  <SelectItem value="Móvel" className="text-xs font-semibold text-[#12365A]">
                    Tabela Móvel
                  </SelectItem>
                  <SelectItem value="Residencial" className="text-xs font-semibold text-[#0E9F8A]">
                    Tabela Residencial
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
                <th className="px-3 py-3.5 w-12 text-center border-r border-[#1e456f]">#</th>
                <th className="px-3.5 py-3.5 min-w-[120px] border-r border-[#1e456f]">Tabela</th>
                <th className="px-3.5 py-3.5 min-w-[160px] border-r border-[#1e456f]">Loja</th>
                <th className="px-3.5 py-3.5 min-w-[160px] border-r border-[#1e456f]">Vendedor</th>
                <th className="px-3.5 py-3.5 min-w-[180px] border-r border-[#1e456f]">Cliente</th>
                <th className="px-3.5 py-3.5 min-w-[190px] border-r border-[#1e456f]">
                  Arquivo de Origem
                </th>
                <th className="px-3 py-3.5 w-20 text-center border-r border-[#1e456f]">Linha</th>
                <th className="px-3.5 py-3.5 min-w-[300px] border-r border-[#1e456f]">
                  Campos Extraídos (JSON)
                </th>
                <th className="px-3 py-3.5 w-24 text-center">Ações</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-[#5B6B82]">
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
                  <td colSpan={9} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-[#8A97AC]">
                        <Database className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-[#12365A] text-sm">
                          Nenhuma linha analítica cadastrada ainda.
                        </p>
                        <p className="text-xs text-[#5B6B82] leading-relaxed">
                          {hasActiveFilters
                            ? 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar os filtros ou a busca.'
                            : 'Clique em "Importar Planilha" acima para carregar o arquivo Excel com as abas Móvel e Residencial.'}
                        </p>
                      </div>
                      {hasActiveFilters ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearFilters}
                          className="text-xs mt-1"
                        >
                          Limpar Filtros
                        </Button>
                      ) : (
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          size="sm"
                          className="text-xs mt-1 bg-[#0E9F8A] hover:bg-[#0c8a77] text-white gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Importar Planilha Agora</span>
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
                        <td className="px-3 py-3 text-center text-xs text-slate-400 font-mono border-r border-[#E3E9F2]">
                          {(page - 1) * perPage + idx + 1}
                        </td>

                        {/* Tabela / Aba */}
                        <td className="px-3.5 py-3 border-r border-[#E3E9F2]">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px] font-bold px-2 py-0.5 gap-1',
                              isMovel
                                ? 'bg-[#12365A]/10 text-[#12365A] border-[#12365A]/30'
                                : 'bg-[#0E9F8A]/10 text-[#0E9F8A] border-[#0E9F8A]/30',
                            )}
                          >
                            {isMovel ? (
                              <Smartphone className="w-3 h-3" />
                            ) : (
                              <Home className="w-3 h-3" />
                            )}
                            {row.aba}
                          </Badge>
                        </td>

                        {/* Loja */}
                        <td className="px-3.5 py-3 font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                          {row.loja ? (
                            <span className="uppercase tracking-wide text-xs">{row.loja}</span>
                          ) : (
                            <span className="text-slate-300 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Vendedor */}
                        <td className="px-3.5 py-3 text-xs text-[#12365A] border-r border-[#E3E9F2]">
                          {row.vendedor ? (
                            <span className="font-medium">{row.vendedor}</span>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>

                        {/* Cliente */}
                        <td className="px-3.5 py-3 text-xs text-[#12365A] border-r border-[#E3E9F2]">
                          {row.cliente ? (
                            <span className="font-medium line-clamp-1" title={row.cliente}>
                              {row.cliente}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>

                        {/* Arquivo de Origem */}
                        <td className="px-3.5 py-3 text-xs text-[#5B6B82] border-r border-[#E3E9F2]">
                          {row.arquivo ? (
                            <div
                              className="flex items-center gap-1.5 max-w-[240px]"
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
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
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
                                    +{dadosKeys.length - 3} colunas
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
                                      <span>Recolher colunas</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                      <span>Ver todas as {dadosKeys.length} colunas</span>
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
                              title="Visualizar detalhes da linha"
                            >
                              <Eye className="w-3.5 h-3.5" />
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
                          <td colSpan={9} className="px-6 py-4">
                            <div className="bg-white rounded-lg border border-[#E3E9F2] p-4 space-y-3 shadow-inner">
                              <div className="flex items-center justify-between border-b pb-2">
                                <div className="flex items-center gap-2">
                                  <Code2 className="w-4 h-4 text-[#0E9F8A]" />
                                  <span className="text-xs font-bold text-[#12365A] uppercase tracking-wider">
                                    Todas as Colunas Extraídas da Linha #{row.linha || row.id}{' '}
                                    (Tabela {row.aba})
                                  </span>
                                </div>
                                <span className="text-[11px] text-[#5B6B82]">
                                  {dadosKeys.length} colunas capturadas dinamicamente
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

      {/* Import Modal Dialog */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!isImporting) {
            setImportDialogOpen(open)
            if (!open) {
              setSelectedFiles([])
              setParsedFilesData([])
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-white max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A] flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#0E9F8A]" />
              <span>Importação Analítica de Inadimplência</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Os dados serão gravados de forma separada nas tabelas <strong>Móvel</strong> e{' '}
              <strong>Residencial</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1 py-2">
            {isProcessingFiles ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-[#5B6B82]">Lendo estrutura e colunas das planilhas...</p>
              </div>
            ) : parsedFilesData.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum arquivo válido processado.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Banner */}
                <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-[#E3E9F2] rounded-xl text-center">
                  <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                      Total de Linhas
                    </span>
                    <span className="text-lg font-bold text-[#12365A]">
                      {importSummary.total.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-[#12365A] block flex items-center justify-center gap-1">
                      <Smartphone className="w-3 h-3" /> Aba Móvel
                    </span>
                    <span className="text-lg font-bold text-[#12365A]">
                      {importSummary.movelCount.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-[#0E9F8A] block flex items-center justify-center gap-1">
                      <Home className="w-3 h-3" /> Aba Residencial
                    </span>
                    <span className="text-lg font-bold text-[#0E9F8A]">
                      {importSummary.residencialCount.toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Per-file breakdown */}
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-[#12365A] uppercase tracking-wider block">
                    Arquivos Selecionados ({parsedFilesData.length})
                  </span>
                  {parsedFilesData.map((fileData, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-[#E3E9F2] rounded-lg shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-[#0E9F8A] shrink-0" />
                          <span className="font-semibold text-xs text-[#12365A] font-mono">
                            {fileData.fileName}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-slate-50">
                          {fileData.totalMovelRows + fileData.totalResidencialRows} linhas
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded">
                          <span className="text-[#5B6B82] flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-[#12365A]" /> Móvel:
                          </span>
                          <span className="font-bold text-[#12365A]">
                            {fileData.totalMovelRows} linhas
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded">
                          <span className="text-[#5B6B82] flex items-center gap-1">
                            <Home className="w-3 h-3 text-[#0E9F8A]" /> Residencial:
                          </span>
                          <span className="font-bold text-[#0E9F8A]">
                            {fileData.totalResidencialRows} linhas
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress bar when importing */}
                {isImporting && (
                  <div className="space-y-2 p-3 bg-[#F0F5FC] rounded-lg border border-[#0E9F8A]/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#12365A] flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-[#0E9F8A] animate-spin" />
                        {importStatusMessage || 'Processando gravação no banco de dados...'}
                      </span>
                      <span className="font-bold text-[#0E9F8A]">{importProgress}%</span>
                    </div>
                    <Progress value={importProgress} className="h-2 bg-slate-200" />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-3">
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={isImporting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={isImporting || isProcessingFiles || importSummary.total === 0}
              className="text-xs bg-[#0E9F8A] hover:bg-[#0c8a77] text-white gap-1.5"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    Confirmar e Importar {importSummary.total.toLocaleString('pt-BR')} Linhas
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail JSON / Attributes Dialog */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="sm:max-w-2xl bg-white max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#0E9F8A]" />
              <span>
                Registro #{detailRow?.linha || detailRow?.id} — Tabela {detailRow?.aba}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Detalhes cadastrais e todas as colunas capturadas na importação.
            </DialogDescription>
          </DialogHeader>

          {detailRow && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Metadata strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg border border-[#E3E9F2] text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                    Tabela
                  </span>
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
                    Vendedor
                  </span>
                  <span className="font-semibold text-[#12365A]">{detailRow.vendedor || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                    Linha Orig.
                  </span>
                  <span className="font-semibold text-[#12365A] font-mono">
                    #{detailRow.linha ?? '—'}
                  </span>
                </div>
              </div>

              {/* Cliente & Arquivo info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {detailRow.cliente && (
                  <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E3E9F2] flex items-center gap-2">
                    <User className="w-4 h-4 text-[#0E9F8A] shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                        Cliente
                      </span>
                      <span className="font-semibold text-[#12365A]">{detailRow.cliente}</span>
                    </div>
                  </div>
                )}
                {detailRow.arquivo && (
                  <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E3E9F2] flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#0E9F8A] shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] uppercase font-bold text-[#5B6B82] block">
                        Arquivo
                      </span>
                      <span className="font-semibold font-mono text-[#12365A] truncate block">
                        {detailRow.arquivo}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* JSON code block */}
              <div>
                <span className="text-xs font-bold text-[#12365A] block mb-1">
                  Conteúdo do Campo 'dados' (Mapa Coluna → Valor):
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
              Esta ação removerá permanentemente esta linha da tabela{' '}
              <strong>{rowToDelete?.aba}</strong> de Inadimplência.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setRowToDelete(null)} className="text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => rowToDelete && handleDeleteRow(rowToDelete)}
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
              Limpar tabelas de Inadimplência?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82] leading-relaxed">
              Tem certeza que deseja apagar todas as {totalItems.toLocaleString('pt-BR')} linhas das
              tabelas <strong>Móvel</strong> e <strong>Residencial</strong>? Esta ação não pode ser
              desfeita.
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
