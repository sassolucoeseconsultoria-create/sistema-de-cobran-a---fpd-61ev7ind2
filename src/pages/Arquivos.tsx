import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Download,
  Filter,
  X,
  RotateCcw,
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  Building2,
  TrendingUp,
  BarChart3,
  Calendar,
  Trash2,
  Eye,
  Info,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import { useCountUp } from '@/hooks/useCountUp'
import {
  fetchStores,
  fetchFpdRecords,
  fetchFpdRecordsByStore,
  deleteFpdRecord,
  clearAllFpdRecords,
  clearAllVendorConsolidations,
  clearAllStores,
} from '@/services/fpdService'
import { exportConsolidatedToXlsx, exportConsolidatedComparisonToXlsx } from '@/lib/xlsxExport'
import {
  FPD_STATUSES,
  type StoreRecord,
  type FpdRecord,
  type ConsolidatedRow,
  type ConsolidatedComparisonRow,
  type FpdStatusKey,
} from '@/types/fpd'
import {
  buildConsolidatedRow,
  buildComparisonRows,
  computeComparisonSummary,
} from '@/lib/consolidatedComparison'
import { cn } from '@/lib/utils'
import { StoreAnalyticsDrawer } from '@/components/StoreAnalyticsDrawer'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
import { useAllowedReferenceDates } from '@/hooks/useAllowedReferenceDates'
import { isSessionExpiredError } from '@/lib/pocketbase/client'

