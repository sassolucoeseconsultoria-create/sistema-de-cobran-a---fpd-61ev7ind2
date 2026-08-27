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
  Users,
  TrendingUp,
  Building2,
  Trash2,
  Calendar,
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
  fetchVendorConsolidations,
  clearAllVendorConsolidations,
  fetchStores,
} from '@/services/fpdService'
import { exportVendorsToXlsx } from '@/lib/xlsxExport'
import {
  FPD_STATUSES,
  type VendorConsolidationRecord,
  type VendorRow,
  type StoreRecord,
} from '@/types/fpd'
import { cn } from '@/lib/utils'

export const Vendedores: React.FC = () => {
  const { toast } = useToast()
  const [records, setRecords] = useState<VendorConsolidationRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedLoja, setSelectedLoja] = useState<string>('all')

  // Clear dialog
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
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
      const [fetchedVendors, fetchedStores] = await Promise.all([
        fetchVendorConsolidations(),
        fetchStores(),
      ])
      setRecords(fetchedVendors)
      setStores(fetchedStores)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar ranking de vendedores',
        description: 'Não foi possível carregar os dados dos vendedores.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Realtime subscription
  useRealtime<VendorConsolidationRecord>('vendor_consolidations', (e) => {
    if (e.action === 'create') {
      setRecords((prev) => [e.record, ...prev.filter((r) => r.id !== e.record.id)])
    } else if (e.action === 'update') {
      setRecords((prev) => prev.map((r) => (r.id === e.record.id ? e.record : r)))
    } else if (e.action === 'delete') {
      setRecords((prev) => prev.filter((r) => r.id !== e.record.id))
    }
  })

  // Normalize vendor rows
  const vendorRows: VendorRow[] = useMemo(() => {
    return records.map((r) => {
      // Find supervision if missing
      let sup = r.supervisao || ''
      if (!sup && r.loja) {
        const matched = stores.find(
          (s) =>
            s.name.trim().toUpperCase() === r.loja?.trim().toUpperCase() ||
            (r.loja && r.loja.toUpperCase().includes(s.name.trim().toUpperCase())),
        )
        if (matched?.supervisao) sup = matched.supervisao
      }

      return {
        id: r.id,
        vendedor: r.vendedor || 'NÃO INFORMADO',
        loja: r.loja || '',
        supervisao: sup,
        dataReferencia: r.data_referencia,
        totalLinhas: r.total_linhas || 0,
        faturaPaga: r.fatura_paga || 0,
        envioFatura: r.envio_fatura || 0,
        promessaPagto: r.promessa_pagto || 0,
        semContato: r.sem_contato || 0,
        cancelados: r.cancelados || 0,
        pendente: r.pendente || 0,
        contatoRealizado: r.contato_realizado || 0,
        outros: r.outros || 0,
        naoTratados: r.nao_tratados || 0,
      }
    })
  }, [records, stores])

  // Unique lojas for filter dropdown
  const uniqueLojas = useMemo(() => {
    const set = new Set<string>()
    for (const r of vendorRows) {
      if (r.loja && r.loja.trim() !== '') {
        set.add(r.loja.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [vendorRows])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return vendorRows.filter((row) => {
      // Search
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchVendedor = row.vendedor.toLowerCase().includes(q)
        const matchLoja = row.loja.toLowerCase().includes(q)
        const matchSuper = row.supervisao.toLowerCase().includes(q)
        if (!matchVendedor && !matchLoja && !matchSuper) return false
      }

      // Filter Loja
      if (selectedLoja !== 'all') {
        if (row.loja !== selectedLoja) return false
      }

      return true
    })
  }, [vendorRows, debouncedSearch, selectedLoja])

  // Summary Totals
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
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

  // Animated counters
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

  // Indicator: Loja com mais vendedores
  const lojaComMaisVendedores = useMemo(() => {
    if (vendorRows.length === 0) return { nome: 'Nenhuma', count: 0 }
    const map = new Map<string, Set<string>>()
    for (const r of vendorRows) {
      const l = r.loja || 'SEM LOJA'
      if (!map.has(l)) map.set(l, new Set())
      map.get(l)!.add(r.vendedor)
    }
    let topLoja = 'Nenhuma'
    let maxCount = 0
    for (const [loja, vends] of map.entries()) {
      if (vends.size > maxCount) {
        maxCount = vends.size
        topLoja = loja
      }
    }
    return { nome: topLoja, count: maxCount }
  }, [vendorRows])

  // Distinct Vendedores count
  const distinctVendedoresCount = useMemo(() => {
    return new Set(vendorRows.map((r) => r.vendedor)).size
  }, [vendorRows])

  // Latest Referente
  const latestReferente = useMemo(() => {
    const withRef = records.find((r) => r.data_referencia && r.data_referencia.trim() !== '')
    return withRef?.data_referencia || null
  }, [records])

  // Clear data
  const handleClearAll = async () => {
    try {
      setIsClearing(true)
      const count = await clearAllVendorConsolidations()
      setRecords([])
      setClearDialogOpen(false)
      toast({
        title: 'Dados de vendedores limpos!',
        description: `${count} registro(s) de vendedores foram removidos.`,
      })
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao limpar dados',
        description: 'Não foi possível limpar os dados de vendedores.',
        variant: 'destructive',
      })
    } finally {
      setIsClearing(false)
    }
  }

  // Export
  const handleExportXlsx = () => {
    if (filteredRows.length === 0) {
      toast({
        title: 'Nada a exportar',
        description: 'Nenhum vendedor encontrado com os filtros atuais.',
      })
      return
    }
    exportVendorsToXlsx(filteredRows, totals, latestReferente || undefined)
    toast({
      title: 'Planilha exportada',
      description: 'O arquivo .xlsx do ranking por vendedor foi gerado.',
    })
  }

  const hasActiveFilters = debouncedSearch !== '' || selectedLoja !== 'all'

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setSelectedLoja('all')
  }

  return (
    <div className="space-y-6">
      {/* Top summary cards banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Vendedores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Total de Vendedores
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {distinctVendedoresCount}
              </span>
              <span className="text-xs text-[#0E9F8A] font-medium">
                {vendorRows.length} combinações
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#12365A]/5 text-[#12365A] flex items-center justify-center">
            <Users className="w-5 h-5 text-[#0E9F8A]" />
          </div>
        </div>

        {/* Card 2: Total de Linhas */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Total de Linhas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {animatedTotalLinhas.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">inadimplentes</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0E9F8A]/10 text-[#0E9F8A] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Loja com mais vendedores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Loja c/ Mais Vendedores
            </p>
            <div className="mt-1">
              <p
                className="text-sm font-bold text-[#12365A] truncate"
                title={lojaComMaisVendedores.nome}
              >
                {lojaComMaisVendedores.nome}
              </p>
              {lojaComMaisVendedores.count > 0 && (
                <span className="text-xs text-[#0891B2] font-semibold">
                  {lojaComMaisVendedores.count} vendedores
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0891B2]/10 text-[#0891B2] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Faturas Pagas / Data Ref */}
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
          <div className="w-10 h-10 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Empty State Banner when no records exist */}
      {!loading && vendorRows.length === 0 && (
        <div className="bg-gradient-to-r from-[#12365A] to-[#1a4a7a] text-white rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E9F8A]/20 text-[#0E9F8A] text-xs font-semibold tracking-wider uppercase border border-[#0E9F8A]/30">
              <Users className="w-3.5 h-3.5" />
              <span>Ranking por Vendedor</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">
              Nenhum dado de vendedor importado ainda
            </h2>
            <p className="text-sm text-slate-200 max-w-xl">
              Ao importar as planilhas <span className="text-white font-semibold">.xlsx</span> das
              lojas, o sistema extrai automaticamente o vendedor e a loja de cada linha (Aba Móvel:
              colunas D/E; Aba Residencial: colunas AV/AU).
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
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar vendedor, loja ou supervisão..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A97AC] hover:text-[#12365A]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Loja (Dropdown) */}
            <div className="w-full sm:w-56">
              <select
                value={selectedLoja}
                onChange={(e) => setSelectedLoja(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-[#E3E9F2] bg-[#F8FAFC] px-2.5 text-[#12365A] focus:outline-none focus:border-[#0E9F8A]"
              >
                <option value="all">Todas as Lojas ({uniqueLojas.length})</option>
                {uniqueLojas.map((loja) => (
                  <option key={loja} value={loja}>
                    {loja}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs text-[#5B6B82] hover:text-[#12365A] gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar filtros</span>
              </Button>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {records.length > 0 && (
              <Button
                onClick={() => setClearDialogOpen(true)}
                variant="outline"
                className="h-9 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 font-medium text-xs sm:text-sm gap-1.5 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Limpar Vendedores</span>
              </Button>
            )}

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

        {/* 13-Column Vendor Ranking Table */}
        <div className="relative overflow-x-auto max-h-[70vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                {/* A - VENDEDOR (Sticky left) */}
                <th className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3.5 min-w-[200px] text-center border-r border-[#1e456f]">
                  VENDEDOR
                </th>
                {/* B - LOJA */}
                <th className="px-3 py-3.5 min-w-[150px] text-center border-r border-[#1e456f]">
                  LOJA
                </th>
                {/* C - SUPERVISÃO */}
                <th className="px-3 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  SUPERVISÃO
                </th>
                {/* D - TOTAL LINHAS */}
                <th className="px-3 py-3.5 min-w-[110px] text-center border-r border-[#1e456f] bg-[#0E2A47]">
                  TOTAL LINHAS
                </th>
                {/* E–M Status Columns with uniform 130px width and colored headers */}
                {FPD_STATUSES.map((status) => (
                  <th
                    key={status.key}
                    className="px-2 py-2.5 w-[130px] min-w-[130px] text-center border-r border-[#1e456f]"
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
                  <td colSpan={13} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando ranking por vendedor...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-medium text-[#12365A]">Nenhum vendedor encontrado</p>
                      <p className="text-xs text-[#5B6B82]">
                        {vendorRows.length === 0
                          ? 'Importe arquivos .xlsx na aba Importar para gerar automaticamente o ranking de vendedores.'
                          : 'Tente ajustar os termos de busca ou o filtro de loja.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  return (
                    <tr
                      key={row.id || `${row.vendedor}-${row.loja}-${idx}`}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors group',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* A: VENDEDOR (Sticky left) */}
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3.5 py-2.5 font-semibold text-[#12365A] border-r border-[#E3E9F2] max-w-[250px]',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          'group-hover:bg-[#F0F5FC]',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#12365A]/10 text-[#12365A] flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <span className="truncate group-hover:text-[#0E9F8A] transition-colors">
                            {row.vendedor}
                          </span>
                        </div>
                      </td>

                      {/* B: LOJA */}
                      <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[180px] font-medium">
                        {row.loja || <span className="text-slate-300">—</span>}
                      </td>

                      {/* C: SUPERVISÃO */}
                      <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[140px]">
                        {row.supervisao || <span className="text-slate-300">—</span>}
                      </td>

                      {/* D: TOTAL LINHAS */}
                      <td className="px-3 py-2.5 text-center font-bold text-[#12365A] tabular-nums border-r border-[#E3E9F2] bg-slate-50/50">
                        {row.totalLinhas.toLocaleString('pt-BR')}
                      </td>

                      {/* E–M: Status columns with uniform width and colored chip badge */}
                      {FPD_STATUSES.map((status) => {
                        const val = row[
                          status.key.replace(/_([a-z])/g, (_, c) =>
                            c.toUpperCase(),
                          ) as keyof VendorRow
                        ] as number

                        const hasVal = (val ?? 0) > 0

                        return (
                          <td
                            key={status.key}
                            className="px-2 py-2 text-center font-medium tabular-nums border-r border-[#E3E9F2] w-[130px] min-w-[130px]"
                            style={{
                              backgroundColor: hasVal ? status.bgTint : undefined,
                              color: hasVal ? status.textColor : undefined,
                            }}
                          >
                            {hasVal ? (
                              <span
                                className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-bold"
                                style={{
                                  backgroundColor: status.borderTint,
                                  color: status.textColor,
                                }}
                              >
                                {(val ?? 0).toLocaleString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
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
                  Totais ({filteredRows.length})
                </td>
                {/* B */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* C */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* D: TOTAL LINHAS */}
                <td className="px-3 py-3 text-center text-white tabular-nums border-r border-[#1e456f] bg-[#0E2A47]">
                  {animatedTotalLinhas.toLocaleString('pt-BR')}
                </td>
                {/* E: 1. Fatura(s) Paga(s) */}
                <td className="px-2.5 py-3 text-center text-[#67e8f9] tabular-nums border-r border-[#1e456f]">
                  {animatedFaturaPaga.toLocaleString('pt-BR')}
                </td>
                {/* F: 2. Enviado Fatura(s) */}
                <td className="px-2.5 py-3 text-center text-[#4ade80] tabular-nums border-r border-[#1e456f]">
                  {animatedEnvioFatura.toLocaleString('pt-BR')}
                </td>
                {/* G: 3. Promessa de Pagto. */}
                <td className="px-2.5 py-3 text-center text-[#d8b4fe] tabular-nums border-r border-[#1e456f]">
                  {animatedPromessaPagto.toLocaleString('pt-BR')}
                </td>
                {/* H: 4. Sem Contato */}
                <td className="px-2.5 py-3 text-center text-[#cbd5e1] tabular-nums border-r border-[#1e456f]">
                  {animatedSemContato.toLocaleString('pt-BR')}
                </td>
                {/* I: 5. Cancelados */}
                <td className="px-2.5 py-3 text-center text-slate-300 tabular-nums border-r border-[#1e456f]">
                  {animatedCancelados.toLocaleString('pt-BR')}
                </td>
                {/* J: 6. Pendente */}
                <td className="px-2.5 py-3 text-center text-[#fca5a5] tabular-nums border-r border-[#1e456f]">
                  {animatedPendente.toLocaleString('pt-BR')}
                </td>
                {/* K: 7. Contato Realizado */}
                <td className="px-2.5 py-3 text-center text-[#5eead4] tabular-nums border-r border-[#1e456f]">
                  {animatedContatoRealizado.toLocaleString('pt-BR')}
                </td>
                {/* L: 8. Outros Motivos */}
                <td className="px-2.5 py-3 text-center text-[#c4b5fd] tabular-nums border-r border-[#1e456f]">
                  {animatedOutros.toLocaleString('pt-BR')}
                </td>
                {/* M: 9. Não Tratados */}
                <td className="px-2.5 py-3 text-center text-[#fdba74] tabular-nums border-r border-[#1e456f]">
                  {animatedNaoTratados.toLocaleString('pt-BR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

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
              Limpar dados de vendedores?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[#5B6B82] leading-relaxed">
              Tem certeza de que deseja remover todos os dados consolidados do ranking por vendedor?
              Esta ação não pode ser desfeita.
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
              className="text-xs bg-red-600 hover:bg-red-700 gap-2"
            >
              {isClearing && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{isClearing ? 'Limpando...' : 'Limpar Dados'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Vendedores
