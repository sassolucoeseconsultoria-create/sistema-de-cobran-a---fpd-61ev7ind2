import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Download,
  RotateCcw,
  UploadCloud,
  AlertCircle,
  TrendingDown,
  Flame,
  AlertTriangle,
  Building2,
  Percent,
  Store,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import { useCountUp } from '@/hooks/useCountUp'
import {
  fetchVendorConsolidations,
  fetchStores,
  matchStore,
  fetchDistinctReferenceDates,
} from '@/services/fpdService'
import { exportVendorsToXlsx } from '@/lib/xlsxExport'
import {
  FPD_STATUSES,
  type VendorConsolidationRecord,
  type VendorRow,
  type StoreRecord,
} from '@/types/fpd'
import { cn } from '@/lib/utils'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
import { isSameStore } from '@/lib/storeMatchingUtils'

export const TopOfensores: React.FC = () => {
  const { toast } = useToast()
  const userAccess = useUserStoreAccess()
  const [records, setRecords] = useState<VendorConsolidationRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [availableReferenceDates, setAvailableReferenceDates] = useState<string[]>([])
  const [selectedReferenceDate, setSelectedReferenceDate] = useState<string>('all')
  const [selectedLoja, setSelectedLoja] = useState<string>('all')

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
      const [fetchedVendors, fetchedStores, fetchedRefDates] = await Promise.all([
        fetchVendorConsolidations(),
        fetchStores(),
        fetchDistinctReferenceDates(),
      ])
      setRecords(fetchedVendors)
      setStores(fetchedStores)
      setAvailableReferenceDates(fetchedRefDates)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar os dados dos principais ofensores.',
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

  // Normalize all vendor records - filtering strictly by user's permitted stores
  const allVendorRows: VendorRow[] = useMemo(() => {
    if (userAccess.hasNoStoreAssigned) return []

    return records
      .filter((r) => {
        if (userAccess.isAdm) return true
        return userAccess.isStoreNameAllowed(r.loja, stores)
      })
      .map((r) => {
        let sup = r.supervisao || ''
        if (!sup && r.loja) {
          const matched = matchStore(r.loja, stores)
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
  }, [records, stores, userAccess])

  // Determina o nome canônico da loja vinculada ao Gerente
  const managerAssignedStoreName = useMemo(() => {
    if (!userAccess.isGerente || userAccess.hasNoStoreAssigned) return null

    // 1. Procurar nas stores cadastradas pelo ID vinculado
    if (userAccess.managerStoreId && stores.length > 0) {
      const matchedStore = stores.find((s) => s.id === userAccess.managerStoreId)
      if (matchedStore?.name?.trim()) {
        return matchedStore.name.trim()
      }
    }

    // 2. Se temos linhas de vendedores permitidas
    if (allVendorRows.length > 0) {
      const firstWithLoja = allVendorRows.find((r) => r.loja && r.loja.trim() !== '')
      if (firstWithLoja) return firstWithLoja.loja.trim()
    }

    // 3. Fallback: allowedStoreIds
    if (userAccess.allowedStoreIds.length > 0) {
      return userAccess.allowedStoreIds[0]
    }

    return null
  }, [userAccess, stores, allVendorRows])

  // Unique lojas for filter dropdown (only from permitted vendor rows and assigned stores)
  const uniqueLojas = useMemo(() => {
    const set = new Set<string>()

    // Se o usuário não é ADM, limitar estritamente às lojas vinculadas ao perfil
    if (!userAccess.isAdm) {
      if (userAccess.hasNoStoreAssigned) return []

      userAccess.getAllowedStoreNames(stores).forEach((name) => {
        if (name && name.trim()) set.add(name.trim())
      })

      // Adiciona lojas presentes nas linhas permitidas apenas se forem autorizadas
      for (const r of allVendorRows) {
        if (r.loja && r.loja.trim() !== '' && userAccess.isStoreNameAllowed(r.loja, stores)) {
          set.add(r.loja.trim())
        }
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    }

    for (const r of allVendorRows) {
      if (r.loja && r.loja.trim() !== '') {
        set.add(r.loja.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allVendorRows, userAccess, stores])

  // Sincroniza selectedLoja com a loja única do Gerente quando aplicável
  useEffect(() => {
    if (!userAccess.isGerente) return

    if (userAccess.hasNoStoreAssigned) {
      if (selectedLoja !== '') {
        setSelectedLoja('')
      }
      return
    }

    if (managerAssignedStoreName && selectedLoja !== managerAssignedStoreName) {
      setSelectedLoja(managerAssignedStoreName)
    }
  }, [userAccess.isGerente, userAccess.hasNoStoreAssigned, managerAssignedStoreName, selectedLoja])

  // Limite de ranking conforme o perfil do usuário logado:
  // - Gerente: 3 (restrito à loja vinculada a ele)
  // - Supervisor: 10 (considerando as lojas vinculadas a ele)
  // - Coordenador: 20 (considerando as lojas vinculadas a ele)
  // - ADM: 20 (comportamento atual mantido)
  const rankingLimit = useMemo(() => {
    if (userAccess.isGerente) return 3
    if (userAccess.isSupervisor) return 10
    if (userAccess.isCoordenador) return 20
    return 20 // ADM e fallback padrão
  }, [userAccess.isGerente, userAccess.isSupervisor, userAccess.isCoordenador])

  // Título e legenda dinâmicos por perfil
  const rankingTitle = `Principais Ofensores (Top ${rankingLimit})`
  const rankingCardLabel = `Linhas nos Principais Ofensores`
  const profileLabel = userAccess.isGerente
    ? 'Gerente'
    : userAccess.isSupervisor
      ? 'Supervisor'
      : userAccess.isCoordenador
        ? 'Coordenador'
        : userAccess.isAdm
          ? 'ADM'
          : userAccess.userRole || 'Usuário'

  // Total lines overall across all vendors in database
  const grandTotalLinhas = useMemo(() => {
    return allVendorRows.reduce((acc, r) => acc + r.totalLinhas, 0)
  }, [allVendorRows])

  // Total de possíveis antes de cortar pelo limite do perfil
  const candidateRowsBeforeSlice = useMemo(() => {
    let rows = [...allVendorRows]

    // Apply reference date filter
    if (selectedReferenceDate !== 'all') {
      if (selectedReferenceDate === 'none') {
        rows = rows.filter((r) => !r.dataReferencia || r.dataReferencia.trim() === '')
      } else {
        rows = rows.filter((r) => r.dataReferencia === selectedReferenceDate)
      }
    }

    // Apply store filter first if selected and not 'all'
    if (selectedLoja !== 'all' && selectedLoja !== '') {
      rows = rows.filter((r) => r.loja === selectedLoja || isSameStore(r.loja, selectedLoja))
    }

    // Apply search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      rows = rows.filter((row) => {
        const matchVendedor = row.vendedor.toLowerCase().includes(q)
        const matchLoja = (row.loja || '').toLowerCase().includes(q)
        const matchSuper = (row.supervisao || '').toLowerCase().includes(q)
        return matchVendedor || matchLoja || matchSuper
      })
    }

    // Sort descending by totalLinhas (main ranking criterion)
    rows.sort((a, b) => {
      if (b.totalLinhas !== a.totalLinhas) {
        return b.totalLinhas - a.totalLinhas
      }
      return a.vendedor.localeCompare(b.vendedor)
    })

    return rows
  }, [allVendorRows, debouncedSearch, selectedLoja, selectedReferenceDate])

  // Filtered rows sliced according to rankingLimit
  const filteredAndSorted = useMemo(() => {
    return candidateRowsBeforeSlice.slice(0, rankingLimit)
  }, [candidateRowsBeforeSlice, rankingLimit])

  // Summary Totals for Principais Ofensores
  const totals = useMemo(() => {
    return filteredAndSorted.reduce(
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
  }, [filteredAndSorted])

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
  // Top #1 Offender
  const top1Offender = useMemo(() => {
    return filteredAndSorted[0] || null
  }, [filteredAndSorted])

  // Share of Principais Ofensores vs Total General
  const top20Share = useMemo(() => {
    if (grandTotalLinhas === 0) return 0
    return ((totals.totalLinhas / grandTotalLinhas) * 100).toFixed(1)
  }, [totals.totalLinhas, grandTotalLinhas])

  // Effective Referente
  const effectiveReferente = useMemo(() => {
    if (
      selectedReferenceDate &&
      selectedReferenceDate !== 'all' &&
      selectedReferenceDate !== 'none'
    ) {
      return selectedReferenceDate
    }
    if (selectedReferenceDate === 'none') {
      return 'Sem referência'
    }
    const withRef = allVendorRows.find((r) => r.dataReferencia && r.dataReferencia.trim() !== '')
    return withRef?.dataReferencia || null
  }, [allVendorRows, selectedReferenceDate])

  // Export to Excel - exports only the sliced items (filteredAndSorted)
  const handleExportXlsx = () => {
    if (filteredAndSorted.length === 0) {
      toast({
        title: 'Nada a exportar',
        description: 'Nenhum vendedor encontrado com os filtros atuais.',
      })
      return
    }
    exportVendorsToXlsx(filteredAndSorted, totals, effectiveReferente || undefined, {
      sheetName: `Principais_${rankingLimit}_Ofensores`,
      filePrefix: `Ranking_${rankingLimit}_Principais_Ofensores_FPD`,
    })
    toast({
      title: 'Planilha exportada',
      description: `O ranking dos ${rankingLimit} principais ofensores foi exportado em .xlsx com sucesso.`,
    })
  }

  const hasActiveFilters =
    debouncedSearch !== '' ||
    (!userAccess.isGerente && selectedLoja !== 'all') ||
    selectedReferenceDate !== 'all'

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    if (!userAccess.isGerente) {
      setSelectedLoja('all')
    }
    setSelectedReferenceDate('all')
  }

  return (
    <div className="space-y-6">
      {/* Top summary cards banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Principais Ofensores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Principais Ofensores</span>
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#DC2626] tabular-nums">
                {filteredAndSorted.length}
              </span>
              <span className="text-xs text-[#5B6B82] font-medium">
                de {allVendorRows.length} vendedores
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
        </div>

        {/* Card 2: Total de Linhas nos Principais Ofensores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{rankingCardLabel}</span>
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {animatedTotalLinhas.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">linhas</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
        </div>

        {/* Card 3: % de Concentração dos Principais Ofensores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Concentração da Base
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#0891B2] tabular-nums">{top20Share}%</span>
              <span className="text-xs text-[#5B6B82]">do volume total</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0891B2]/10 text-[#0891B2] flex items-center justify-center">
            <Percent className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Maior Ofensor (#1) */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Maior Ofensor (#1)</span>
            </p>
            <div className="mt-1">
              <p
                className="text-sm font-bold text-[#12365A] truncate"
                title={top1Offender ? top1Offender.vendedor : 'Nenhum'}
              >
                {top1Offender ? top1Offender.vendedor : 'Nenhum'}
              </p>
              {top1Offender && (
                <span className="text-xs text-red-600 font-semibold">
                  {top1Offender.totalLinhas.toLocaleString('pt-BR')} linhas (
                  {top1Offender.loja || 'SEM LOJA'})
                </span>
              )}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Header com título dinâmico e aviso do limite por perfil */}
      <div className="bg-[#F0F5FC] border border-[#D5E2F1] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#12365A]">
        <div className="flex items-start sm:items-center gap-3">
          <span className="p-2 rounded-lg bg-amber-100 text-amber-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-[#12365A] tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <span>{rankingTitle}</span>
              </h2>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 bg-white border-[#CBD5E1] font-semibold text-[#12365A]"
              >
                Perfil {profileLabel}
              </Badge>
            </div>
            <p className="text-xs text-[#5B6B82] mt-0.5" data-testid="profile-limit-info">
              Exibindo {filteredAndSorted.length} de {candidateRowsBeforeSlice.length} possíveis —
              limite do perfil {profileLabel}: {rankingLimit}
            </p>
          </div>
        </div>

        {userAccess.isGerente && (
          <div className="flex items-center gap-1.5 text-xs text-[#12365A] bg-white border border-[#CBD5E1] px-3 py-1.5 rounded-lg shrink-0">
            <Store className="w-4 h-4 text-[#0E9F8A] shrink-0" />
            <span>
              Loja Vinculada:{' '}
              <strong className="uppercase">
                {managerAssignedStoreName || selectedLoja || 'Não identificada'}
              </strong>
            </span>
          </div>
        )}
      </div>

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
            <p className="text-amber-800 flex items-center gap-1.5 flex-wrap">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 inline-block" />
              <span>
                Seu perfil ainda não possui lojas vinculadas pelo Administrador. Para visualizar o
                ranking dos {rankingLimit} principais ofensores das suas lojas, solicite a
                vinculação à equipe administradora.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Empty State Banner when no records exist */}
      {!loading && allVendorRows.length === 0 && (
        <div className="bg-gradient-to-r from-[#12365A] to-[#1a4a7a] text-white rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-semibold tracking-wider uppercase border border-red-400/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Ranking dos {rankingLimit} Principais Ofensores</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 inline-block" />
              <span>Nenhum dado importado para o ranking de ofensores</span>
            </h2>
            <p className="text-sm text-slate-200 max-w-xl">
              Importe as planilhas <span className="text-white font-semibold">.xlsx</span> das lojas
              para ranquear automaticamente os vendedores com maior quantidade de linhas em atraso.
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
                placeholder="Buscar ofensor, loja ou supervisão..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A97AC] hover:text-[#12365A]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter: Data de Referência */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedReferenceDate}
                onChange={(e) => setSelectedReferenceDate(e.target.value)}
                className={cn(
                  'h-9 px-3 text-xs font-medium rounded-md border bg-white focus:outline-none focus:border-[#0E9F8A]',
                  selectedReferenceDate !== 'all'
                    ? 'border-[#0E9F8A] text-[#0E9F8A] bg-[#0E9F8A]/5 font-semibold'
                    : 'border-[#E3E9F2] text-[#12365A]',
                )}
              >
                <option value="all">Todas as referências</option>
                {availableReferenceDates.map((date) => (
                  <option key={date} value={date}>
                    Referência: {date}
                  </option>
                ))}
                <option value="none">Sem referência</option>
              </select>
            </div>

            {/* Filter Loja (Travado para Gerente, Dropdown para Supervisor/Coordenador/ADM) */}
            <div className="w-full sm:w-56">
              {userAccess.isGerente ? (
                <div
                  data-testid="locked-store-display"
                  className="h-9 px-3 rounded-md bg-[#F1F5F9] border border-[#CBD5E1] flex items-center gap-2 text-xs text-[#12365A]"
                  title="Loja vinculada ao perfil de Gerente"
                >
                  <Store className="w-3.5 h-3.5 text-[#0E9F8A] shrink-0" />
                  <span className="truncate">
                    Loja:{' '}
                    <strong className="uppercase">
                      {managerAssignedStoreName || selectedLoja || uniqueLojas[0] || 'Vinculada'}
                    </strong>
                  </span>
                </div>
              ) : (
                <select
                  value={selectedLoja}
                  onChange={(e) => setSelectedLoja(e.target.value)}
                  className="w-full h-9 text-xs rounded-md border border-[#E3E9F2] bg-[#F8FAFC] px-2.5 text-[#12365A] focus:outline-none focus:border-[#0E9F8A]"
                  aria-label="Selecionar Loja"
                >
                  <option value="all">Todas as Lojas ({uniqueLojas.length})</option>
                  {uniqueLojas.map((loja) => (
                    <option key={loja} value={loja}>
                      {loja}
                    </option>
                  ))}
                </select>
              )}
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

          {/* Right Action Buttons - Visível apenas para o perfil ADM (oculto para Gerente, Supervisor e Coordenador) */}
          {userAccess.isAdm && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleExportXlsx}
                variant="outline"
                className="h-9 border-[#E3E9F2] text-[#12365A] hover:bg-[#F3F6FA] font-medium text-xs sm:text-sm gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <Download className="w-4 h-4 text-[#0E9F8A]" />
                <span>Exportar Principais Ofensores (.xlsx)</span>
              </Button>
            </div>
          )}
        </div>

        {/* Tabela dos Principais Ofensores */}
        <div className="relative overflow-x-auto max-h-[70vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                {/* Ranking Position */}
                <th className="px-3 py-3.5 w-16 text-center border-r border-[#1e456f] bg-[#0E2A47]">
                  POS
                </th>
                {/* A - VENDEDOR (Sticky left) */}
                <th className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3.5 min-w-[200px] text-center border-r border-[#1e456f]">
                  <div className="flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>VENDEDOR OFENSOR</span>
                  </div>
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
                <th className="px-3 py-3.5 min-w-[120px] text-center border-r border-[#1e456f] bg-red-950/80 text-red-200">
                  <div className="flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>TOTAL LINHAS (OFENSORES)</span>
                  </div>
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
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Carregando ranking de ofensores...</span>
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[#5B6B82]">
                    {' '}
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <AlertTriangle className="w-8 h-8 text-amber-500" />
                      <p className="font-medium text-[#12365A] flex items-center justify-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>
                          {userAccess.hasNoStoreAssigned
                            ? 'Nenhuma loja vinculada ao seu usuário'
                            : 'Nenhum ofensor encontrado'}
                        </span>
                      </p>
                      <p className="text-xs text-[#5B6B82]">
                        {userAccess.hasNoStoreAssigned
                          ? 'Solicite ao Administrador que vincule uma ou mais lojas ao seu perfil para visualizar os dados de ofensores.'
                          : allVendorRows.length === 0
                            ? 'Importe arquivos .xlsx na aba Importar para gerar o ranking dos principais ofensores.'
                            : 'Tente ajustar os termos de busca ou o filtro de loja.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((row, idx) => {
                  const isTop3 = idx < 3
                  const badgeColor =
                    idx === 0
                      ? 'bg-amber-500 text-white shadow-xs'
                      : idx === 1
                        ? 'bg-slate-400 text-white shadow-xs'
                        : idx === 2
                          ? 'bg-amber-700 text-white shadow-xs'
                          : 'bg-red-50 text-red-700 font-bold border border-red-200'

                  return (
                    <tr
                      key={row.id || `${row.vendedor}-${row.loja}-${idx}`}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors group',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* POS */}
                      <td className="px-3 py-2.5 text-center font-bold border-r border-[#E3E9F2] bg-slate-50/70">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs',
                            badgeColor,
                          )}
                        >
                          #{idx + 1}
                        </span>
                      </td>

                      {/* A: VENDEDOR OFENSOR (Sticky left) */}
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3.5 py-2.5 font-bold text-[#12365A] border-r border-[#E3E9F2] max-w-[250px]',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          'group-hover:bg-[#F0F5FC]',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isTop3 && <Flame className="w-4 h-4 text-red-500 shrink-0" />}
                          <span className="truncate group-hover:text-red-600 transition-colors">
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

                      {/* D: TOTAL LINHAS (OFENSORES) */}
                      <td className="px-3 py-2.5 text-center font-extrabold text-red-700 tabular-nums border-r border-[#E3E9F2] bg-red-50/50">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-100 text-red-800 font-bold">
                          {row.totalLinhas.toLocaleString('pt-BR')}
                        </span>
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
            {!loading && filteredAndSorted.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-[#12365A] text-white font-bold text-[13px] shadow-lg border-t-2 border-red-500">
                <tr>
                  {/* POS */}
                  <td className="px-3 py-3 border-r border-[#1e456f] text-center text-xs font-black text-white uppercase tracking-wider bg-[#0E2A47]">
                    TOTAL
                  </td>
                  {/* A: Totais */}
                  <td className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3 border-r border-[#1e456f] text-white uppercase tracking-wider font-bold">
                    TOTAL ({filteredAndSorted.length})
                  </td>
                  {/* B: LOJA */}
                  <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                  {/* C: SUPERVISÃO */}
                  <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                  {/* D: TOTAL LINHAS */}
                  <td className="px-3 py-3 text-center text-red-200 tabular-nums border-r border-[#1e456f] bg-red-950 font-black">
                    {animatedTotalLinhas.toLocaleString('pt-BR')}
                  </td>
                  {/* E: 1. Fatura(s) Paga(s) */}
                  <td className="px-2.5 py-3 text-center text-[#67e8f9] tabular-nums border-r border-[#1e456f]">
                    {animatedFaturaPaga.toLocaleString('pt-BR')}
                  </td>
                  {/* F: 2. Não Tratados */}
                  <td className="px-2.5 py-3 text-center text-[#fdba74] tabular-nums border-r border-[#1e456f]">
                    {animatedNaoTratados.toLocaleString('pt-BR')}
                  </td>
                  {/* G: 3. Pendente */}
                  <td className="px-2.5 py-3 text-center text-[#fca5a5] tabular-nums border-r border-[#1e456f]">
                    {animatedPendente.toLocaleString('pt-BR')}
                  </td>
                  {/* H: 4. Enviado Fatura(s) */}
                  <td className="px-2.5 py-3 text-center text-[#4ade80] tabular-nums border-r border-[#1e456f]">
                    {animatedEnvioFatura.toLocaleString('pt-BR')}
                  </td>
                  {/* I: 5. Promessa de Pagto. */}
                  <td className="px-2.5 py-3 text-center text-[#d8b4fe] tabular-nums border-r border-[#1e456f]">
                    {animatedPromessaPagto.toLocaleString('pt-BR')}
                  </td>
                  {/* J: 6. Sem Contato */}
                  <td className="px-2.5 py-3 text-center text-[#cbd5e1] tabular-nums border-r border-[#1e456f]">
                    {animatedSemContato.toLocaleString('pt-BR')}
                  </td>
                  {/* K: 7. Cancelados */}
                  <td className="px-2.5 py-3 text-center text-slate-300 tabular-nums border-r border-[#1e456f]">
                    {animatedCancelados.toLocaleString('pt-BR')}
                  </td>
                  {/* L: 8. Contato Realizado */}
                  <td className="px-2.5 py-3 text-center text-[#5eead4] tabular-nums border-r border-[#1e456f]">
                    {animatedContatoRealizado.toLocaleString('pt-BR')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

export default TopOfensores