export const Arquivos: React.FC = () => {
  const { toast } = useToast()
  const userAccess = useUserStoreAccess()
  const {
    allowedReferenceDates: availableReferenceDates,
    hasMultipleReferences,
    initialReferenceDate,
    isDateAllowed,
  } = useAllowedReferenceDates()
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [records, setRecords] = useState<FpdRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedReferenceDate, setSelectedReferenceDate] = useState<string>('all')
  const [comparisonReferenceDate, setComparisonReferenceDate] = useState<string>('')

  // Efeito para sincronizar a data selecionada:
  // - 0 permitidas -> fallback para 'none'
  // - 1 permitida -> auto-seleção dela (sem opção 'all')
  // - 2+ permitidas -> se a selecionada não for permitida nem 'none', cai para 'all'
  useEffect(() => {
    if (availableReferenceDates.length === 0) {
      if (selectedReferenceDate !== 'none') {
        setSelectedReferenceDate('none')
      }
    } else if (availableReferenceDates.length === 1) {
      const singleDate = availableReferenceDates[0]
      if (
        selectedReferenceDate === 'all' ||
        (selectedReferenceDate !== singleDate && selectedReferenceDate !== 'none')
      ) {
        setSelectedReferenceDate(singleDate)
      }
    } else if (availableReferenceDates.length >= 2) {
      if (
        selectedReferenceDate !== 'all' &&
        selectedReferenceDate !== 'none' &&
        !isDateAllowed(selectedReferenceDate)
      ) {
        setSelectedReferenceDate('all')
      }
    }

    if (comparisonReferenceDate && !isDateAllowed(comparisonReferenceDate)) {
      setComparisonReferenceDate('')
    }
  }, [selectedReferenceDate, comparisonReferenceDate, availableReferenceDates, isDateAllowed])
  const [selectedCoordenacoes, setSelectedCoordenacoes] = useState<string[]>([])
  const [selectedSupervisoes, setSelectedSupervisoes] = useState<string[]>([])

  // Analytics Drawer / details
  const [selectedRow, setSelectedRow] = useState<ConsolidatedRow | null>(null)
  const [storeHistory, setStoreHistory] = useState<FpdRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Delete record confirmation
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null)

  // Clear all data confirmation & loading
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [alsoClearStores, setAlsoClearStores] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  // Initial load
  const loadData = async () => {
    try {
      setLoading(true)
      const [fetchedStores, fetchedRecords] = await Promise.all([fetchStores(), fetchFpdRecords()])
      setStores(fetchedStores)
      setRecords(fetchedRecords)
    } catch (err: unknown) {
      if (isSessionExpiredError(err)) {
        return
      }
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível buscar as informações do painel de lojas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Real-time subscriptions
  useRealtime<StoreRecord>('stores', (e) => {
    if (e.action === 'create') {
      setStores((prev) => {
        if (prev.some((s) => s.id === e.record.id)) return prev
        return [...prev, e.record].sort((a, b) => a.name.localeCompare(b.name))
      })
    } else if (e.action === 'update') {
      setStores((prev) => prev.map((s) => (s.id === e.record.id ? e.record : s)))
      // If current selected in drawer, update it
      setSelectedRow((prev) =>
        prev && prev.storeId === e.record.id
          ? {
              ...prev,
              storeName: e.record.name,
              coordenacao: e.record.coordenacao || '',
              supervisao: e.record.supervisao || '',
            }
          : prev,
      )
    } else if (e.action === 'delete') {
      setStores((prev) => prev.filter((s) => s.id !== e.record.id))
      if (selectedRow?.storeId === e.record.id) {
        setDrawerOpen(false)
      }
    }
  })

  useRealtime<FpdRecord>('fpd_records', (e) => {
    if (e.action === 'create') {
      setRecords((prev) => [e.record, ...prev.filter((r) => r.id !== e.record.id)])
    } else if (e.action === 'update') {
      setRecords((prev) => prev.map((r) => (r.id === e.record.id ? e.record : r)))
    } else if (e.action === 'delete') {
      setRecords((prev) => prev.filter((r) => r.id !== e.record.id))
    }
  })

  // Filter stores accessible to user
  const accessibleStores = useMemo(() => {
    return userAccess.filterStores(stores)
  }, [stores, userAccess])

  // Is comparison currently active?
  const isComparisonActive = useMemo(() => {
    return Boolean(comparisonReferenceDate) && comparisonReferenceDate !== selectedReferenceDate
  }, [comparisonReferenceDate, selectedReferenceDate])

  // Map each store to its consolidated FPD row
  const consolidatedRows: ConsolidatedRow[] = useMemo(() => {
    return accessibleStores.map((store) => {
      return buildConsolidatedRow(store, records, selectedReferenceDate, isDateAllowed)
    })
  }, [accessibleStores, records, selectedReferenceDate, isDateAllowed])

  // Map each store to comparison rows when comparison is active
  const comparisonRows: ConsolidatedComparisonRow[] = useMemo(() => {
    if (!isComparisonActive) return []
    return buildComparisonRows(
      accessibleStores,
      records,
      selectedReferenceDate,
      comparisonReferenceDate,
      isDateAllowed,
    )
  }, [
    accessibleStores,
    records,
    selectedReferenceDate,
    comparisonReferenceDate,
    isComparisonActive,
    isDateAllowed,
  ])

  // Distinct filter options
  const uniqueCoordenacoes = useMemo(() => {
    const list = Array.from(
      new Set(accessibleStores.map((s) => s.coordenacao?.trim()).filter(Boolean)),
    ) as string[]
    return list.sort((a, b) => a.localeCompare(b))
  }, [accessibleStores])

  const uniqueSupervisoes = useMemo(() => {
    const list = Array.from(
      new Set(accessibleStores.map((s) => s.supervisao?.trim()).filter(Boolean)),
    ) as string[]
    return list.sort((a, b) => a.localeCompare(b))
  }, [accessibleStores])

  // Filtered rows (single reference): oculta lojas sem dados (hasData === false ou totalLinhas === 0)
  const filteredRows = useMemo(() => {
    return consolidatedRows.filter((row) => {
      // Ocultar linhas de lojas sem dados para a referência ativa (ou em nenhuma referência quando 'all')
      if (!row.hasData || row.totalLinhas === 0) return false

      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchName = row.storeName.toLowerCase().includes(q)
        const matchCoord = (row.coordenacao || '').toLowerCase().includes(q)
        const matchSuper = (row.supervisao || '').toLowerCase().includes(q)
        if (!matchName && !matchCoord && !matchSuper) return false
      }

      if (selectedCoordenacoes.length > 0) {
        if (!selectedCoordenacoes.includes(row.coordenacao)) return false
      }

      if (selectedSupervisoes.length > 0) {
        if (!selectedSupervisoes.includes(row.supervisao)) return false
      }

      return true
    })
  }, [consolidatedRows, debouncedSearch, selectedCoordenacoes, selectedSupervisoes])

  // Filtered comparison rows: oculta lojas sem dados em ambas as referências
  const filteredComparisonRows = useMemo(() => {
    if (!isComparisonActive) return []
    return comparisonRows.filter((row) => {
      // Ocultar se não possui dados em nenhuma das referências comparadas
      const hasAnyData =
        (row.hasDataPrimary && row.primary.totalLinhas > 0) ||
        (row.hasDataCompared && row.compared.totalLinhas > 0)
      if (!hasAnyData) return false

      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchName = row.storeName.toLowerCase().includes(q)
        const matchCoord = (row.coordenacao || '').toLowerCase().includes(q)
        const matchSuper = (row.supervisao || '').toLowerCase().includes(q)
        if (!matchName && !matchCoord && !matchSuper) return false
      }

      if (selectedCoordenacoes.length > 0) {
        if (!selectedCoordenacoes.includes(row.coordenacao)) return false
      }

      if (selectedSupervisoes.length > 0) {
        if (!selectedSupervisoes.includes(row.supervisao)) return false
      }

      return true
    })
  }, [
    comparisonRows,
    debouncedSearch,
    selectedCoordenacoes,
    selectedSupervisoes,
    isComparisonActive,
  ])

  // Totals of filtered rows (Primary)
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        if (!r.hasData) return acc
        acc.totalLinhas += r.totalLinhas
        acc.envioFatura += r.envioFatura
        acc.pendente += r.pendente
        acc.faturaPaga += r.faturaPaga
        acc.semContato += r.semContato
        acc.promessaPagto += r.promessaPagto
        acc.cancelados += r.cancelados
        acc.naoTratados += r.naoTratados
        acc.contatoRealizado += r.contatoRealizado
        return acc
      },
      {
        totalLinhas: 0,
        envioFatura: 0,
        pendente: 0,
        faturaPaga: 0,
        semContato: 0,
        promessaPagto: 0,
        cancelados: 0,
        naoTratados: 0,
        contatoRealizado: 0,
        outros: 0,
      },
    )
  }, [filteredRows])

  // Totals for compared reference
  const comparedTotals = useMemo(() => {
    if (!isComparisonActive) {
      return {
        totalLinhas: 0,
        envioFatura: 0,
        pendente: 0,
        faturaPaga: 0,
        semContato: 0,
        promessaPagto: 0,
        cancelados: 0,
        naoTratados: 0,
        contatoRealizado: 0,
        outros: 0,
      }
    }
    return filteredComparisonRows.reduce(
      (acc, r) => {
        if (!r.hasDataCompared) return acc
        acc.totalLinhas += r.compared.totalLinhas
        acc.envioFatura += r.compared.envioFatura
        acc.pendente += r.compared.pendente
        acc.faturaPaga += r.compared.faturaPaga
        acc.semContato += r.compared.semContato
        acc.promessaPagto += r.compared.promessaPagto
        acc.cancelados += r.compared.cancelados
        acc.naoTratados += r.compared.naoTratados
        acc.contatoRealizado += r.compared.contatoRealizado
        return acc
      },
      {
        totalLinhas: 0,
        envioFatura: 0,
        pendente: 0,
        faturaPaga: 0,
        semContato: 0,
        promessaPagto: 0,
        cancelados: 0,
        naoTratados: 0,
        contatoRealizado: 0,
        outros: 0,
      },
    )
  }, [filteredComparisonRows, isComparisonActive])

  // Comparison summary card data
  const comparisonSummary = useMemo(() => {
    if (!isComparisonActive) return null
    return computeComparisonSummary(
      filteredComparisonRows,
      selectedReferenceDate === 'all' ? 'Mais recente' : selectedReferenceDate,
      comparisonReferenceDate,
    )
  }, [filteredComparisonRows, selectedReferenceDate, comparisonReferenceDate, isComparisonActive])

  // Animated totals
  const animatedTotalLinhas = useCountUp(totals.totalLinhas)
  const animatedEnvioFatura = useCountUp(totals.envioFatura)
  const animatedPendente = useCountUp(totals.pendente)
  const animatedFaturaPaga = useCountUp(totals.faturaPaga)
  const animatedSemContato = useCountUp(totals.semContato)
  const animatedPromessaPagto = useCountUp(totals.promessaPagto)
  const animatedCancelados = useCountUp(totals.cancelados)
  const animatedNaoTratados = useCountUp(totals.naoTratados)
  const animatedContatoRealizado = useCountUp(totals.contatoRealizado)

  // Effective Referente date
  const effectiveReferente = useMemo(() => {
    if (
      selectedReferenceDate &&
      selectedReferenceDate !== 'all' &&
      selectedReferenceDate !== 'none'
    ) {
      return isDateAllowed(selectedReferenceDate) ? selectedReferenceDate : null
    }
    if (selectedReferenceDate === 'none') {
      return 'Sem referência'
    }
    const accessibleRecordStoreIds = new Set(accessibleStores.map((s) => s.id))
    const withRef = records.find(
      (r) =>
        (userAccess.isAdm || accessibleRecordStoreIds.has(r.store)) &&
        r.referente &&
        r.referente.trim() !== '' &&
        isDateAllowed(r.referente),
    )
    return withRef?.referente || null
  }, [records, accessibleStores, userAccess.isAdm, selectedReferenceDate, isDateAllowed])

  // Handle open drawer
  const handleOpenRowDetail = async (row: ConsolidatedRow) => {
    setSelectedRow(row)
    setDrawerOpen(true)

    // Load store import history
    try {
      setLoadingHistory(true)
      const hist = await fetchFpdRecordsByStore(row.storeId)
      setStoreHistory(hist)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
  }

  // Delete an imported record
  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteFpdRecord(recordId)
      toast({
        title: 'Registro excluído',
        description: 'Os dados desta importação foram removidos.',
      })
      if (selectedRow) {
        const hist = await fetchFpdRecordsByStore(selectedRow.storeId)
        setStoreHistory(hist)
      }
      setRecordToDelete(null)
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o registro.',
        variant: 'destructive',
      })
    }
  }

  // Clear all data action (with option to also clear stores)
  const handleClearAllData = async () => {
    try {
      setIsClearing(true)
      if (alsoClearStores) {
        await clearAllStores()
        setStores([])
        setRecords([])
        setClearDialogOpen(false)
        setAlsoClearStores(false)
        toast({
          title: 'Dados e lojas limpos!',
          description: 'Todos os registros consolidados e lojas cadastradas foram removidos.',
        })
      } else {
        await clearAllFpdRecords()
        await clearAllVendorConsolidations()
        setRecords([])
        setClearDialogOpen(false)
        toast({
          title: 'Dados limpos com sucesso!',
          description:
            'Todos os registros consolidados de lojas e vendedores foram removidos. As lojas cadastradas foram mantidas.',
        })
      }
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao limpar dados',
        description:
          err instanceof Error ? err.message : 'Não foi possível remover os dados do consolidado.',
        variant: 'destructive',
      })
    } finally {
      setIsClearing(false)
    }
  }

  const handleExportXlsx = () => {
    if (isComparisonActive) {
      if (filteredComparisonRows.length === 0) {
        toast({
          title: 'Nada a exportar',
          description: 'Nenhuma linha visível no comparativo com os filtros atuais.',
        })
        return
      }
      exportConsolidatedComparisonToXlsx(
        filteredComparisonRows,
        totals,
        comparedTotals,
        effectiveReferente || selectedReferenceDate,
        comparisonReferenceDate,
      )
      toast({
        title: 'Comparativo exportado',
        description: 'O arquivo .xlsx do comparativo entre referências foi gerado com sucesso.',
      })
      return
    }

    if (filteredRows.length === 0) {
      toast({
        title: 'Nada a exportar',
        description: 'Nenhuma linha visível com os filtros atuais.',
      })
      return
    }
    exportConsolidatedToXlsx(filteredRows, totals, effectiveReferente || undefined)
    toast({
      title: 'Planilha exportada',
      description: 'O arquivo .xlsx do Painel de Lojas foi gerado com sucesso.',
    })
  }

  const hasActiveFilters =
    debouncedSearch !== '' ||
    selectedCoordenacoes.length > 0 ||
    selectedSupervisoes.length > 0 ||
    selectedReferenceDate !== 'all' ||
    Boolean(comparisonReferenceDate)

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setSelectedReferenceDate('all')
    setComparisonReferenceDate('')
    setSelectedCoordenacoes([])
    setSelectedSupervisoes([])
  }

  const storesWithDataCount = consolidatedRows.filter((r) => r.hasData).length

  const profileLabel = userAccess.isGerente
    ? 'Gerente'
    : userAccess.isSupervisor
      ? 'Supervisor'
      : userAccess.isCoordenador
        ? 'Coordenador'
        : userAccess.userRole || 'acesso'

  return (
    <div className="space-y-6">
      {/* Usuário sem loja vinculada (Gerente, Supervisor ou Coordenador) - aviso amigável */}
      {!userAccess.isAdm && userAccess.hasNoStoreAssigned && (
        <div
          data-testid="no-store-banner"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">
              Nenhuma loja vinculada ao seu perfil de {profileLabel}
            </p>
            <p className="text-amber-800">
              Seu perfil ainda não possui lojas vinculadas pelo Administrador. Para visualizar o
              painel de consolidação das suas lojas, solicite a vinculação à equipe administradora.
            </p>
          </div>
        </div>
      )}

      {/* Top summary cards banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Lojas Cadastradas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {accessibleStores.length}
              </span>
              <span className="text-xs text-[#0E9F8A] font-medium">
                {storesWithDataCount} com dados
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#12365A]/5 text-[#12365A] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Total de Linhas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {animatedTotalLinhas.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">Móvel + Res.</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0E9F8A]/10 text-[#0E9F8A] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Faturas Pagas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#0891B2] tabular-nums">
                {animatedFaturaPaga.toLocaleString('pt-BR')}
              </span>
              {totals.totalLinhas > 0 && (
                <span className="text-xs text-[#0891B2] font-medium">
                  {((totals.faturaPaga / totals.totalLinhas) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0891B2]/10 text-[#0891B2] flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Data de Referência
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-base sm:text-lg font-bold text-[#12365A]">
                {effectiveReferente
                  ? `Ref: ${effectiveReferente}`
                  : availableReferenceDates.length === 0
                    ? 'Nenhuma referência disponível'
                    : 'Nenhuma importada'}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Empty State Banner when no records exist */}
      {!loading && storesWithDataCount === 0 && (
        <div className="bg-gradient-to-r from-[#12365A] to-[#1a4a7a] text-white rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E9F8A]/20 text-[#0E9F8A] text-xs font-semibold tracking-wider uppercase border border-[#0E9F8A]/30">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Aguardando Dados</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">Nenhum arquivo importado ainda</h2>
            <p className="text-sm text-slate-200 max-w-xl">
              Importe as planilhas <span className="text-white font-semibold">.xlsx</span> das lojas
              para consolidar automaticamente as abas Móvel e Residencial e preencher o Painel de
              Lojas.
            </p>
          </div>
          {userAccess.isAdm && (
            <Link to="/importar">
              <Button className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-lg shadow-[#0E9F8A]/30 font-semibold px-6 py-6 h-auto text-base gap-2.5 shrink-0">
                <UploadCloud className="w-5 h-5" />
                <span>Importar Arquivos Agora</span>
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Aviso de apenas 1 referência se disponível */}
      {availableReferenceDates.length === 1 && !isComparisonActive && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Apenas 1 Data de Referência disponível ({availableReferenceDates[0]}).{' '}
              <strong>Importe mais referências para habilitar o comparativo.</strong>
            </span>
          </div>
        </div>
      )}

      {/* Card / Resumo de comparativo ativo */}
      {isComparisonActive && comparisonSummary && (
        <div className="bg-gradient-to-r from-[#12365A]/5 via-[#2563EB]/5 to-transparent border border-[#2563EB]/20 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#2563EB] text-white text-[11px] font-bold uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Comparativo entre referências
                </span>
                <span className="text-xs text-[#5B6B82]">Evolução do FPD por Loja</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#12365A]">
                Referência atual{' '}
                <span className="text-[#0E9F8A]">
                  {effectiveReferente || selectedReferenceDate}
                </span>{' '}
                vs <span className="text-[#2563EB]">{comparisonReferenceDate}</span>
              </h3>
            </div>

            {/* Métricas do comparativo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-white px-3.5 py-2.5 rounded-lg border border-[#E3E9F2] shadow-xs">
                <span className="text-[10px] font-semibold text-[#5B6B82] uppercase tracking-wider block">
                  Linhas Atual ({effectiveReferente || selectedReferenceDate})
                </span>
                <span className="text-base sm:text-lg font-bold text-[#12365A] tabular-nums">
                  {comparisonSummary.totalPrimaryLinhas.toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="bg-white px-3.5 py-2.5 rounded-lg border border-[#E3E9F2] shadow-xs">
                <span className="text-[10px] font-semibold text-[#5B6B82] uppercase tracking-wider block">
                  Linhas Comparada ({comparisonReferenceDate})
                </span>
                <span className="text-base sm:text-lg font-bold text-[#5B6B82] tabular-nums">
                  {comparisonSummary.totalComparedLinhas.toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="bg-white px-3.5 py-2.5 rounded-lg border border-[#E3E9F2] shadow-xs col-span-2 sm:col-span-1">
                <span className="text-[10px] font-semibold text-[#5B6B82] uppercase tracking-wider block">
                  Variação Total
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-base sm:text-lg font-bold tabular-nums',
                      comparisonSummary.diffLinhas > 0 && 'text-red-600',
                      comparisonSummary.diffLinhas < 0 && 'text-emerald-600',
                      comparisonSummary.diffLinhas === 0 && 'text-slate-600',
                    )}
                  >
                    {comparisonSummary.diffLinhas > 0 && '+'}
                    {comparisonSummary.diffLinhas.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs font-medium text-[#5B6B82]">
                    (
                    {comparisonSummary.diffLinhas > 0
                      ? 'aumento'
                      : comparisonSummary.diffLinhas < 0
                        ? 'redução'
                        : 'estável'}
                    )
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Destaques de Lojas (Maior aumento e maior redução) */}
          {(comparisonSummary.storeWithHighestIncrease ||
            comparisonSummary.storeWithHighestDecrease) && (
            <div className="mt-3 pt-3 border-t border-[#E3E9F2]/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {comparisonSummary.storeWithHighestIncrease && (
                <div className="flex items-center gap-2 text-[#5B6B82] bg-white/70 px-3 py-1.5 rounded-md border border-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span>
                    Maior aumento de ocorrências:{' '}
                    <strong className="text-[#12365A]">
                      {comparisonSummary.storeWithHighestIncrease.storeName}
                    </strong>{' '}
                    <span className="text-red-600 font-bold">
                      (+{comparisonSummary.storeWithHighestIncrease.diff.toLocaleString('pt-BR')}{' '}
                      linhas)
                    </span>
                  </span>
                </div>
              )}
              {comparisonSummary.storeWithHighestDecrease && (
                <div className="flex items-center gap-2 text-[#5B6B82] bg-white/70 px-3 py-1.5 rounded-md border border-emerald-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>
                    Maior redução de ocorrências:{' '}
                    <strong className="text-[#12365A]">
                      {comparisonSummary.storeWithHighestDecrease.storeName}
                    </strong>{' '}
                    <span className="text-emerald-600 font-bold">
                      ({comparisonSummary.storeWithHighestDecrease.diff.toLocaleString('pt-BR')}{' '}
                      linhas)
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[#E3E9F2] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left search & filters */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar loja, coordenação..."
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

            {/* Selector: Data de Referência */}
            <div className="w-full sm:w-auto">
              <select
                aria-label="Selecione a referência principal"
                value={selectedReferenceDate}
                onChange={(e) => setSelectedReferenceDate(e.target.value)}
                className={cn(
                  'h-9 px-3 text-xs font-medium rounded-md border bg-white focus:outline-none focus:border-[#0E9F8A]',
                  selectedReferenceDate !== 'all'
                    ? 'border-[#0E9F8A] text-[#0E9F8A] bg-[#0E9F8A]/5 font-semibold'
                    : 'border-[#E3E9F2] text-[#12365A]',
                )}
                title="Selecione a referência principal"
              >
                {hasMultipleReferences && (
                  <option value="all">Todas as referências (Mais recente por loja)</option>
                )}
                {availableReferenceDates.map((date) => (
                  <option key={date} value={date}>
                    Referência: {date}
                  </option>
                ))}
                <option value="none">
                  {availableReferenceDates.length === 0
                    ? 'Nenhuma referência disponível'
                    : 'Sem referência'}
                </option>
              </select>
            </div>

            {/* Selector: Comparar com (Segunda referência opcional) */}
            <div className="w-full sm:w-auto flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#5B6B82] uppercase tracking-wider hidden md:inline">
                vs:
              </span>
              <select
                value={comparisonReferenceDate}
                onChange={(e) => setComparisonReferenceDate(e.target.value)}
                disabled={availableReferenceDates.length < 2}
                className={cn(
                  'h-9 px-3 text-xs font-medium rounded-md border bg-white focus:outline-none focus:border-[#0E9F8A]',
                  isComparisonActive
                    ? 'border-[#2563EB] text-[#2563EB] bg-[#2563EB]/5 font-semibold'
                    : 'border-[#E3E9F2] text-[#5B6B82]',
                  availableReferenceDates.length < 2 && 'opacity-60 cursor-not-allowed bg-slate-50',
                )}
                title={
                  availableReferenceDates.length < 2
                    ? 'Importe mais referências para habilitar o comparativo'
                    : 'Selecione uma segunda referência para comparar'
                }
              >
                <option value="">
                  {availableReferenceDates.length < 2
                    ? 'Comparar com... (apenas 1 ref. disponível)'
                    : 'Comparar com... (Opcional)'}
                </option>
                {availableReferenceDates.map((date) => (
                  <option key={date} value={date} disabled={date === selectedReferenceDate}>
                    Comparar com: {date}
                  </option>
                ))}
              </select>
              {isComparisonActive && (
                <button
                  type="button"
                  onClick={() => setComparisonReferenceDate('')}
                  className="text-xs text-[#5B6B82] hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
                  title="Desativar comparativo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Coordenação */}
            {uniqueCoordenacoes.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-9 text-xs font-medium border-[#E3E9F2]',
                      selectedCoordenacoes.length > 0 &&
                        'border-[#0E9F8A] text-[#0E9F8A] bg-[#0E9F8A]/5',
                    )}
                  >
                    <Filter className="w-3.5 h-3.5 mr-1.5" />
                    <span>Coordenação</span>
                    {selectedCoordenacoes.length > 0 && (
                      <Badge className="ml-1.5 h-5 px-1.5 bg-[#0E9F8A] text-white text-[10px]">
                        {selectedCoordenacoes.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-white" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-xs font-semibold text-[#12233A]">
                        Filtrar por Coordenação
                      </span>
                      {selectedCoordenacoes.length > 0 && (
                        <button
                          onClick={() => setSelectedCoordenacoes([])}
                          className="text-[11px] text-[#0E9F8A] hover:underline"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {uniqueCoordenacoes.map((coord) => {
                        const checked = selectedCoordenacoes.includes(coord)
                        return (
                          <label
                            key={coord}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#F3F6FA] cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCoordenacoes([...selectedCoordenacoes, coord])
                                } else {
                                  setSelectedCoordenacoes(
                                    selectedCoordenacoes.filter((c) => c !== coord),
                                  )
                                }
                              }}
                              className="rounded border-[#cbd5e1] text-[#0E9F8A] focus:ring-[#0E9F8A]"
                            />
                            <span className="text-[#12233A]">{coord}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Filter Supervisão */}
            {uniqueSupervisoes.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-9 text-xs font-medium border-[#E3E9F2]',
                      selectedSupervisoes.length > 0 &&
                        'border-[#0E9F8A] text-[#0E9F8A] bg-[#0E9F8A]/5',
                    )}
                  >
                    <Filter className="w-3.5 h-3.5 mr-1.5" />
                    <span>Supervisão</span>
                    {selectedSupervisoes.length > 0 && (
                      <Badge className="ml-1.5 h-5 px-1.5 bg-[#0E9F8A] text-white text-[10px]">
                        {selectedSupervisoes.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-white" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-xs font-semibold text-[#12233A]">
                        Filtrar por Supervisão
                      </span>
                      {selectedSupervisoes.length > 0 && (
                        <button
                          onClick={() => setSelectedSupervisoes([])}
                          className="text-[11px] text-[#0E9F8A] hover:underline"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {uniqueSupervisoes.map((sup) => {
                        const checked = selectedSupervisoes.includes(sup)
                        return (
                          <label
                            key={sup}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#F3F6FA] cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSupervisoes([...selectedSupervisoes, sup])
                                } else {
                                  setSelectedSupervisoes(
                                    selectedSupervisoes.filter((s) => s !== sup),
                                  )
                                }
                              }}
                              className="rounded border-[#cbd5e1] text-[#0E9F8A] focus:ring-[#0E9F8A]"
                            />
                            <span className="text-[#12233A]">{sup}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Clear filters button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs text-[#5B6B82] hover:text-[#12233A] gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar filtros</span>
              </Button>
            )}
          </div>

          {/* Right Action Buttons - Visíveis apenas para o perfil ADM (ocultos para Gerente, Supervisor e Coordenador) */}
          {userAccess.isAdm && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={() => setClearDialogOpen(true)}
                variant="outline"
                className="h-9 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 font-medium text-xs sm:text-sm gap-1.5 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Limpar Dados</span>
              </Button>

              <Button
                onClick={handleExportXlsx}
                variant="outline"
                className="h-9 border-[#E3E9F2] text-[#12365A] hover:bg-[#F3F6FA] font-medium text-xs sm:text-sm gap-2"
              >
                <Download className="w-4 h-4 text-[#0E9F8A]" />
                <span>Exportar .xlsx</span>
              </Button>
            </div>
          )}
        </div>

        {/* Helper function / component for diff badge */}
        {/* Renderizado na tabela quando o comparativo está ativo */}

        {/* 13-Column Consolidated Table */}
        <div className="relative overflow-x-auto max-h-[70vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                {/* A - LOJAS (Sticky left) */}
                <th className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3.5 min-w-[200px] text-center border-r border-[#1e456f]">
                  LOJAS
                </th>
                {/* B - COORDENAÇÃO */}
                <th className="px-3 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  COORDENAÇÃO
                </th>
                {/* C - SUPERVISÃO */}
                <th className="px-3 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  SUPERVISÃO
                </th>
                {/* D - TOTAL LINHAS */}
                <th
                  className={cn(
                    'px-3 py-3.5 text-center border-r border-[#1e456f] bg-[#0E2A47]',
                    isComparisonActive ? 'min-w-[155px]' : 'min-w-[110px]',
                  )}
                >
                  <div className="flex flex-col items-center">
                    <span>TOTAL LINHAS</span>
                    {isComparisonActive && (
                      <span className="text-[9px] text-[#38bdf8] font-normal normal-case tracking-normal">
                        Atual vs {comparisonReferenceDate}
                      </span>
                    )}
                  </div>
                </th>
                {/* E–M Status Columns with Colored Chips */}
                {FPD_STATUSES.map((status) => (
                  <th
                    key={status.key}
                    className={cn(
                      'px-2 py-2.5 text-center border-r border-[#1e456f]',
                      isComparisonActive ? 'w-[150px] min-w-[150px]' : 'w-[130px] min-w-[130px]',
                    )}
                  >
                    <div
                      className="w-full flex items-center justify-center min-h-[34px] px-2 py-1 rounded text-[10px] font-bold text-white text-center leading-tight shadow-xs whitespace-normal"
                      style={{ backgroundColor: status.color }}
                    >
                      {status.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : isComparisonActive ? (
                filteredComparisonRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-[#5B6B82]">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                        <p className="font-semibold text-[#12365A]">
                          Nenhuma loja encontrada para o comparativo
                        </p>
                        <p className="text-xs text-[#5B6B82]">
                          Tente ajustar os filtros de busca acima.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredComparisonRows.map((compRow, idx) => {
                    const row = compRow.primary
                    const diff = compRow.diff
                    const hasAnyData = compRow.hasDataPrimary || compRow.hasDataCompared

                    return (
                      <tr
                        key={compRow.storeId}
                        onClick={() => handleOpenRowDetail(row)}
                        className={cn(
                          'hover:bg-[#F0F5FC] cursor-pointer transition-colors group animate-fade-in-up',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          !hasAnyData && 'opacity-60 text-slate-400',
                        )}
                        style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                      >
                        {/* A: LOJAS */}
                        <td
                          className={cn(
                            'sticky left-0 z-10 px-3.5 py-2.5 font-semibold text-[#12365A] border-r border-[#E3E9F2] max-w-[250px]',
                            idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                            'group-hover:bg-[#F0F5FC]',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate group-hover:text-[#0E9F8A] transition-colors">
                                {compRow.storeName}
                              </span>
                              {compRow.isNewInPrimary && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0 uppercase tracking-wide">
                                  Nova
                                </span>
                              )}
                              {compRow.isMissingInPrimary && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 uppercase tracking-wide">
                                  Sem dados atual
                                </span>
                              )}
                              {!hasAnyData && (
                                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0">
                                  Sem dados
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenRowDetail(row)
                              }}
                              className="p-1 rounded-md text-[#8A97AC] group-hover:text-[#0E9F8A] hover:bg-[#0E9F8A]/10 transition-colors shrink-0"
                              title="Ver visão analítica da loja"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* B: COORDENAÇÃO */}
                        <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[140px]">
                          {compRow.coordenacao || <span className="text-slate-300">—</span>}
                        </td>

                        {/* C: SUPERVISÃO */}
                        <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[140px]">
                          {compRow.supervisao || <span className="text-slate-300">—</span>}
                        </td>

                        {/* D: TOTAL LINHAS (com variação e destaque proporcional) */}
                        <td className="px-3 py-2.5 text-right font-bold text-[#12365A] tabular-nums border-r border-[#E3E9F2] bg-slate-50/70">
                          {hasAnyData ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">
                                {compRow.hasDataPrimary
                                  ? row.totalLinhas.toLocaleString('pt-BR')
                                  : '0'}
                              </span>
                              {compRow.isNewInPrimary ? (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                                  novo
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    'inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded',
                                    diff.totalLinhas > 0 &&
                                      'text-red-700 bg-red-50 border border-red-200',
                                    diff.totalLinhas < 0 &&
                                      'text-emerald-700 bg-emerald-50 border border-emerald-200',
                                    diff.totalLinhas === 0 && 'text-slate-500 bg-slate-100',
                                  )}
                                  title={`Anterior: ${compRow.compared.totalLinhas.toLocaleString('pt-BR')}`}
                                >
                                  {diff.totalLinhas > 0 && '▲ +'}
                                  {diff.totalLinhas < 0 && '▼ '}
                                  {diff.totalLinhas === 0 && '='}
                                  {diff.totalLinhas !== 0 &&
                                    Math.abs(diff.totalLinhas).toLocaleString('pt-BR')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* E–M: Status columns with comparison diff */}
                        {FPD_STATUSES.map((status) => {
                          const camelKey = status.key.replace(/_([a-z])/g, (_, c) =>
                            c.toUpperCase(),
                          ) as keyof ConsolidatedRow

                          const primaryVal = compRow.hasDataPrimary
                            ? ((row[camelKey] as number) ?? 0)
                            : 0
                          const comparedVal = compRow.hasDataCompared
                            ? ((compRow.compared[camelKey] as number) ?? 0)
                            : 0
                          const diffVal = primaryVal - comparedVal

                          // Regra semântica CELNET:
                          // Para 'fatura_paga': aumento é positivo (verde), diminuição é alerta (vermelho).
                          // Para inadimplência/ocorrências negativas ('pendente', 'cancelados', 'sem_contato', 'nao_tratados'): aumento é alerta (vermelho), diminuição é positivo (verde).
                          const isFaturaPaga = status.key === 'fatura_paga'
                          const isPositiveChange = isFaturaPaga ? diffVal > 0 : diffVal < 0
                          const isNegativeChange = isFaturaPaga ? diffVal < 0 : diffVal > 0

                          return (
                            <td
                              key={status.key}
                              className="px-2 py-2 text-right font-medium tabular-nums border-r border-[#E3E9F2]"
                              style={{
                                backgroundColor:
                                  compRow.hasDataPrimary && primaryVal > 0
                                    ? status.bgTint
                                    : undefined,
                                color:
                                  compRow.hasDataPrimary && primaryVal > 0
                                    ? status.textColor
                                    : undefined,
                              }}
                            >
                              {hasAnyData ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>
                                    {primaryVal > 0 ? primaryVal.toLocaleString('pt-BR') : '0'}
                                  </span>
                                  {compRow.isNewInPrimary ? (
                                    <span className="text-[9px] text-emerald-600 font-semibold">
                                      novo
                                    </span>
                                  ) : (
                                    <span
                                      className={cn(
                                        'inline-flex items-center text-[10px] font-bold px-1 py-0.2 rounded',
                                        isNegativeChange && 'text-red-700 bg-red-100/70',
                                        isPositiveChange && 'text-emerald-700 bg-emerald-100/70',
                                        diffVal === 0 && 'text-slate-400 bg-slate-100/50',
                                      )}
                                      title={`Anterior: ${comparedVal.toLocaleString('pt-BR')}`}
                                    >
                                      {diffVal > 0 && '▲+'}
                                      {diffVal < 0 && '▼'}
                                      {diffVal === 0 && '='}
                                      {diffVal !== 0 && Math.abs(diffVal).toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-semibold text-[#12365A]">
                        {userAccess.hasNoStoreAssigned
                          ? 'Nenhuma loja vinculada ao seu usuário'
                          : availableReferenceDates.length === 0
                            ? 'Nenhuma referência disponível para o seu perfil'
                            : 'Nenhuma loja encontrada'}
                      </p>
                      <p className="text-xs text-[#5B6B82]">
                        {userAccess.hasNoStoreAssigned
                          ? 'Solicite ao Administrador que vincule uma ou mais lojas ao seu perfil para visualizar os dados.'
                          : availableReferenceDates.length === 0
                            ? 'As datas de referência cadastradas estão desabilitadas para o seu perfil. Entre em contato com o Administrador.'
                            : stores.length === 0
                              ? 'Importe arquivos na aba Importar para gerar os dados do Painel de Lojas.'
                              : 'Tente ajustar os filtros de busca acima.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  return (
                    <tr
                      key={row.storeId}
                      onClick={() => handleOpenRowDetail(row)}
                      className={cn(
                        'hover:bg-[#F0F5FC] cursor-pointer transition-colors group animate-fade-in-up',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                        !row.hasData && 'opacity-60 text-slate-400',
                      )}
                      style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                    >
                      {/* A: LOJAS (Sticky left) */}
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3.5 py-2.5 font-semibold text-[#12365A] border-r border-[#E3E9F2] max-w-[250px]',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          'group-hover:bg-[#F0F5FC]',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate group-hover:text-[#0E9F8A] transition-colors">
                              {row.storeName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenRowDetail(row)
                            }}
                            className="p-1 rounded-md text-[#8A97AC] group-hover:text-[#0E9F8A] hover:bg-[#0E9F8A]/10 transition-colors shrink-0"
                            title="Ver visão analítica da loja"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* B: COORDENAÇÃO */}
                      <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[140px]">
                        {row.coordenacao || <span className="text-slate-300">—</span>}
                      </td>

                      {/* C: SUPERVISÃO */}
                      <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[140px]">
                        {row.supervisao || <span className="text-slate-300">—</span>}
                      </td>

                      {/* D: TOTAL LINHAS */}
                      <td className="px-3 py-2.5 text-right font-bold text-[#12365A] tabular-nums border-r border-[#E3E9F2] bg-slate-50/50">
                        {row.hasData ? (
                          row.totalLinhas.toLocaleString('pt-BR')
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* E–M: Status columns with faint background tint */}
                      {FPD_STATUSES.map((status) => {
                        const val = row.hasData
                          ? (row[
                              status.key.replace(/_([a-z])/g, (_, c) =>
                                c.toUpperCase(),
                              ) as keyof ConsolidatedRow
                            ] as number)
                          : undefined
                        return (
                          <td
                            key={status.key}
                            className="px-2.5 py-2.5 text-right font-medium tabular-nums border-r border-[#E3E9F2]"
                            style={{
                              backgroundColor:
                                row.hasData && (val ?? 0) > 0 ? status.bgTint : undefined,
                              color: row.hasData && (val ?? 0) > 0 ? status.textColor : undefined,
                            }}
                          >
                            {row.hasData ? (
                              (val ?? 0) > 0 ? (
                                (val ?? 0).toLocaleString('pt-BR')
                              ) : (
                                <span className="text-slate-300">0</span>
                              )
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Totals Row (Pinned Footer) */}
            <tfoot className="sticky bottom-0 z-20 bg-[#12365A] text-white font-bold text-[13px] shadow-lg border-t-2 border-[#0E9F8A]">
              <tr>
                {/* A: Totais */}
                <td className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3 border-r border-[#1e456f] text-white uppercase tracking-wider">
                  Totais ({isComparisonActive ? filteredComparisonRows.length : filteredRows.length}
                  )
                </td>
                {/* B */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* C */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>

                {/* D: TOTAL LINHAS */}
                <td className="px-3 py-3 text-right text-white tabular-nums border-r border-[#1e456f] bg-[#0E2A47]">
                  <div className="flex flex-col items-end">
                    <span>{animatedTotalLinhas.toLocaleString('pt-BR')}</span>
                    {isComparisonActive && (
                      <span
                        className={cn(
                          'text-[10px] font-bold px-1 rounded mt-0.5',
                          totals.totalLinhas - comparedTotals.totalLinhas > 0 &&
                            'text-red-300 bg-red-950/60',
                          totals.totalLinhas - comparedTotals.totalLinhas < 0 &&
                            'text-emerald-300 bg-emerald-950/60',
                          totals.totalLinhas - comparedTotals.totalLinhas === 0 && 'text-slate-400',
                        )}
                      >
                        {totals.totalLinhas - comparedTotals.totalLinhas > 0 && '▲ +'}
                        {totals.totalLinhas - comparedTotals.totalLinhas < 0 && '▼ '}
                        {totals.totalLinhas - comparedTotals.totalLinhas === 0 && '= '}
                        {Math.abs(totals.totalLinhas - comparedTotals.totalLinhas).toLocaleString(
                          'pt-BR',
                        )}
                      </span>
                    )}
                  </div>
                </td>

                {/* Helper footer status cell */}
                {(() => {
                  const renderStatusFooterCell = (
                    val: number,
                    compVal: number,
                    colorClass: string,
                    key: FpdStatusKey,
                  ) => {
                    const diff = val - compVal
                    const isFaturaPaga = key === 'fatura_paga'
                    const isPositive = isFaturaPaga ? diff > 0 : diff < 0
                    const isNegative = isFaturaPaga ? diff < 0 : diff > 0

                    return (
                      <td
                        className={cn(
                          'px-2.5 py-3 text-right tabular-nums border-r border-[#1e456f]',
                          colorClass,
                        )}
                      >
                        <div className="flex flex-col items-end">
                          <span>{val.toLocaleString('pt-BR')}</span>
                          {isComparisonActive && (
                            <span
                              className={cn(
                                'text-[10px] font-bold px-1 rounded mt-0.5',
                                isNegative && 'text-red-300 bg-red-950/60',
                                isPositive && 'text-emerald-300 bg-emerald-950/60',
                                diff === 0 && 'text-slate-400',
                              )}
                            >
                              {diff > 0 && '▲+'}
                              {diff < 0 && '▼'}
                              {diff === 0 && '='}
                              {diff !== 0 && Math.abs(diff).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  }

                  return (
                    <>
                      {/* E: 1. Fatura(s) Paga(s) */}
                      {renderStatusFooterCell(
                        totals.faturaPaga,
                        comparedTotals.faturaPaga,
                        'text-[#67e8f9]',
                        'fatura_paga',
                      )}
                      {/* F: 2. Não Tratados */}
                      {renderStatusFooterCell(
                        totals.naoTratados,
                        comparedTotals.naoTratados,
                        'text-[#fdba74]',
                        'nao_tratados',
                      )}
                      {/* G: 3. Pendente */}
                      {renderStatusFooterCell(
                        totals.pendente,
                        comparedTotals.pendente,
                        'text-[#fca5a5]',
                        'pendente',
                      )}
                      {/* H: 4. Enviado Fatura(s) */}
                      {renderStatusFooterCell(
                        totals.envioFatura,
                        comparedTotals.envioFatura,
                        'text-[#4ade80]',
                        'envio_fatura',
                      )}
                      {/* I: 5. Promessa de Pagto. */}
                      {renderStatusFooterCell(
                        totals.promessaPagto,
                        comparedTotals.promessaPagto,
                        'text-[#d8b4fe]',
                        'promessa_pagto',
                      )}
                      {/* J: 6. Sem Contato */}
                      {renderStatusFooterCell(
                        totals.semContato,
                        comparedTotals.semContato,
                        'text-[#cbd5e1]',
                        'sem_contato',
                      )}
                      {/* K: 7. Cancelados */}
                      {renderStatusFooterCell(
                        totals.cancelados,
                        comparedTotals.cancelados,
                        'text-slate-300',
                        'cancelados',
                      )}
                      {/* L: 8. Contato Realizado */}
                      {renderStatusFooterCell(
                        totals.contatoRealizado,
                        comparedTotals.contatoRealizado,
                        'text-[#5eead4]',
                        'contato_realizado',
                      )}
                    </>
                  )
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Analytical Drawer for Store */}
      <StoreAnalyticsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        store={selectedRow}
        history={storeHistory}
        loadingHistory={loadingHistory}
        onDeleteRecord={(id) => setRecordToDelete(id)}
      />

      {/* Delete Record Confirmation Dialog */}
      <Dialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Confirmar exclusão de importação
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Tem certeza de que deseja remover os dados desta importação? O painel voltará a exibir
              a importação anterior ou ficará sem dados se for a única.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setRecordToDelete(null)} className="text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => recordToDelete && handleDeleteRecord(recordToDelete)}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              Sim, excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Data Confirmation Dialog */}
      <Dialog
        open={clearDialogOpen}
        onOpenChange={(open) => {
          if (!isClearing) {
            setClearDialogOpen(open)
            if (!open) setAlsoClearStores(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Limpar todos os dados?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[#5B6B82] leading-relaxed">
              Tem certeza que deseja limpar os dados consolidados? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {stores.length > 0 && (
            <div className="py-2">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-red-100 bg-red-50/50 cursor-pointer select-none hover:bg-red-50 transition-colors">
                <input
                  type="checkbox"
                  checked={alsoClearStores}
                  onChange={(e) => setAlsoClearStores(e.target.checked)}
                  disabled={isClearing}
                  className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-red-900 block">
                    Também limpar todas as {stores.length} lojas cadastradas
                  </span>
                  <span className="text-[#5B6B82] text-[11px] block mt-0.5">
                    {alsoClearStores
                      ? 'Todas as lojas e históricos serão excluídos permanentemente.'
                      : 'Se desmarcado, apenas os registros consolidados serão zerados e as lojas serão mantidas.'}
                  </span>
                </div>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setClearDialogOpen(false)
                setAlsoClearStores(false)
              }}
              disabled={isClearing}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAllData}
              disabled={isClearing}
              className="text-xs bg-red-600 hover:bg-red-700 gap-2"
            >
              {isClearing && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>
                {isClearing
                  ? 'Limpando...'
                  : alsoClearStores
                    ? 'Limpar Dados e Lojas'
                    : 'Limpar Apenas Dados'}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Arquivos
