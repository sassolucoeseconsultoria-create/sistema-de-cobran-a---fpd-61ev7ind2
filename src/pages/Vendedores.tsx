import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Download,
  X,
  RotateCcw,
  UploadCloud,
  AlertCircle,
  Users,
  TrendingUp,
  Building2,
  Trash2,
  Calendar,
  Store,
  Smartphone,
  Home,
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
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import { useCountUp } from '@/hooks/useCountUp'
import pb from '@/lib/pocketbase/client'
import {
  fetchVendorConsolidations,
  clearAllVendorConsolidations,
  fetchStores,
  matchStore,
  fetchDistinctReferenceDates,
} from '@/services/fpdService'
import { exportVendorsToXlsx } from '@/lib/xlsxExport'
import { getStoreVariants, buildStoreFilterClause, isSameStore } from '@/lib/storeMatchingUtils'
import {
  FPD_STATUSES,
  type VendorConsolidationRecord,
  type VendorRow,
  type StoreRecord,
  type MovelRecord,
  type ResidencialRecord,
} from '@/types/fpd'
import { cn } from '@/lib/utils'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'

export const Vendedores: React.FC = () => {
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
  const [selectedLoja, setSelectedLoja] = useState<string>(() => {
    if (userAccess.isGerente) {
      if (userAccess.hasNoStoreAssigned) return ''
      if (userAccess.managerStoreId) return userAccess.managerStoreId
    }
    return 'all'
  })

  // Client counts from collections `movel` and `residencial`
  const [totalMovel, setTotalMovel] = useState(0)
  const [totalResidencial, setTotalResidencial] = useState(0)

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
  const loadData = useCallback(async () => {
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

      // Se for Gerente e possuir managerStoreId, pré-ajustar selectedLoja
      if (userAccess.isGerente && !userAccess.hasNoStoreAssigned) {
        if (userAccess.managerStoreId) {
          const matchedStore = fetchedStores.find((s) => s.id === userAccess.managerStoreId)
          if (matchedStore?.name?.trim()) {
            setSelectedLoja(matchedStore.name.trim())
          }
        }
      }
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
  }, [userAccess.isGerente, userAccess.hasNoStoreAssigned, userAccess.managerStoreId, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  // Normalize vendor rows - filtering strictly by user's permitted stores
  const vendorRows: VendorRow[] = useMemo(() => {
    if (userAccess.hasNoStoreAssigned) return []

    return records
      .filter((r) => {
        if (userAccess.isAdm) return true
        return userAccess.isStoreNameAllowed(r.loja, stores)
      })
      .map((r) => {
        // Find supervision if missing
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
    if (vendorRows.length > 0) {
      const firstWithLoja = vendorRows.find((r) => r.loja && r.loja.trim() !== '')
      if (firstWithLoja) return firstWithLoja.loja.trim()
    }

    // 3. Fallback: allowedStoreIds
    if (userAccess.allowedStoreIds.length > 0) {
      return userAccess.allowedStoreIds[0]
    }

    return null
  }, [userAccess, stores, vendorRows])

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
      for (const r of vendorRows) {
        if (r.loja && r.loja.trim() !== '' && userAccess.isStoreNameAllowed(r.loja, stores)) {
          set.add(r.loja.trim())
        }
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    }

    for (const r of vendorRows) {
      if (r.loja && r.loja.trim() !== '') {
        set.add(r.loja.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [vendorRows, userAccess, stores])

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

  // Effective store to query/display
  const effectiveStore = useMemo(() => {
    if (userAccess.isGerente) {
      return managerAssignedStoreName || selectedLoja || ''
    }
    return selectedLoja
  }, [userAccess.isGerente, managerAssignedStoreName, selectedLoja])

  // Build PB filter string for counting a collection based on store, profile and reference date
  const buildCountFilter = useCallback(
    (loja: string, allowedLojas: string[]) => {
      if (userAccess.hasNoStoreAssigned) {
        return '__NO_ACCESS__'
      }

      const filterParts: string[] = []

      // Se for Gerente e loja for TODAS ou all ou vazia, nunca contar todas as lojas da rede
      if (userAccess.isGerente && (!loja || loja === 'all' || loja === 'TODAS')) {
        return '__NO_ACCESS__'
      }

      if (loja && loja !== 'all' && loja !== 'TODAS') {
        if (!userAccess.isAdm && !userAccess.isStoreNameAllowed(loja, stores)) {
          return '__NO_ACCESS__'
        }

        const storeClause = buildStoreFilterClause(loja)
        if (storeClause) {
          filterParts.push(storeClause)
        }
      } else if (!userAccess.isAdm) {
        // Se usuário não é ADM e TODAS / all está selecionado, somar todas as lojas do escopo do perfil
        const expandedStoreNames = new Set<string>()

        // 1. Variantes das lojas detectadas no escopo
        for (const l of allowedLojas) {
          if (!l || !l.trim()) continue
          const variants = getStoreVariants(l)
          variants.forEach((v) => expandedStoreNames.add(v))
        }

        // 2. Variantes das lojas oficiais vinculadas ao perfil
        const allowedOfficialStores = stores.filter((s) => userAccess.isStoreIdAllowed(s.id))
        for (const s of allowedOfficialStores) {
          if (!s.name || !s.name.trim()) continue
          const variants = getStoreVariants(s.name)
          variants.forEach((v) => expandedStoreNames.add(v))
        }

        if (expandedStoreNames.size > 0) {
          const storeFilters = Array.from(expandedStoreNames).map(
            (l) => `loja = "${l.replace(/"/g, '\\"')}"`,
          )
          filterParts.push(`(${storeFilters.join(' || ')})`)
        } else {
          return '__NO_ACCESS__'
        }
      }
      // Se userAccess.isAdm e loja === 'all' / 'TODAS', não adiciona cláusula de loja => soma todas as lojas da base

      if (selectedReferenceDate && selectedReferenceDate !== 'all') {
        if (selectedReferenceDate === 'none') {
          filterParts.push(`(data_referencia = "" || data_referencia = null)`)
        } else {
          const escapedRef = selectedReferenceDate.replace(/"/g, '\\"')
          filterParts.push(
            `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
          )
        }
      }

      return filterParts.length > 0 ? filterParts.join(' && ') : undefined
    },
    [userAccess, stores, selectedReferenceDate],
  )

  // Recalculate Móvel count
  const refreshMovelCount = useCallback(async () => {
    if (userAccess.hasNoStoreAssigned) {
      setTotalMovel(0)
      return
    }

    let targetLoja = effectiveStore
    if (userAccess.isGerente) {
      if (managerAssignedStoreName) {
        targetLoja = managerAssignedStoreName
      } else if (
        !targetLoja ||
        targetLoja === 'all' ||
        targetLoja === 'TODAS' ||
        !userAccess.isStoreNameAllowed(targetLoja, stores)
      ) {
        const directMatch = stores.find((s) => userAccess.isStoreIdAllowed(s.id))
        if (directMatch?.name) {
          targetLoja = directMatch.name
        } else {
          setTotalMovel(0)
          return
        }
      }
    }

    const effectiveAllowed =
      uniqueLojas.length > 0
        ? uniqueLojas
        : managerAssignedStoreName
          ? [managerAssignedStoreName]
          : []

    const filter = buildCountFilter(targetLoja, effectiveAllowed)
    if (filter === '__NO_ACCESS__') {
      setTotalMovel(0)
      return
    }

    try {
      const res = await pb.collection('movel').getList(1, 1, {
        fields: 'id',
        filter,
        requestKey: null,
      })
      setTotalMovel(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao contar clientes móvel em Vendedores:', err)
      setTotalMovel(0)
    }
  }, [userAccess, effectiveStore, managerAssignedStoreName, stores, uniqueLojas, buildCountFilter])

  // Recalculate Residencial count
  const refreshResidencialCount = useCallback(async () => {
    if (userAccess.hasNoStoreAssigned) {
      setTotalResidencial(0)
      return
    }

    let targetLoja = effectiveStore
    if (userAccess.isGerente) {
      if (managerAssignedStoreName) {
        targetLoja = managerAssignedStoreName
      } else if (
        !targetLoja ||
        targetLoja === 'all' ||
        targetLoja === 'TODAS' ||
        !userAccess.isStoreNameAllowed(targetLoja, stores)
      ) {
        const directMatch = stores.find((s) => userAccess.isStoreIdAllowed(s.id))
        if (directMatch?.name) {
          targetLoja = directMatch.name
        } else {
          setTotalResidencial(0)
          return
        }
      }
    }

    const effectiveAllowed =
      uniqueLojas.length > 0
        ? uniqueLojas
        : managerAssignedStoreName
          ? [managerAssignedStoreName]
          : []

    const filter = buildCountFilter(targetLoja, effectiveAllowed)
    if (filter === '__NO_ACCESS__') {
      setTotalResidencial(0)
      return
    }

    try {
      const res = await pb.collection('residencial').getList(1, 1, {
        fields: 'id',
        filter,
        requestKey: null,
      })
      setTotalResidencial(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao contar clientes residencial em Vendedores:', err)
      setTotalResidencial(0)
    }
  }, [userAccess, effectiveStore, managerAssignedStoreName, stores, uniqueLojas, buildCountFilter])

  useEffect(() => {
    refreshMovelCount()
  }, [refreshMovelCount])

  useEffect(() => {
    refreshResidencialCount()
  }, [refreshResidencialCount])

  // Realtime subscription to `movel` and `residencial` for live count updates
  useRealtime<MovelRecord>('movel', () => {
    refreshMovelCount()
  })

  useRealtime<ResidencialRecord>('residencial', () => {
    refreshResidencialCount()
  })

  // Filtered rows
  const filteredRows = useMemo(() => {
    return vendorRows.filter((row) => {
      // Search
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchVendedor = row.vendedor.toLowerCase().includes(q)
        const matchLoja = (row.loja || '').toLowerCase().includes(q)
        const matchSuper = (row.supervisao || '').toLowerCase().includes(q)
        if (!matchVendedor && !matchLoja && !matchSuper) return false
      }

      // Filter Loja
      const activeLoja = effectiveStore
      if (activeLoja !== 'all' && activeLoja !== '') {
        if (row.loja !== activeLoja && !isSameStore(row.loja, activeLoja)) return false
      }

      // Filter Reference Date
      if (selectedReferenceDate !== 'all') {
        if (selectedReferenceDate === 'none') {
          if (row.dataReferencia && row.dataReferencia.trim() !== '') return false
        } else {
          if (row.dataReferencia !== selectedReferenceDate) return false
        }
      }

      return true
    })
  }, [vendorRows, debouncedSearch, effectiveStore, selectedReferenceDate])

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
  const animatedTotalMovel = useCountUp(totalMovel)
  const animatedTotalResidencial = useCountUp(totalResidencial)

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
    return new Set(filteredRows.map((r) => r.vendedor)).size
  }, [filteredRows])

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
    const withRef = vendorRows.find((r) => r.dataReferencia && r.dataReferencia.trim() !== '')
    return withRef?.dataReferencia || null
  }, [vendorRows, selectedReferenceDate])

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
    exportVendorsToXlsx(filteredRows, totals, effectiveReferente || undefined)
    toast({
      title: 'Planilha exportada',
      description: 'O arquivo .xlsx do ranking por vendedor foi gerado.',
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

  const displayedStoreName = managerAssignedStoreName || selectedLoja || uniqueLojas[0] || ''

  return (
    <div className="space-y-6">
      {/* Top summary cards banner - including Clientes Móvel e Clientes Residencial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Card 1: Total de Vendedores */}
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Vendedores
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {distinctVendedoresCount}
              </span>
              <span className="text-xs text-[#0E9F8A] font-medium">
                {filteredRows.length} linhas
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#12365A]/5 text-[#12365A] flex items-center justify-center">
            <Users className="w-5 h-5 text-[#0E9F8A]" />
          </div>
        </div>

        {/* Card 2: Clientes Móvel (solicitado pela regra do usuário) */}
        <div
          data-testid="card-clientes-movel"
          className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#12365A]">
              Clientes Móvel
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {animatedTotalMovel.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">em carteira</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#12365A]/10 text-[#12365A] flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-[#12365A]" />
          </div>
        </div>

        {/* Card 3: Clientes Residencial (solicitado pela regra do usuário) */}
        <div
          data-testid="card-clientes-residencial"
          className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0E9F8A]">
              Clientes Residencial
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#0E9F8A] tabular-nums">
                {animatedTotalResidencial.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">em carteira</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0E9F8A]/10 text-[#0E9F8A] flex items-center justify-center">
            <Home className="w-5 h-5 text-[#0E9F8A]" />
          </div>
        </div>

        {/* Card 4: Total de Linhas */}
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

        {/* Card 5: Loja com mais vendedores */}
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

        {/* Card 6: Faturas Pagas */}
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

      {/* Usuário sem loja vinculada (Gerente, Supervisor ou Coordenador) - aviso amigável */}
      {!userAccess.isAdm && userAccess.hasNoStoreAssigned && (
        <div
          data-testid="gerente-sem-loja-banner"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">
              Nenhuma loja vinculada ao seu perfil de {userAccess.userRole || 'acesso'}
            </p>
            <p className="text-amber-800">
              Seu perfil ainda não possui lojas vinculadas pelo Administrador. Para visualizar o
              ranking de vendedores e os dados de clientes (Móvel e Residencial) das suas lojas,
              solicite a vinculação à equipe administradora.
            </p>
          </div>
        </div>
      )}

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
                placeholder="Buscar vendedor, loja ou supervisão..."
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
                  <Building2 className="w-3.5 h-3.5 text-[#0E9F8A] shrink-0" />
                  <span className="truncate">
                    Loja:{' '}
                    <strong className="uppercase">
                      {displayedStoreName || 'Não identificada'}
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
                  <td colSpan={12} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando dados dos vendedores...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#5B6B82]">
                    {' '}
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-medium text-[#12365A]">
                        {userAccess.hasNoStoreAssigned
                          ? 'Nenhuma loja vinculada ao seu usuário'
                          : 'Nenhum vendedor encontrado'}
                      </p>
                      <p className="text-xs text-[#5B6B82]">
                        {userAccess.hasNoStoreAssigned
                          ? 'Solicite ao Administrador que vincule uma ou mais lojas ao seu perfil para visualizar os dados de vendedores.'
                          : vendorRows.length === 0
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
                {/* L: 8. Não Tratados */}
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
