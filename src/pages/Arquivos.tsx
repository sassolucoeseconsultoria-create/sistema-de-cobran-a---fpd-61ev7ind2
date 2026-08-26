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
  Calendar,
  Trash2,
  FolderOpen,
  ArrowUpDown,
  Building2,
  FileText,
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
import {
  fetchImportedFiles,
  fetchStores,
  deleteImportedFile,
  clearAllImportedFiles,
} from '@/services/fpdService'
import { exportImportedFilesToXlsx } from '@/lib/xlsxExport'
import { FPD_STATUSES, type ImportedFileRecord, type StoreRecord } from '@/types/fpd'
import { cn } from '@/lib/utils'

export const Arquivos: React.FC = () => {
  const { toast } = useToast()
  const [files, setFiles] = useState<ImportedFileRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc') // By import date

  // Delete modal
  const [fileToDelete, setFileToDelete] = useState<ImportedFileRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Clear all modal
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  const loadData = async () => {
    try {
      setLoading(true)
      const [fetchedFiles, fetchedStores] = await Promise.all([fetchImportedFiles(), fetchStores()])
      setFiles(fetchedFiles)
      setStores(fetchedStores)
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar arquivos',
        description: 'Não foi possível buscar a lista de arquivos importados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Real-time updates for imported_files
  useRealtime<ImportedFileRecord>('imported_files', (e) => {
    if (e.action === 'create') {
      setFiles((prev) => [e.record, ...prev.filter((f) => f.id !== e.record.id)])
    } else if (e.action === 'update') {
      setFiles((prev) => prev.map((f) => (f.id === e.record.id ? e.record : f)))
    } else if (e.action === 'delete') {
      setFiles((prev) => prev.filter((f) => f.id !== e.record.id))
    }
  })

  // Filtered & Sorted files
  const filteredFiles = useMemo(() => {
    const list = files.filter((item) => {
      const storeName = item.expand?.store?.name || item.store_name || ''

      // Search match
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const matchName = item.file_name.toLowerCase().includes(q)
        const matchStore = storeName.toLowerCase().includes(q)
        const matchDate = (item.reference_date || '').toLowerCase().includes(q)
        if (!matchName && !matchStore && !matchDate) return false
      }

      // Store filter
      if (selectedStoreId !== 'all') {
        const currentStoreId = item.store || item.store_id || ''
        if (currentStoreId !== selectedStoreId && storeName !== selectedStoreId) {
          return false
        }
      }

      return true
    })

    // Sort by date (imported_at or created)
    return list.sort((a, b) => {
      const timeA = new Date(a.imported_at || a.created).getTime()
      const timeB = new Date(b.imported_at || b.created).getTime()
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [files, debouncedSearch, selectedStoreId, sortOrder])

  // Summary Totals
  const totals = useMemo(() => {
    return filteredFiles.reduce(
      (acc, f) => {
        const enviado = f.enviado_faturas !== undefined ? f.enviado_faturas : f.envio_fatura || 0
        acc.totalLinhas += f.total_linhas || 0
        acc.envioFatura += enviado
        acc.pendente += f.pendente || 0
        acc.faturaPaga += f.fatura_paga || 0
        acc.semContato += f.sem_contato || 0
        acc.promessaPagto += f.promessa_pagto || 0
        acc.cancelados += f.cancelados || 0
        acc.naoTratados += f.nao_tratados || 0
        acc.contatoRealizado += f.contato_realizado || 0
        acc.outros += f.outros || 0
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
  }, [filteredFiles])

  // Delete individual file
  const handleDeleteFile = async () => {
    if (!fileToDelete) return
    try {
      setIsDeleting(true)
      await deleteImportedFile(fileToDelete.id)
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id))
      toast({
        title: 'Arquivo excluído',
        description: `O arquivo "${fileToDelete.file_name}" foi removido do histórico. Os totais consolidados foram preservados.`,
      })
      setFileToDelete(null)
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Clear all imported files
  const handleClearAll = async () => {
    try {
      setIsClearingAll(true)
      const count = await clearAllImportedFiles()
      setFiles([])
      setClearDialogOpen(false)
      toast({
        title: 'Histórico de arquivos limpo',
        description: `${count} arquivo(s) importado(s) foram removidos.`,
      })
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao limpar',
        description: 'Não foi possível limpar a lista de arquivos.',
        variant: 'destructive',
      })
    } finally {
      setIsClearingAll(false)
    }
  }

  // Export to .xlsx
  const handleExportXlsx = () => {
    if (filteredFiles.length === 0) {
      toast({
        title: 'Nada a exportar',
        description: 'Nenhum arquivo listado para exportar.',
      })
      return
    }
    exportImportedFilesToXlsx(filteredFiles, totals)
    toast({
      title: 'Planilha exportada',
      description: 'O arquivo .xlsx com a visão analítica foi gerado.',
    })
  }

  const hasActiveFilters = debouncedSearch !== '' || selectedStoreId !== 'all'

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setSelectedStoreId('all')
  }

  return (
    <div className="space-y-6">
      {/* Top summary cards banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Arquivos Importados
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">{files.length}</span>
              <span className="text-xs text-[#0E9F8A] font-medium">arquivos salvos</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#12365A]/5 text-[#12365A] flex items-center justify-center">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Total Linhas (Soma Bruta)
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A] tabular-nums">
                {totals.totalLinhas.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-[#5B6B82]">ocorrências</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0E9F8A]/10 text-[#0E9F8A] flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Faturas Pagas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#0891B2] tabular-nums">
                {totals.faturaPaga.toLocaleString('pt-BR')}
              </span>
              {totals.totalLinhas > 0 && (
                <span className="text-xs text-[#0891B2] font-medium">
                  {((totals.faturaPaga / totals.totalLinhas) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0891B2]/10 text-[#0891B2] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6B82]">
              Lojas Impactadas
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[#12365A]">
                {
                  new Set(files.map((f) => f.expand?.store?.name || f.store_name).filter(Boolean))
                    .size
                }
              </span>
              <span className="text-xs text-[#5B6B82]">lojas distintas</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Empty State Banner if no imported files */}
      {!loading && files.length === 0 && (
        <div className="bg-gradient-to-r from-[#12365A] to-[#1a4a7a] text-white rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E9F8A]/20 text-[#0E9F8A] text-xs font-semibold tracking-wider uppercase border border-[#0E9F8A]/30">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Visão Analítica por Arquivo</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">Nenhum arquivo individual salvo ainda</h2>
            <p className="text-sm text-slate-200 max-w-xl">
              Ao importar novas planilhas <span className="text-white font-semibold">.xlsx</span> na
              aba de Importar, cada arquivo bruto será arquivado aqui antes da consolidação de
              totais.
            </p>
          </div>
          <Link to="/importar">
            <Button className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-lg shadow-[#0E9F8A]/30 font-semibold px-6 py-6 h-auto text-base gap-2.5 shrink-0">
              <UploadCloud className="w-5 h-5" />
              <span>Importar Arquivos</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[#E3E9F2] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left search & store filter */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar arquivo ou loja..."
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

            {/* Filter Store */}
            <div className="w-full sm:w-52">
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-[#E3E9F2] bg-[#F8FAFC] px-2.5 text-[#12233A] focus:outline-none focus:border-[#0E9F8A]"
              >
                <option value="all">Todas as Lojas ({stores.length})</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="h-9 text-xs font-medium border-[#E3E9F2] text-[#12365A] gap-1.5"
              title="Alternar ordenação por data"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#0E9F8A]" />
              <span>{sortOrder === 'desc' ? 'Mais recentes 1º' : 'Mais antigos 1º'}</span>
            </Button>

            {/* Clear filters button */}
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
            {files.length > 0 && (
              <Button
                onClick={() => setClearDialogOpen(true)}
                variant="outline"
                className="h-9 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 font-medium text-xs sm:text-sm gap-1.5 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Limpar Histórico</span>
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

        {/* Analytical Table */}
        <div className="relative overflow-x-auto max-h-[70vh] border-b border-[#E3E9F2]">
          <table className="w-full text-left border-collapse text-[13px]">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-[#12365A] text-white shadow-sm font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                {/* 1 - DATA / HORA (Sticky left) */}
                <th className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3.5 min-w-[150px] border-r border-[#1e456f]">
                  DATA / HORA
                </th>
                {/* 2 - LOJA */}
                <th className="px-3.5 py-3.5 min-w-[190px] border-r border-[#1e456f]">LOJA</th>
                {/* 3 - NOME DO ARQUIVO */}
                <th className="px-3.5 py-3.5 min-w-[220px] border-r border-[#1e456f]">
                  NOME DO ARQUIVO
                </th>
                {/* 4 - REF */}
                <th className="px-3 py-3.5 min-w-[100px] border-r border-[#1e456f]">DATA REF.</th>
                {/* 5 - TOTAL LINHAS */}
                <th className="px-3 py-3.5 min-w-[110px] text-right border-r border-[#1e456f] bg-[#0E2A47]">
                  TOTAL LINHAS
                </th>
                {/* 6-15 Status Columns with Colored Chips */}
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
                {/* 16 - AÇÕES */}
                <th className="px-3 py-3.5 text-right min-w-[80px]">AÇÕES</th>
              </tr>
            </thead>
            {/* Body */}
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando arquivos importados...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-medium text-[#12365A]">Nenhum arquivo encontrado</p>
                      <p className="text-xs text-[#5B6B82]">
                        {files.length === 0
                          ? 'Importe planilhas .xlsx na aba Importar para visualizar o histórico individual dos arquivos.'
                          : 'Tente ajustar a busca ou o filtro de loja.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file, idx) => {
                  const storeName = file.expand?.store?.name || file.store_name || 'Loja'
                  const dateStr = file.imported_at || file.created
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleString('pt-BR') : '—'

                  return (
                    <tr
                      key={file.id}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors group',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* 1: DATA / HORA (Sticky left) */}
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3.5 py-2.5 font-medium text-[#12365A] border-r border-[#E3E9F2] text-xs whitespace-nowrap',
                          idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          'group-hover:bg-[#F0F5FC]',
                        )}
                      >
                        {formattedDate}
                      </td>

                      {/* 2: LOJA */}
                      <td className="px-3.5 py-2.5 font-bold text-[#12365A] border-r border-[#E3E9F2] truncate max-w-[200px]">
                        {storeName}
                      </td>

                      {/* 3: NOME DO ARQUIVO */}
                      <td className="px-3.5 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] truncate max-w-[240px]">
                        <div className="flex items-center gap-1.5" title={file.file_name}>
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#0E9F8A] shrink-0" />
                          <span className="truncate font-medium text-[#12365A]">
                            {file.file_name}
                          </span>
                        </div>
                      </td>

                      {/* 4: DATA REF */}
                      <td className="px-3 py-2.5 text-[#5B6B82] border-r border-[#E3E9F2] text-xs font-medium">
                        {file.reference_date ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-slate-50 border-slate-200 text-[#12365A]"
                          >
                            {file.reference_date}
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 5: TOTAL LINHAS */}
                      <td className="px-3 py-2.5 text-right font-bold text-[#12365A] tabular-nums border-r border-[#E3E9F2] bg-slate-50/50">
                        {(file.total_linhas || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* 6-15: 10 Status Columns with colored chip badge */}
                      {FPD_STATUSES.map((status) => {
                        let val: number | undefined
                        if (status.key === 'envio_fatura') {
                          val =
                            file.enviado_faturas !== undefined
                              ? file.enviado_faturas
                              : file.envio_fatura || 0
                        } else {
                          val = (file[status.key as keyof ImportedFileRecord] as number) || 0
                        }

                        const hasVal = (val ?? 0) > 0

                        return (
                          <td
                            key={status.key}
                            className="px-2.5 py-2.5 text-right font-medium tabular-nums border-r border-[#E3E9F2]"
                            style={{
                              backgroundColor: hasVal ? status.bgTint : undefined,
                              color: hasVal ? status.textColor : undefined,
                            }}
                          >
                            {hasVal ? (
                              (val ?? 0).toLocaleString('pt-BR')
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                        )
                      })}

                      {/* 16: AÇÕES */}
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFileToDelete(file)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Excluir arquivo individual"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {/* Totals Row (Pinned Footer) */}
            <tfoot className="sticky bottom-0 z-20 bg-[#12365A] text-white font-bold text-[13px] shadow-lg border-t-2 border-[#0E9F8A]">
              <tr>
                {/* 1: Totais */}
                <td className="sticky left-0 z-30 bg-[#12365A] px-3.5 py-3 border-r border-[#1e456f] text-white uppercase tracking-wider">
                  Totais ({filteredFiles.length})
                </td>
                {/* 2 */}
                <td className="px-3.5 py-3 border-r border-[#1e456f]"></td>
                {/* 3 */}
                <td className="px-3.5 py-3 border-r border-[#1e456f]"></td>
                {/* 4 */}
                <td className="px-3 py-3 border-r border-[#1e456f]"></td>
                {/* 5: TOTAL LINHAS */}
                <th className="px-3 py-3 text-right text-white tabular-nums border-r border-[#1e456f] bg-[#0E2A47]">
                  {totals.totalLinhas.toLocaleString('pt-BR')}
                </th>
                {/* Status totals */}
                {/* 1. Fatura(s) Paga(s) */}
                <td className="px-2.5 py-3 text-right text-[#67e8f9] tabular-nums border-r border-[#1e456f]">
                  {totals.faturaPaga.toLocaleString('pt-BR')}
                </td>
                {/* 2. Enviado Fatura(s) */}
                <td className="px-2.5 py-3 text-right text-[#4ade80] tabular-nums border-r border-[#1e456f]">
                  {totals.envioFatura.toLocaleString('pt-BR')}
                </td>
                {/* 3. Promessa de Pagto. */}
                <td className="px-2.5 py-3 text-right text-[#d8b4fe] tabular-nums border-r border-[#1e456f]">
                  {totals.promessaPagto.toLocaleString('pt-BR')}
                </td>
                {/* 4. Sem Contato */}
                <td className="px-2.5 py-3 text-right text-[#cbd5e1] tabular-nums border-r border-[#1e456f]">
                  {totals.semContato.toLocaleString('pt-BR')}
                </td>
                {/* 5. Cancelados */}
                <td className="px-2.5 py-3 text-right text-slate-300 tabular-nums border-r border-[#1e456f]">
                  {totals.cancelados.toLocaleString('pt-BR')}
                </td>
                {/* 6. Pendente */}
                <td className="px-2.5 py-3 text-right text-[#fca5a5] tabular-nums border-r border-[#1e456f]">
                  {totals.pendente.toLocaleString('pt-BR')}
                </td>
                {/* 7. Contato Realizado */}
                <td className="px-2.5 py-3 text-right text-[#5eead4] tabular-nums border-r border-[#1e456f]">
                  {totals.contatoRealizado.toLocaleString('pt-BR')}
                </td>
                {/* 8. Outros Motivos */}
                <td className="px-2.5 py-3 text-right text-[#c4b5fd] tabular-nums border-r border-[#1e456f]">
                  {totals.outros.toLocaleString('pt-BR')}
                </td>
                {/* 9. Não Tratados */}
                <td className="px-2.5 py-3 text-right text-[#fdba74] tabular-nums border-r border-[#1e456f]">
                  {totals.naoTratados.toLocaleString('pt-BR')}
                </td>
                {/* 16 */}
                <td className="px-3 py-3"></td>
              </tr>
            </tfoot>{' '}
          </table>
        </div>
      </div>

      {/* Modal: Confirmar Exclusão de Arquivo Individual */}
      <Dialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Confirmar exclusão de arquivo
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Deseja remover o registro individual do arquivo{' '}
              <strong className="text-[#12365A]">"{fileToDelete?.file_name}"</strong> da loja{' '}
              <strong className="text-[#12365A]">
                "{fileToDelete?.expand?.store?.name || fileToDelete?.store_name}"
              </strong>
              ?
              <br />
              <br />
              <span className="text-slate-500">
                Nota: Esta exclusão remove apenas este arquivo do histórico bruto. O total já somado
                no painel consolidado da loja permanece inalterado.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setFileToDelete(null)}
              disabled={isDeleting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFile}
              disabled={isDeleting}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Excluindo...' : 'Sim, excluir arquivo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Limpar Todos os Arquivos */}
      <Dialog
        open={clearDialogOpen}
        onOpenChange={(open) => !isClearingAll && setClearDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Limpar todos os arquivos importados?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[#5B6B82] leading-relaxed">
              Tem certeza de que deseja limpar todos os{' '}
              <strong className="text-red-700">{files.length} registros individuais</strong> de
              arquivos importados? Os totais consolidados no painel principal serão mantidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={isClearingAll}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={isClearingAll}
              className="text-xs bg-red-600 hover:bg-red-700 gap-2"
            >
              {isClearingAll && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{isClearingAll ? 'Limpando...' : 'Limpar Arquivos'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Arquivos
