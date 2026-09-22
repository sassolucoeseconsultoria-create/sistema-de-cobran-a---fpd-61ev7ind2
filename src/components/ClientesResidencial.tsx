import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  RotateCcw,
  RefreshCw,
  Calendar,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Store,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { isFaturaPagaOcorrencia, sortClientesByOcorrencia } from '@/lib/ocorrenciasSorting'
import pb, { isSessionExpiredError } from '@/lib/pocketbase/client'
import { OCORRENCIAS_OPTIONS, type ResidencialRecord, type OcorrenciaType } from '@/types/fpd'
import {
  applyDateMask,
  formatCpf,
  formatExcelOrIsoDateShort,
  formatPhone,
  getDadosField,
} from '@/lib/clientFormatters'
import { updateClientManualFields } from '@/services/relacionamentoService'
import { cn } from '@/lib/utils'
import { getStoreVariants, buildStoreFilterClause, isSameStore } from '@/lib/storeMatchingUtils'

import type { StoreRecord } from '@/types/fpd'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
import { useAllowedReferenceDates } from '@/hooks/useAllowedReferenceDates'

interface ClientesResidencialProps {
  availableLojas: string[]
  stores?: StoreRecord[]
  dataReferencia?: string
  selectedLoja?: string
  onLojaChange?: (loja: string) => void
}

