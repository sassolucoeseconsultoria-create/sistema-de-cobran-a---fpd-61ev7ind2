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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import { useCountUp } from '@/hooks/useCountUp'
import {
  fetchStores,
  fetchFpdRecords,
  deleteFpdRecord,
  clearAllFpdRecords,
  clearAllStores,
  fetchFpdRecordsByStore,
} from '@/services/fpdService'
import { exportConsolidatedToXlsx } from '@/lib/xlsxExport'
import { FPD_STATUSES, type StoreRecord, type FpdRecord, type ConsolidatedRow } from '@/types/fpd'
import { cn } from '@/lib/utils'
import { StoreAnalyticsDrawer } from '@/components/StoreAnalyticsDrawer'

export const Index: React.FC = () => {
  const { toast } = useToast()
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [records, setRecords] = useState<FpdRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível buscar as informações do consolidado.',
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
              observacao: e.record.observacao || '',
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

  // Map each store to its latest FPD record
  const consolidatedRows: ConsolidatedRow[] = useMemo(() => {
    return stores.map((store) => {
      // Find all records for this store, pick the latest
      const storeRecords = records.filter((r) => r.store === store.id)
      const latest = storeRecords[0] // records are sorted -importado_em

      if (!latest) {
        return {
          storeId: store.id,
          storeName: store.name,
          coordenacao: store.coordenacao || '',
          supervisao: store.supervisao || '',
          observacao: store.observacao || '',
          hasData: false,
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

      return {
        storeId: store.id,
        storeName: store.name,
        coordenacao: store.coordenacao || '',
        supervisao: store.supervisao || '',
        observacao: store.observacao || '',
        hasData: true,
        latestRecordId: latest.id,
        referente: latest.referente,
        importadoEm: latest.importado_em || latest.created,
        totalLinhas: latest.total_linhas || 0,
        envioFatura: latest.envio_fatura || 0,
        pendente: latest.pendente || 0,
        faturaPaga: latest.fatura_paga || 0,
        semContato: latest.sem_contato || 0,
        promessaPagto: latest.promessa_pagto || 0,
        cancelados: latest.cancelados || 0,
        naoTratados: latest.nao_tratados || 0,
        contatoRealizado: latest.contato_realizado || 0,
        outros: latest.outros || 0,
      }
    })
  }, [stores, records])

  // Distinct filter options
  const uniqueCoordenacoes = useMemo(() => {
    const list = Array.from(
      new Set(stores.map((s) => s.coordenacao?.trim()).filter(Boolean)),
    ) as string[]
    return list.sort((a, b) => a.localeCompare(b))
  }, [stores])

  const uniqueSupervisoes = useMemo(() => {
    const list = Array.from(
      new Set(stores.map((s) => s.supervisao?.trim()).filter(Boolean)),
    ) as string[]
    return list.sort((a, b) => a.localeCompare(b))
  }, [stores])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return consolidatedRows.filter((row) => {
      // Search
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchName = row.storeName.toLowerCase().includes(q)
        const matchCoord = row.coordenacao.toLowerCase().includes(q)
        const matchSuper = row.supervisao.toLowerCase().includes(q)
        if (!matchName && !matchCoord && !matchSuper) return false
      }

      // Coordenacao filter
      if (selectedCoordenacoes.length > 0) {
        if (!selectedCoordenacoes.includes(row.coordenacao)) return false
      }

      // Supervisao filter
      if (selectedSupervisoes.length > 0) {
        if (!selectedSupervisoes.includes(row.supervisao)) return false
      }

      return true
    })
  }, [consolidatedRows, debouncedSearch, selectedCoordenacoes, selectedSupervisoes])

  // Totals of filtered rows
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
        acc.outros += r.outros
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
  const animatedOutros = useCountUp(totals.outros)

  // Latest Referente date
  const latestReferente = useMemo(() => {
    const withRef = records.find((r) => r.referente && r.referente.trim() !== '')
    return withRef?.referente || null
  }, [records])

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
        setRecords([])
        setClearDialogOpen(false)
        toast({
          title: 'Dados limpos com sucesso!',
          description:
            'Todos os registros do consolidado foram removidos. As lojas foram mantidas.',
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
    if (filteredRows.length === 0) {
      toast({
        title: 'Nada a exportar',
        description: 'Nenhuma linha visível com os filtros atuais.',
      })
      return
    }
    exportConsolidatedToXlsx(filteredRows, totals, latestReferente || undefined)
    toast({
      title: 'Planilha exportada',
      description: 'O arquivo .xlsx foi gerado com sucesso.',
    })
  }

  const hasActiveFilters =
    debouncedSearch !== '' || selectedCoordenacoes.length > 0 || selectedSupervisoes.length > 0

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setSelectedCoordenacoes([])
    setSelectedSupervisoes([])
  }

  const storesWithDataCount = consolidatedRows.filter((r) => r.hasData).length

  return (
    <div className="space-y-6">
      {/* Top summary cards banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Lojas Cadastradas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {stores.length}
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
                {latestReferente ? `Ref: ${latestReferente}` : 'Nenhuma importada'}
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
              para consolidar automaticamente as abas Móvel e Residencial e preencher as colunas do
              relatório.
            </p>
          </div>
          <Link to="/importar">
            <Button className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-lg shadow-[#0E9F8A]/30 font-semibold px-6 py-6 h-auto text-base gap-2.5 shrink-0">
              <UploadCloud className="w-5 h-5" />
              <span>Importar Arquivos Agora</span>
            </Button>
          </Link>
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

          {/* Right Action Buttons */}
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
        </div>
        {/* 14-Column Consolidated Table */}
        <div className="relative overflow-x-auto max-h-[70vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                {/* A - LOJAS (Sticky left) */}
                <th className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3.5 min-w-[200px] border-r border-[#1e456f]">
                  LOJAS
                </th>
                {/* B - COORDENAÇÃO */}
                <th className="px-3 py-3.5 min-w-[130px] border-r border-[#1e456f]">COORDENAÇÃO</th>
                {/* C - SUPERVISÃO */}
                <th className="px-3 py-3.5 min-w-[130px] border-r border-[#1e456f]">SUPERVISÃO</th>
                {/* D - TOTAL LINHAS */}
                <th className="px-3 py-3.5 min-w-[110px] text-right border-r border-[#1e456f] bg-[#0E2A47]">
                  TOTAL LINHAS
                </th>
                {/* E–M Status Columns with Colored Chips */}
                {FPD_STATUSES.map((status) => (
                  <th
                    key={status.key}
                    className="px-2.5 py-2.5 min-w-[120px] text-right border-r border-[#1e456f]"
                  >
                    <div
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-xs"
                      style={{ backgroundColor: status.color }}
                    >
                      {status.label}
                    </div>
                  </th>
                ))}
                {/* N - OBSERVAÇÃO */}
                <th className="px-3 py-3.5 min-w-[180px]">OBSERVAÇÃO</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando dados consolidados...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-medium text-[#12365A]">Nenhuma loja encontrada</p>
                      <p className="text-xs text-[#5B6B82]">
                        {stores.length === 0
                          ? 'Cadastre lojas na aba Lojas ou faça o upload de arquivos .xlsx para preencher a tabela.'
                          : 'Tente ajustar os termos de busca ou remover os filtros aplicados.'}
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
                            {!row.hasData && (
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

                      {/* N: OBSERVAÇÃO */}
                      <td className="px-3 py-2.5 text-[#5B6B82] truncate max-w-[200px]">
                        {row.observacao ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block cursor-help">{row.observacao}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs bg-[#12365A] text-white">
                              {row.observacao}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
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
                  Totais ({filteredRows.length})
                </td>
                {/* B */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* C */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* D: TOTAL LINHAS */}
                <td className="px-3 py-3 text-right text-white tabular-nums border-r border-[#1e456f] bg-[#0E2A47]">
                  {animatedTotalLinhas.toLocaleString('pt-BR')}
                </td>
                {/* E: Enviado Fatura(s) */}
                <td className="px-2.5 py-3 text-right text-[#4ade80] tabular-nums border-r border-[#1e456f]">
                  {animatedEnvioFatura.toLocaleString('pt-BR')}
                </td>
                {/* F: Pendente */}
                <td className="px-2.5 py-3 text-right text-[#93c5fd] tabular-nums border-r border-[#1e456f]">
                  {animatedPendente.toLocaleString('pt-BR')}
                </td>
                {/* G: Fatura(s) Paga(s) */}
                <td className="px-2.5 py-3 text-right text-[#67e8f9] tabular-nums border-r border-[#1e456f]">
                  {animatedFaturaPaga.toLocaleString('pt-BR')}
                </td>
                {/* H: Sem Contato */}
                <td className="px-2.5 py-3 text-right text-[#cbd5e1] tabular-nums border-r border-[#1e456f]">
                  {animatedSemContato.toLocaleString('pt-BR')}
                </td>
                {/* I: Promessa de Pagto. */}
                <td className="px-2.5 py-3 text-right text-[#d8b4fe] tabular-nums border-r border-[#1e456f]">
                  {animatedPromessaPagto.toLocaleString('pt-BR')}
                </td>
                {/* J: Cancelados */}
                <td className="px-2.5 py-3 text-right text-[#fca5a5] tabular-nums border-r border-[#1e456f]">
                  {animatedCancelados.toLocaleString('pt-BR')}
                </td>
                {/* K: Não Tratados */}
                <td className="px-2.5 py-3 text-right text-[#fdba74] tabular-nums border-r border-[#1e456f]">
                  {animatedNaoTratados.toLocaleString('pt-BR')}
                </td>
                {/* L: Contato Realizado */}
                <td className="px-2.5 py-3 text-right text-[#5eead4] tabular-nums border-r border-[#1e456f]">
                  {animatedContatoRealizado.toLocaleString('pt-BR')}
                </td>
                {/* M: Outros Motivos */}
                <td className="px-2.5 py-3 text-right text-[#c4b5fd] tabular-nums border-r border-[#1e456f]">
                  {animatedOutros.toLocaleString('pt-BR')}
                </td>
                {/* N */}
                <td className="px-3 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>{' '}
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
              Tem certeza de que deseja remover os dados desta importação? O consolidado voltará a
              exibir a importação anterior ou ficará sem dados se for a única.
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
              Tem certeza que deseja limpar os dados do consolidado? Esta ação não pode ser
              desfeita.
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

export default Index
