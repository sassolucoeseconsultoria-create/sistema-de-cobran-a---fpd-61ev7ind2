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
import pb from '@/lib/pocketbase/client'
import { OCORRENCIAS_OPTIONS, type MovelRecord, type OcorrenciaType } from '@/types/fpd'
import {
  applyDateMask,
  formatCpf,
  formatExcelOrIsoDateShort,
  getDadosField,
} from '@/lib/clientFormatters'
import { updateClientManualFields } from '@/services/relacionamentoService'
import { cn } from '@/lib/utils'

import type { StoreRecord } from '@/types/fpd'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'

interface ClientesMovelProps {
  availableLojas: string[]
  stores?: StoreRecord[]
  dataReferencia?: string
  selectedLoja?: string
  onLojaChange?: (loja: string) => void
}

export const ClientesMovel: React.FC<ClientesMovelProps> = ({
  availableLojas,
  stores = [],
  dataReferencia,
  selectedLoja: controlledLoja,
  onLojaChange,
}) => {
  const { toast } = useToast()

  const [records, setRecords] = useState<MovelRecord[]>([])
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
  // key: recordId -> { ocorrencias, data_promessa_de_pagto, comentarios }
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

  // If selected store becomes invalid under user's permissions, reset to TODAS
  useEffect(() => {
    if (
      !userAccess.isAdm &&
      selectedLoja !== 'TODAS' &&
      !userAccess.isStoreNameAllowed(selectedLoja, stores)
    ) {
      setSelectedLoja('TODAS')
      setPage(1)
    }
  }, [selectedLoja, userAccess, stores])

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

        const lojaVariants = new Set<string>()
        lojaVariants.add(selectedLoja)
        // Check if there is an alternative form with or without trailing S (e.g., AGUAS CLARA vs AGUAS CLARAS)
        if (selectedLoja.endsWith('S') || selectedLoja.endsWith('s')) {
          lojaVariants.add(selectedLoja.slice(0, -1))
        } else {
          lojaVariants.add(`${selectedLoja}S`)
        }

        const clauses: string[] = []
        for (const variant of lojaVariants) {
          const esc = variant.replace(/"/g, '\\"')
          clauses.push(`loja = "${esc}"`)
          const unacc = variant
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .replace(/"/g, '\\"')
          if (unacc && unacc.toLowerCase() !== esc.toLowerCase()) {
            clauses.push(`loja = "${unacc}"`)
          }
        }
        if (clauses.length === 1) {
          filterParts.push(clauses[0])
        } else {
          filterParts.push(`(${clauses.join(' || ')})`)
        }
      } else if (!userAccess.isAdm) {
        // User is not ADM and has "TODAS" selected -> filter by all allowed stores
        if (availableLojas.length > 0) {
          const expandedStoreNames = new Set<string>()
          for (const l of availableLojas) {
            if (!l || !l.trim()) continue
            expandedStoreNames.add(l.trim())
            const unaccented = l
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .trim()
            if (unaccented) {
              expandedStoreNames.add(unaccented)
            }
          }

          const storeFilters = Array.from(expandedStoreNames).map(
            (l) => `loja = "${l.replace(/"/g, '\\"')}"`,
          )
          if (storeFilters.length > 0) {
            filterParts.push(`(${storeFilters.join(' || ')})`)
          }
        } else {
          // No allowed store names identified
          setRecords([])
          setTotalItems(0)
          setTotalPages(1)
          return
        }
      }

      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim().replace(/"/g, '\\"')
        filterParts.push(
          `(loja ~ "${s}" || vendedor ~ "${s}" || cliente ~ "${s}" || arquivo ~ "${s}")`,
        )
      }

      if (dataReferencia && dataReferencia !== 'TODAS') {
        const escapedRef = dataReferencia.replace(/"/g, '\\"')
        // Fallback for legacy records with empty or unset data_referencia
        filterParts.push(
          `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
        )
      }

      const filterStr = filterParts.length > 0 ? filterParts.join(' && ') : undefined

      const res = await pb.collection('movel').getList<MovelRecord>(page, perPage, {
        filter: filterStr,
        sort: '-created',
        requestKey: null,
      })

      // If non-ADM, only retain records whose store is allowed
      let filteredItems = userAccess.isAdm
        ? res.items
        : res.items.filter((item) => userAccess.isStoreNameAllowed(item.loja, stores))

      // Extra safeguard: if a specific store is selected, ensure every returned item strictly matches it
      if (selectedLoja && selectedLoja !== 'TODAS') {
        const selNorm = selectedLoja.trim().toLowerCase()
        const unaccentedSelNorm = selectedLoja
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase()
        const altVariant = selNorm.endsWith('s') ? selNorm.slice(0, -1) : `${selNorm}s`
        filteredItems = filteredItems.filter((item) => {
          const itemLoja = (item.loja || '').trim().toLowerCase()
          return itemLoja === selNorm || itemLoja === unaccentedSelNorm || itemLoja === altVariant
        })
      }

      setRecords(filteredItems)

      // When a specific store or non-ADM filters are active, totalItems from backend (res.totalItems)
      // already reflects the filterStr query if there were no discarded items in memory.
      // However, if the safeguard dropped any client-side items or if page 1 had fewer than expected,
      // we make sure total count is accurate.
      // Notice: res.totalItems corresponds directly to filterStr applied on the backend!
      let accurateTotal = res.totalItems
      if (selectedLoja && selectedLoja !== 'TODAS' && filteredItems.length === 0 && page === 1) {
        // If client-side safeguard filtered everything out on page 1, real count is 0
        accurateTotal = 0
      }

      setTotalItems(accurateTotal)
      setTotalPages(Math.max(1, Math.ceil(accurateTotal / perPage)))

      // Initialize edit values
      const initialEdits: Record<
        string,
        { ocorrencias: string; data_promessa_de_pagto: string; comentarios: string }
      > = {}
      filteredItems.forEach((item) => {
        const itemOcorrencia = item.ocorrencias || 'Não Tratados'
        initialEdits[item.id] = {
          ocorrencias: itemOcorrencia,
          data_promessa_de_pagto: item.data_promessa_de_pagto || '',
          comentarios: item.comentarios || '',
        }
      })
      setEditValues(initialEdits)
    } catch (err) {
      console.error('Erro ao carregar clientes móvel:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a lista de clientes móvel.',
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
      await updateClientManualFields(id, 'Móvel', {
        ocorrencias: currentEdit.ocorrencias,
        data_promessa_de_pagto: currentEdit.data_promessa_de_pagto,
        comentarios: currentEdit.comentarios,
      })

      // Update local record to reflect changes
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                ocorrencias: currentEdit.ocorrencias,
                data_promessa_de_pagto: currentEdit.data_promessa_de_pagto,
                comentarios: currentEdit.comentarios,
              }
            : r,
        ),
      )

      setSaveStatus((prev) => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => {
        setSaveStatus((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }, 2500)
    } catch (err) {
      console.error('Erro ao salvar campos de cliente móvel:', err)
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
              placeholder="Buscar por vendedor, cliente, loja..."
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

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setSelectedLoja('TODAS')
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

      {/* Clientes Móvel Table */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        <div className="relative overflow-x-auto max-h-[65vh]">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                <th className="px-3 py-3.5 text-center w-12 border-r border-[#1e456f]">#</th>
                <th className="px-3.5 py-3.5 min-w-[130px] border-r border-[#1e456f]">Número</th>
                <th className="px-3.5 py-3.5 min-w-[140px] border-r border-[#1e456f]">CPF</th>
                <th className="px-3.5 py-3.5 min-w-[200px] border-r border-[#1e456f]">Nome</th>
                <th className="px-3.5 py-3.5 min-w-[170px] border-r border-[#1e456f]">Vendedor</th>
                <th className="px-3.5 py-3.5 min-w-[170px] border-r border-[#1e456f]">Local</th>
                <th className="px-3.5 py-3.5 min-w-[110px] border-r border-[#1e456f]">Status</th>
                <th className="px-3.5 py-3.5 min-w-[110px] text-center border-r border-[#1e456f]">
                  Adimplente
                </th>
                <th className="px-3.5 py-3.5 min-w-[120px] text-center border-r border-[#1e456f]">
                  Maior atraso
                </th>
                <th className="px-3.5 py-3.5 min-w-[185px] border-r border-[#1e456f]">
                  Ocorrências
                </th>
                <th className="px-3.5 py-3.5 min-w-[170px] border-r border-[#1e456f]">
                  Data Promessa de Pagto
                </th>
                <th className="px-3.5 py-3.5 min-w-[240px]">Comentários</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-7 h-7 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs sm:text-sm">
                        Carregando lista de clientes móvel...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <p className="font-bold text-[#12365A] text-sm">
                        Nenhum cliente móvel encontrado.
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

                  // Deriving columns
                  const numero =
                    getDadosField(
                      d,
                      'Numero',
                      'NÚMERO',
                      'NUMERO',
                      'Telefone',
                      'Linha',
                      'MSISDN',
                      'Celular',
                      'Terminal',
                    ) || (row.linha ? `#${row.linha}` : '—')

                  const rawCpf = getDadosField(d, 'CPF', 'Cpf', 'CNPJ', 'Documento', 'DOC') || ''
                  const cpf = rawCpf ? formatCpf(rawCpf) : '—'

                  const nome =
                    row.cliente ||
                    getDadosField(
                      d,
                      'Nome',
                      'NOME',
                      'Cliente',
                      'CLIENTE',
                      'Razão Social',
                      'Assinante',
                    ) ||
                    '—'

                  const vendedor =
                    row.vendedor ||
                    getDadosField(
                      d,
                      'Vendedor',
                      'VENDEDOR',
                      'Consultor',
                      'Operador',
                      'Nm Vendedor',
                    ) ||
                    '—'

                  const local =
                    row.loja ||
                    getDadosField(d, 'Local', 'LOCAL', 'Loja', 'LOJA', 'Filial', 'Cidade', 'UF') ||
                    '—'

                  const status =
                    getDadosField(d, 'Status', 'STATUS', 'Situação', 'SITUACAO', 'Indicador') || '—'

                  const adimplente =
                    getDadosField(d, 'Adimplente', 'ADIMPLENTE', 'Adimplência', 'Pago') || '—'

                  const rawMaiorAtraso =
                    getDadosField(
                      d,
                      'Maior atraso',
                      'MAIOR ATRASO',
                      'Maior Atraso',
                      'Atraso',
                      'Qtd Dias Venc',
                    ) || ''

                  const maiorAtraso = rawMaiorAtraso
                    ? formatExcelOrIsoDateShort(rawMaiorAtraso) || rawMaiorAtraso
                    : '—'

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

                      {/* Número */}
                      <td className="px-3.5 py-3 font-mono text-xs font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                        {numero}
                      </td>

                      {/* CPF */}
                      <td className="px-3.5 py-3 font-mono text-xs text-slate-700 border-r border-[#E3E9F2]">
                        {cpf}
                      </td>

                      {/* Nome */}
                      <td className="px-3.5 py-3 text-xs font-semibold text-[#12365A] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={nome}>
                          {nome}
                        </span>
                      </td>

                      {/* Vendedor */}
                      <td className="px-3.5 py-3 text-xs text-[#12365A] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={vendedor}>
                          {vendedor}
                        </span>
                      </td>

                      {/* Local */}
                      <td className="px-3.5 py-3 text-xs uppercase font-medium text-[#5B6B82] border-r border-[#E3E9F2]">
                        <span className="line-clamp-1" title={local}>
                          {local}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-3 text-xs border-r border-[#E3E9F2]">
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-slate-50 border-slate-200 text-slate-700"
                        >
                          {status}
                        </Badge>
                      </td>

                      {/* Adimplente */}
                      <td className="px-3.5 py-3 text-xs text-center border-r border-[#E3E9F2]">
                        {adimplente.toLowerCase() === 'sim' ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                            Sim
                          </span>
                        ) : adimplente.toLowerCase() === 'não' ||
                          adimplente.toLowerCase() === 'nao' ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                            Não
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">{adimplente}</span>
                        )}
                      </td>

                      {/* Maior atraso */}
                      <td className="px-3.5 py-3 text-xs text-center font-mono font-medium text-slate-700 border-r border-[#E3E9F2]">
                        {maiorAtraso}
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
                                edit.ocorrencias === 'Outros Motivos' &&
                                  'text-[#8B5CF6] bg-violet-50/40 border-violet-200',
                                edit.ocorrencias === 'Contato Realizado' &&
                                  'text-[#0D9488] bg-teal-50/40 border-teal-200',
                              )}
                            >
                              <SelectValue placeholder="Selecione ocorrência" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {OCORRENCIAS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs font-medium">
                                  {opt}
                                </SelectItem>
                              ))}
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
              <strong>{totalItems.toLocaleString('pt-BR')}</strong> clientes móvel
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

export default ClientesMovel