export const ClientesResidencial: React.FC<ClientesResidencialProps> = ({
  availableLojas,
  stores = [],
  dataReferencia,
  selectedLoja: controlledLoja,
  onLojaChange,
}) => {
  const { toast } = useToast()
  const { allowedReferenceDates, isDateAllowed } = useAllowedReferenceDates()

  const [records, setRecords] = useState<ResidencialRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [internalLoja, setInternalLoja] = useState('TODAS')

  const selectedLoja = controlledLoja !== undefined ? controlledLoja : internalLoja
  const setSelectedLoja = useCallback(
    (newLoja: string) => {
      if (onLojaChange) {
        onLojaChange(newLoja)
      } else {
        setInternalLoja(newLoja)
      }
    },
    [onLojaChange],
  )

  // Inline edit state
  const [editValues, setEditValues] = useState<
    Record<string, { ocorrencias: string; data_promessa_de_pagto: string; comentarios: string }>
  >({})
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saved' | 'error' | 'saving'>>({})

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const userAccess = useUserStoreAccess()

  // If selected store becomes invalid under user's permissions, reset to TODAS (para não-Gerente) ou loja do Gerente
  useEffect(() => {
    if (userAccess.isAdm) return

    if (userAccess.isGerente) {
      if (userAccess.hasNoStoreAssigned) {
        if (selectedLoja !== '') {
          setSelectedLoja('')
          setPage(1)
        }
        return
      }

      // Se o Gerente está com 'TODAS' ou com uma loja não permitida, ajustar para a loja vinculada
      if (selectedLoja === 'TODAS' || !userAccess.isStoreNameAllowed(selectedLoja, stores)) {
        if (availableLojas.length > 0) {
          setSelectedLoja(availableLojas[0])
          setPage(1)
        }
      }
      return
    }

    if (selectedLoja !== 'TODAS' && !userAccess.isStoreNameAllowed(selectedLoja, stores)) {
      setSelectedLoja('TODAS')
      setPage(1)
    }
  }, [selectedLoja, userAccess, stores, availableLojas, setSelectedLoja])
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (userAccess.hasNoStoreAssigned) {
        setRecords([])
        setTotalItems(0)
        setTotalPages(1)
        return
      }

      const filterParts: string[] = []

      // If user selected a specific store
      if (selectedLoja && selectedLoja !== 'TODAS') {
        // Non-ADM users can only select stores they have access to
        if (!userAccess.isAdm && !userAccess.isStoreNameAllowed(selectedLoja, stores)) {
          setRecords([])
          setTotalItems(0)
          setTotalPages(1)
          return
        }

        const storeClause = buildStoreFilterClause(selectedLoja)
        if (storeClause) {
          filterParts.push(storeClause)
        }
      } else if (!userAccess.isAdm) {
        // Se usuário não é ADM e TODAS está selecionado, filtrar por todas as lojas permitidas
        const expandedStoreNames = new Set<string>()

        // 1. Variantes das lojas em availableLojas (filtrando para garantir que são permitidas)
        for (const l of availableLojas) {
          if (!l || !l.trim()) continue
          if (!userAccess.isStoreNameAllowed(l, stores)) continue
          const variants = getStoreVariants(l)
          variants.forEach((v) => {
            if (userAccess.isStoreNameAllowed(v, stores)) {
              expandedStoreNames.add(v)
            }
          })
        }

        // 2. Variantes das lojas oficiais vinculadas ao perfil
        const allowedOfficialStores = stores.filter((s) => userAccess.isStoreIdAllowed(s.id))
        for (const s of allowedOfficialStores) {
          if (!s.name || !s.name.trim()) continue
          const variants = getStoreVariants(s.name)
          variants.forEach((v) => {
            if (userAccess.isStoreNameAllowed(v, stores)) {
              expandedStoreNames.add(v)
            }
          })
        }

        if (expandedStoreNames.size > 0) {
          const storeFilters = Array.from(expandedStoreNames).map(
            (l) => `loja = "${l.replace(/"/g, '\\"')}"`,
          )
          filterParts.push(`(${storeFilters.join(' || ')})`)
        } else {
          // Nenhuma loja permitida encontrada para o perfil
          setRecords([])
          setTotalItems(0)
          setTotalPages(1)
          return
        }
      }
      // Se userAccess.isAdm e selectedLoja === 'TODAS', não filtra por loja no backend => traz todas as lojas

      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim().replace(/"/g, '\\"')
        filterParts.push(
          `(loja ~ "${s}" || vendedor ~ "${s}" || cliente ~ "${s}" || cpf ~ "${s}" || nr_contrato ~ "${s}" || arquivo ~ "${s}")`,
        )
      }

      if (dataReferencia === 'NONE') {
        setRecords([])
        setTotalItems(0)
        setTotalPages(1)
        return
      }

      if (dataReferencia && dataReferencia !== 'TODAS') {
        const escapedRef = dataReferencia.replace(/"/g, '\\"')
        // Fallback for legacy records with empty or unset data_referencia
        filterParts.push(
          `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
        )
      } else if (dataReferencia === 'TODAS' && !userAccess.isAdm) {
        if (allowedReferenceDates.length === 0) {
          setRecords([])
          setTotalItems(0)
          setTotalPages(1)
          return
        }
        const refClauses = allowedReferenceDates.map(
          (d) => `data_referencia = "${d.trim().replace(/"/g, '\\"')}"`,
        )
        filterParts.push(`(${refClauses.join(' || ')})`)
      }

      const filterStr = filterParts.length > 0 ? filterParts.join(' && ') : undefined

      const res = await pb.collection('residencial').getList<ResidencialRecord>(page, perPage, {
        filter: filterStr,
        sort: '-created',
        requestKey: null,
      })

      // Se não é ADM, reter apenas os registros das lojas permitidas
      let filteredItems = userAccess.isAdm
        ? res.items
        : res.items.filter((item) => {
            if (!userAccess.isStoreNameAllowed(item.loja, stores)) return false
            if (dataReferencia === 'TODAS' && !isDateAllowed(item.data_referencia)) return false
            return true
          })

      // Salvaguarda exclusiva para quando uma loja ESPECÍFICA está selecionada
      if (selectedLoja && selectedLoja !== 'TODAS') {
        filteredItems = filteredItems.filter((item) => {
          return isSameStore(item.loja, selectedLoja)
        })
      }

      // Reordenar a lista: não-pagas primeiro, "Fatura(s) Paga(s)" sempre ao final da lista
      const sortedItems = sortClientesByOcorrencia(filteredItems)

      setRecords(sortedItems)

      // Total de itens: quando TODAS está selecionado, totalItems é a soma exata vinda do backend
      let accurateTotal = res.totalItems
      if (selectedLoja && selectedLoja !== 'TODAS') {
        if (sortedItems.length === 0 && page === 1) {
          accurateTotal = 0
        }
      }

      setTotalItems(accurateTotal)
      setTotalPages(Math.max(1, Math.ceil(accurateTotal / perPage)))

      // Initialize edit values
      const initialEdits: Record<
        string,
        { ocorrencias: string; data_promessa_de_pagto: string; comentarios: string }
      > = {}
      sortedItems.forEach((item) => {
        const itemOcorrencia = item.ocorrencias || 'Não Tratados'
        initialEdits[item.id] = {
          ocorrencias: itemOcorrencia,
          data_promessa_de_pagto: item.data_promessa_de_pagto || '',
          comentarios: item.comentarios || '',
        }
      })
      setEditValues(initialEdits)
    } catch (err) {
      if (isSessionExpiredError(err)) {
        return
      }
      console.error('Erro ao carregar clientes residencial:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a lista de clientes residencial.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [
    page,
    perPage,
    debouncedSearch,
    selectedLoja,
    availableLojas,
    stores,
    userAccess,
    dataReferencia,
    allowedReferenceDates,
    isDateAllowed,
    toast,
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Save manual fields inline
  const handleSaveField = async (
    id: string,
    overrideFields?: Partial<{
      ocorrencias: string
      data_promessa_de_pagto: string
      comentarios: string
    }>,
  ) => {
    const currentEdit = {
      ...(editValues[id] || {
        ocorrencias: 'Não Tratados',
        data_promessa_de_pagto: '',
        comentarios: '',
      }),
      ...(overrideFields || {}),
    }

    const originalRecord = records.find((r) => r.id === id)
    if (!originalRecord) return

    const origOcorrencias = originalRecord.ocorrencias || 'Não Tratados'
    const origPromessa = originalRecord.data_promessa_de_pagto || ''
    const origComentarios = originalRecord.comentarios || ''

    // If unchanged, skip save
    if (
      origOcorrencias === (currentEdit.ocorrencias || 'Não Tratados') &&
      origPromessa === (currentEdit.data_promessa_de_pagto || '') &&
      origComentarios === (currentEdit.comentarios || '')
    ) {
      return
    }

    setSavingRecordId(id)
    setSaveStatus((prev) => ({ ...prev, [id]: 'saving' }))

    try {
      await updateClientManualFields(id, 'Residencial', {
        ocorrencias: currentEdit.ocorrencias,
        data_promessa_de_pagto: currentEdit.data_promessa_de_pagto,
        comentarios: currentEdit.comentarios,
      })

      // Update local record to reflect changes
      const wasPaga = isFaturaPagaOcorrencia(origOcorrencias)
      const nowPaga = isFaturaPagaOcorrencia(currentEdit.ocorrencias)

      setRecords((prev) => {
        const updated = prev.map((r) =>
          r.id === id
            ? {
                ...r,
                ocorrencias: currentEdit.ocorrencias,
                data_promessa_de_pagto: currentEdit.data_promessa_de_pagto,
                comentarios: currentEdit.comentarios,
              }
            : r,
        )
        // Se mudou o status de fatura paga ou se é fatura paga, reordenar para reposicionar imediatamente
        return sortClientesByOcorrencia(updated)
      })

      // Toast discreto em PT-BR quando a ocorrência for alterada para Fatura(s) Paga(s) ou mudar de posição
      if (nowPaga && !wasPaga) {
        toast({
          title: 'Ocorrência atualizada',
          description: 'Cliente marcado como Fatura(s) Paga(s) e movido para o final da lista.',
        })
      } else if (!nowPaga && wasPaga) {
        toast({
          title: 'Ocorrência atualizada',
          description: 'Ocorrência alterada e cliente reposicionado na lista.',
        })
      }

      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => {
        setSaveStatus((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }, 2500)
    } catch (err) {
      console.error('Erro ao salvar campos de cliente residencial:', err)
      setSaveStatus((prev) => ({ ...prev, [id]: 'error' }))
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar os dados manuais.',
        variant: 'destructive',
      })
    } finally {
      setSavingRecordId(null)
    }
  }

  // Handle ocorrencia change with immediate save
  const handleOcorrenciaChange = async (id: string, val: string) => {
    setEditValues((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          ocorrencias: 'Não Tratados',
          data_promessa_de_pagto: '',
          comentarios: '',
        }),
        ocorrencias: val,
      },
    }))
    await handleSaveField(id, { ocorrencias: val })
  }

  // Handle date change with mask
  const handleDateChange = (id: string, rawVal: string) => {
    const masked = applyDateMask(rawVal)
    setEditValues((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { ocorrencias: 'Não Tratados', comentarios: '' }),
        data_promessa_de_pagto: masked,
      },
    }))
  }

  // Handle comment change
  const handleCommentChange = (id: string, val: string) => {
    setEditValues((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { ocorrencias: 'Não Tratados', data_promessa_de_pagto: '' }),
        comentarios: val,
      },
    }))
  }

  const hasActiveFilters = debouncedSearch !== '' || selectedLoja !== 'TODAS'

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E3E9F2] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por contrato, CPF, cliente, loja..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A97AC] hover:text-[#12233A]"
              >
                ×
              </button>
            )}
          </div>

          {/* Loja selector */}
          {availableLojas.length > 0 && (
            <div className="w-full sm:w-56">
              {userAccess.isGerente ? (
                <div className="h-9 px-3 rounded-md bg-[#F1F5F9] border border-[#CBD5E1] flex items-center gap-2 text-xs text-[#12365A]">
                  <Store className="w-3.5 h-3.5 text-[#0E9F8A] shrink-0" />
                  <span className="truncate">
                    Loja: <strong className="uppercase">{selectedLoja || availableLojas[0]}</strong>
                  </span>
                </div>
              ) : (
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
              )}
            </div>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                if (!userAccess.isGerente) {
                  setSelectedLoja('TODAS')
                }
                setPage(1)
              }}
              className="h-9 text-xs text-[#5B6B82] hover:text-[#12233A] gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar filtros</span>
            </Button>
          )}
        </div>

        {/* Refresh & Pagination size */}
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 text-xs text-[#12365A] border-[#E3E9F2] hover:bg-slate-50 gap-1.5"
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-[#0E9F8A]', loading && 'animate-spin')} />
            <span>Atualizar</span>
          </Button>

          <div className="flex items-center gap-1.5 text-xs text-[#5B6B82]">
            <span>Exibir:</span>
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="h-8 text-xs rounded-md border border-[#E3E9F2] bg-white px-2 text-[#12365A]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Clientes Residencial Table */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        <div className="relative overflow-x-auto max-h-[65vh]">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                <th className="px-3 py-3.5 text-center w-12 border-r border-[#1e456f]">#</th>
                <th className="px-3.5 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  NR_CONTRATO
                </th>
                <th className="px-3.5 py-3.5 min-w-[180px] text-center border-r border-[#1e456f]">
                  DSC_STATUS_CONTRATO
                </th>
                <th className="px-3.5 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  DAT_VENCIMENTO
                </th>
                <th className="px-3.5 py-3.5 min-w-[90px] text-center border-r border-[#1e456f]">
                  Pago
                </th>
                <th className="px-3.5 py-3.5 min-w-[120px] text-center border-r border-[#1e456f]">
                  Preventiva FPD
                </th>
                <th className="px-3.5 py-3.5 min-w-[110px] text-center border-r border-[#1e456f]">
                  Virou FPD
                </th>
                <th className="px-3.5 py-3.5 min-w-[140px] text-center border-r border-[#1e456f]">
                  CPF
                </th>
                <th className="px-3.5 py-3.5 min-w-[200px] text-center border-r border-[#1e456f]">
                  CLIENTE
                </th>
                <th className="px-3.5 py-3.5 min-w-[130px] text-center border-r border-[#1e456f]">
                  FONE
                </th>
                <th className="px-3.5 py-3.5 min-w-[160px] text-center border-r border-[#1e456f]">
                  LOJA
                </th>
                <th className="px-3.5 py-3.5 min-w-[160px] text-center border-r border-[#1e456f]">
                  VENDEDOR
                </th>
                <th className="px-3.5 py-3.5 min-w-[185px] text-center border-r border-[#1e456f]">
                  Ocorrências
                </th>
                <th className="px-3.5 py-3.5 min-w-[170px] text-center border-r border-[#1e456f]">
                  Data Promessa de Pagto
                </th>
                <th className="px-3.5 py-3.5 min-w-[240px] text-center">Comentários</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-7 h-7 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs sm:text-sm">
                        Carregando lista de clientes residencial...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <p className="font-bold text-[#12365A] text-sm">
                        Nenhum cliente residencial encontrado.
                      </p>
                      <p className="text-xs text-[#5B6B82]">
                        Importe uma planilha na aba analítica para popular a lista de clientes.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((row, idx) => {
                  const d = row.dados || {}

                  // Deriving columns strictly matching requirements:
                  // NR_CONTRATO, DSC_STATUS_CONTRATO, DAT_VENCIMENTO, Pago, Preventiva FPD, Virou FPD, CPF, CLIENTE, FONE, LOJA, VENDEDOR, Ocorrências, Data Promessa de Pagto, Comentários

                  const nrContrato =
                    row.nr_contrato ||
                    getDadosField(
                      d,
                      'NR_CONTRATO',
                      'NR CONTRATO',
                      'CONTRATO',
                      'Numero Contrato',
                      'Contrato',
                    ) ||
                    '—'

                  const dscStatus =
                    row.dsc_status_contrato ||
                    getDadosField(
                      d,
                      'DSC_STATUS_CONTRATO',
                      'DSC STATUS CONTRATO',
                      'Status Contrato',
                      'STATUS',
                    ) ||
                    '—'

                  const rawVencimento =
                    row.dat_vencimento ||
                    getDadosField(
                      d,
                      'DAT_VENCIMENTO',
                      'DAT VENCIMENTO',
                      'Vencimento',
                      'Data Vencimento',
                      'Maior atraso',
                      'MAIOR ATRASO',
                      'Maior Atraso',
                      'Atraso',
                    ) ||
                    ''
                  const datVencimento = rawVencimento
                    ? formatExcelOrIsoDateShort(rawVencimento) || String(rawVencimento)
                    : '—'

                  const pagoVal =
                    row.pago || getDadosField(d, 'Pago', 'PAGO', 'Paga', 'Fatura Paga') || '—'

                  const preventivaFpd =
                    row.preventiva_fpd ||
                    getDadosField(
                      d,
                      'Preventiva FPD',
                      'PREVENTIVA FPD',
                      'Preventiva_FPD',
                      'PREVENTIVA',
                    ) ||
                    '—'

                  const virouFpd =
                    row.virou_fpd ||
                    getDadosField(d, 'Virou FPD', 'VIROU FPD', 'Virou_FPD', 'VIROU', 'FPD') ||
                    '—'

                  const rawCpf =
                    row.cpf || getDadosField(d, 'CPF', 'Cpf', 'CNPJ', 'Documento', 'DOC') || ''
                  const cpf = rawCpf ? formatCpf(rawCpf) : '—'

                  const cliente =
                    row.cliente ||
                    getDadosField(d, 'CLIENTE', 'Cliente', 'NOME', 'Nome', 'Razão Social') ||
                    '—'

                  const rawFone =
                    row.fone ||
                    getDadosField(
                      d,
                      'FONE',
                      'Fone',
                      'Telefone',
                      'TELEFONE',
                      'Celular',
                      'CELULAR',
                    ) ||
                    ''
                  const fone = rawFone ? formatPhone(rawFone) : '—'

                  const loja =
                    row.loja || getDadosField(d, 'LOJA', 'Loja', 'LOCAL', 'Local', 'Filial') || '—'

                  const vendedor =
                    row.vendedor ||
                    getDadosField(d, 'VENDEDOR', 'Vendedor', 'Consultor', 'Operador') ||
                    '—'

                  const edit = editValues[row.id] || {
                    ocorrencias: row.ocorrencias || 'Não Tratados',
                    data_promessa_de_pagto: row.data_promessa_de_pagto || '',
                    comentarios: row.comentarios || '',
                  }

                  const rowStatus = saveStatus[row.id]
                  const isSavingThis = savingRecordId === row.id

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* # Index */}
                      <td className="px-3 py-3 text-center text-xs text-slate-400 font-mono border-r border-[#E3E9F2]">
                        {(page - 1) * perPage + idx + 1}
                      </td>

                      {/* NR_CONTRATO */}
                      <td className="px-3.5 py-3 font-mono text-xs font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                        {nrContrato}
                      </td>

                      {/* DSC_STATUS_CONTRATO */}
                      <td className="px-3.5 py-3 text-xs border-r border-[#E3E9F2]">
                        {dscStatus !== '—' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-slate-50 border-slate-200 text-slate-700"
                          >
                            {dscStatus}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 italic text-xs">—</span>
                        )}
                      </td>

                      {/* DAT_VENCIMENTO */}
                      <td className="px-3.5 py-3 text-xs text-center font-mono font-medium text-slate-700 border-r border-[#E3E9F2]">
                        {datVencimento}
                      </td>

                      {/* Pago */}
                      <td className="px-3.5 py-3 text-xs text-center border-r border-[#E3E9F2]">
                        {pagoVal === '1' || pagoVal.toLowerCase() === 'sim' ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                            Sim
                          </span>
                        ) : pagoVal === '0' ||
                          pagoVal.toLowerCase() === 'não' ||
                          pagoVal.toLowerCase() === 'nao' ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Não
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">{pagoVal}</span>
                        )}
                      </td>

                      {/* Preventiva FPD */}
                      <td className="px-3.5 py-3 text-xs text-center font-mono text-slate-700 border-r border-[#E3E9F2]">
                        {preventivaFpd === '1' ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            1
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">{preventivaFpd}</span>
                        )}
                      </td>

                      {/* Virou FPD */}
                      <td className="px-3.5 py-3 text-xs text-center font-mono text-slate-700 border-r border-[#E3E9F2]">
                        {virouFpd === '1' ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            1
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">{virouFpd}</span>
                        )}
                      </td>

                      {/* CPF */}
                      <td className="px-3.5 py-3 font-mono text-xs text-slate-700 border-r border-[#E3E9F2]">
                        {cpf}
                      </td>

                      {/* CLIENTE */}
                      <td className="px-3.5 py-3 text-xs font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={cliente}>
                          {cliente}
                        </span>
                      </td>

                      {/* FONE */}
                      <td className="px-3.5 py-3 font-mono text-xs text-slate-700 border-r border-[#E3E9F2]">
                        {fone}
                      </td>

                      {/* LOJA */}
                      <td className="px-3.5 py-3 text-xs uppercase font-medium text-[#5B6B82] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={loja}>
                          {loja}
                        </span>
                      </td>

                      {/* VENDEDOR */}
                      <td className="px-3.5 py-3 text-xs text-[#12365A] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={vendedor}>
                          {vendedor}
                        </span>
                      </td>

                      {/* Ocorrências (Dropdown / Select) */}
                      <td className="px-3.5 py-2 border-r border-[#E3E9F2]">
                        <div className="relative flex items-center">
                          <Select
                            value={edit.ocorrencias || 'Não Tratados'}
                            onValueChange={(val) => handleOcorrenciaChange(row.id, val)}
                            disabled={isSavingThis}
                          >
                            <SelectTrigger
                              className={cn(
                                'h-8 text-xs bg-white border-[#E3E9F2] focus:border-[#0E9F8A] transition-all font-medium',
                                edit.ocorrencias === 'Não Tratados' &&
                                  'text-[#EA580C] bg-orange-50/40 border-orange-200',
                                edit.ocorrencias === 'Pendente' &&
                                  'text-[#DC2626] bg-red-50/40 border-red-200',
                                edit.ocorrencias === 'Fatura(s) Paga(s)' &&
                                  'text-[#0891B2] bg-cyan-50/40 border-cyan-200',
                                edit.ocorrencias === 'Enviado Fatura(s)' &&
                                  'text-[#16A34A] bg-green-50/40 border-green-200',
                                edit.ocorrencias === 'Sem Contato' &&
                                  'text-[#64748B] bg-slate-50/60 border-slate-200',
                                edit.ocorrencias === 'Promessa de Pagto.' &&
                                  'text-[#9333EA] bg-purple-50/40 border-purple-200',
                                edit.ocorrencias === 'Cancelados' &&
                                  'text-[#0F172A] bg-slate-100 border-slate-300 font-semibold',
                                edit.ocorrencias === 'Contato Realizado' &&
                                  'text-[#0D9488] bg-teal-50/40 border-teal-200',
                                edit.ocorrencias &&
                                  !(OCORRENCIAS_OPTIONS as readonly string[]).includes(
                                    edit.ocorrencias,
                                  ) &&
                                  'text-[#0284c7] bg-sky-50/40 border-sky-200 font-medium',
                              )}
                            >
                              <SelectValue placeholder="Selecione ocorrência" />
                            </SelectTrigger>
                            <SelectContent className="bg-white max-h-60 overflow-y-auto">
                              {OCORRENCIAS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs font-medium">
                                  {opt}
                                </SelectItem>
                              ))}
                              {edit.ocorrencias &&
                                !(OCORRENCIAS_OPTIONS as readonly string[]).includes(
                                  edit.ocorrencias,
                                ) && (
                                  <SelectItem
                                    value={edit.ocorrencias}
                                    className="text-xs font-medium italic text-[#0284c7]"
                                  >
                                    {edit.ocorrencias} (Planilha)
                                  </SelectItem>
                                )}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>

                      {/* Data Promessa de Pagto (Editable Mask) */}
                      <td className="px-3.5 py-2.5 border-r border-[#E3E9F2]">
                        <div className="relative flex items-center">
                          <Calendar className="w-3.5 h-3.5 text-[#8A97AC] absolute left-2 pointer-events-none" />
                          <Input
                            type="text"
                            placeholder="DD/MM/AAAA"
                            value={edit.data_promessa_de_pagto}
                            onChange={(e) => handleDateChange(row.id, e.target.value)}
                            onBlur={() => handleSaveField(row.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveField(row.id)}
                            disabled={isSavingThis}
                            maxLength={10}
                            className={cn(
                              'h-8 pl-7 pr-7 text-xs font-mono bg-white border-[#E3E9F2] focus:border-[#0E9F8A] transition-all',
                              edit.data_promessa_de_pagto && 'font-semibold text-[#12365A]',
                              rowStatus === 'saved' && 'border-green-500 bg-green-50/30',
                              rowStatus === 'error' && 'border-red-500 bg-red-50/30',
                            )}
                          />
                          {rowStatus === 'saving' && (
                            <RefreshCw className="w-3.5 h-3.5 text-[#0E9F8A] animate-spin absolute right-2 pointer-events-none" />
                          )}
                          {rowStatus === 'saved' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 absolute right-2 pointer-events-none" />
                          )}
                          {rowStatus === 'error' && (
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 absolute right-2 pointer-events-none" />
                          )}
                        </div>
                      </td>

                      {/* Comentários (Editable Text) */}
                      <td className="px-3.5 py-2.5">
                        <div className="relative flex items-center">
                          <MessageSquare className="w-3.5 h-3.5 text-[#8A97AC] absolute left-2 pointer-events-none" />
                          <Input
                            type="text"
                            placeholder="Digite uma observação..."
                            value={edit.comentarios}
                            onChange={(e) => handleCommentChange(row.id, e.target.value)}
                            onBlur={() => handleSaveField(row.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveField(row.id)}
                            disabled={isSavingThis}
                            className={cn(
                              'h-8 pl-7 pr-7 text-xs bg-white border-[#E3E9F2] focus:border-[#0E9F8A] transition-all',
                              edit.comentarios && 'text-[#12365A]',
                              rowStatus === 'saved' && 'border-green-500 bg-green-50/30',
                              rowStatus === 'error' && 'border-red-500 bg-red-50/30',
                            )}
                          />
                        </div>
                      </td>
                    </tr>
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
              <strong>{totalItems.toLocaleString('pt-BR')}</strong> clientes residencial
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
    </div>
  )
}

export default ClientesResidencial
