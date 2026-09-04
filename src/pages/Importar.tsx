import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Calendar,
  Layers,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronUp,
  TableProperties,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  fetchStores,
  createStore,
  saveFpdRecord,
  saveImportedFile,
  findStoreByName,
  saveVendorConsolidationsFromLines,
  matchStore,
} from '@/services/fpdService'
import { parseXlsxFile, type ParsedFileData } from '@/lib/xlsxParser'
import { FPD_STATUSES, type StoreRecord } from '@/types/fpd'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { applyDateMask, isValidDateDDMMAAAA } from '@/lib/clientFormatters'
import { cn } from '@/lib/utils'

interface FileQueueItem {
  id: string
  file: File
  status: 'pending' | 'parsing' | 'ready' | 'saving' | 'done' | 'error'
  errorMessage?: string
  parsedData?: ParsedFileData
  // Store matching
  matchedStoreId: string | 'new'
  newStoreName: string
  referenteDate: string
}

export const Importar: React.FC = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [globalReferenceDate, setGlobalReferenceDate] = useState<string>('')
  const [globalDateError, setGlobalDateError] = useState<string>('')
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([])
  const [expandedColumnsMap, setExpandedColumnsMap] = useState<Record<string, boolean>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingAll, setIsProcessingAll] = useState(false)

  const toggleColumnsExpanded = (itemId: string) => {
    setExpandedColumnsMap((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  // Load existing stores
  const loadStores = async () => {
    try {
      setLoadingStores(true)
      const list = await fetchStores()
      setStores(list)
    } catch {
      // ignore
    } finally {
      setLoadingStores(false)
    }
  }

  useEffect(() => {
    loadStores()
  }, [])

  const handleGlobalReferenceDateChange = (val: string) => {
    const masked = applyDateMask(val)
    setGlobalReferenceDate(masked)
    if (globalDateError) setGlobalDateError('')

    // Also update all items in queue that haven't been customized or update all
    if (masked) {
      setFileQueue((prev) =>
        prev.map((q) => ({
          ...q,
          referenteDate: masked,
        })),
      )
    }
  }

  // Handle files selected
  const handleFiles = async (files: FileList | File[]) => {
    const newItems: FileQueueItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({
          title: 'Arquivo ignorado',
          description: `O arquivo "${file.name}" não é um formato Excel válido (.xlsx).`,
          variant: 'destructive',
        })
        continue
      }

      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      newItems.push({
        id,
        file,
        status: 'pending',
        matchedStoreId: 'new',
        newStoreName: '',
        referenteDate: globalReferenceDate || '',
      })
    }

    if (newItems.length === 0) return

    setFileQueue((prev) => [...prev, ...newItems])

    // Automatically parse the newly added files
    for (const item of newItems) {
      await processFileParsing(item.id, item.file)
    }
  }

  // Parse a single file client-side
  const processFileParsing = async (itemId: string, file: File) => {
    setFileQueue((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: 'parsing', errorMessage: undefined } : item,
      ),
    )

    try {
      const parsed = await parseXlsxFile(file)

      // Try to match with existing stores using robust matchStore
      const existingMatch = matchStore(parsed.guessedStoreName, stores)
      setFileQueue((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item
          // If globalReferenceDate is set, use it; otherwise fallback to guessed referente or empty
          const initialRefDate = globalReferenceDate || parsed.guessedReferente || ''
          return {
            ...item,
            status: 'ready',
            parsedData: parsed,
            matchedStoreId: existingMatch ? existingMatch.id : 'new',
            newStoreName: existingMatch ? existingMatch.name : parsed.guessedStoreName,
            referenteDate: item.referenteDate || initialRefDate,
          }
        }),
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFileQueue((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: 'error', errorMessage: msg || 'Falha ao ler o arquivo Excel.' }
            : item,
        ),
      )
    }
  }

  // Drag & drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // Remove item from queue
  const removeItem = (id: string) => {
    setFileQueue((prev) => prev.filter((item) => item.id !== id))
  }

  // Save single item to PocketBase
  const saveItemToBackend = async (item: FileQueueItem): Promise<boolean> => {
    if (!item.parsedData) return false

    const refDate = (item.referenteDate || globalReferenceDate || '').trim()

    if (!refDate) {
      toast({
        title: 'Data de Referência obrigatória',
        description: `Informe a Data de Referência para o arquivo "${item.file.name}".`,
        variant: 'destructive',
      })
      setFileQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                errorMessage: 'Data de Referência é obrigatória (ex: 20/08/2026).',
              }
            : q,
        ),
      )
      return false
    }

    if (!isValidDateDDMMAAAA(refDate)) {
      toast({
        title: 'Data de Referência inválida',
        description: `A data "${refDate}" deve estar no formato DD/MM/AAAA válido.`,
        variant: 'destructive',
      })
      setFileQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                errorMessage: `Data inválida (${refDate}). Use o formato DD/MM/AAAA.`,
              }
            : q,
        ),
      )
      return false
    }

    try {
      setFileQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'saving' } : q)))

      let storeId = item.matchedStoreId

      let finalStoreName = item.newStoreName || item.parsedData.guessedStoreName

      // If new store or matchedStoreId is 'new'
      if (storeId === 'new') {
        const storeName = (item.newStoreName || item.parsedData.guessedStoreName)
          .trim()
          .toUpperCase()
        finalStoreName = storeName
        // Check if exists in backend
        const existing = await findStoreByName(storeName)
        if (existing) {
          storeId = existing.id
          finalStoreName = existing.name
        } else {
          const created = await createStore({
            name: storeName,
          })
          storeId = created.id
          finalStoreName = created.name
        }
      } else {
        const selected = stores.find((s) => s.id === storeId)
        if (selected) {
          finalStoreName = selected.name
        }
      }

      // 1. Save raw individual imported file to imported_files collection BEFORE aggregating/updating consolidated
      await saveImportedFile({
        storeId,
        storeName: finalStoreName,
        fileName: item.file.name,
        referenceDate: refDate,
        total_linhas: item.parsedData.aggregated.total_linhas,
        enviado_faturas: item.parsedData.aggregated.envio_fatura,
        envio_fatura: item.parsedData.aggregated.envio_fatura,
        pendente: item.parsedData.aggregated.pendente,
        fatura_paga: item.parsedData.aggregated.fatura_paga,
        sem_contato: item.parsedData.aggregated.sem_contato,
        promessa_pagto: item.parsedData.aggregated.promessa_pagto,
        cancelados: item.parsedData.aggregated.cancelados,
        nao_tratados: item.parsedData.aggregated.nao_tratados,
        contato_realizado: item.parsedData.aggregated.contato_realizado,
        outros: 0,
      })

      // 2. Save/update consolidated FPD Record (upsert by store + referente)
      await saveFpdRecord({
        storeId,
        referente: refDate,
        total_linhas: item.parsedData.aggregated.total_linhas,
        envio_fatura: item.parsedData.aggregated.envio_fatura,
        pendente: item.parsedData.aggregated.pendente,
        fatura_paga: item.parsedData.aggregated.fatura_paga,
        sem_contato: item.parsedData.aggregated.sem_contato,
        promessa_pagto: item.parsedData.aggregated.promessa_pagto,
        cancelados: item.parsedData.aggregated.cancelados,
        nao_tratados: item.parsedData.aggregated.nao_tratados,
        contato_realizado: item.parsedData.aggregated.contato_realizado,
        outros: 0,
      })

      // 3. Save/update Vendor Consolidations from vendor lines
      if (item.parsedData.vendorLines && item.parsedData.vendorLines.length > 0) {
        // If a line does not have a loja name or was blank, fallback to the store name of this file
        const linesToSave = item.parsedData.vendorLines.map((vl) => ({
          ...vl,
          loja: vl.loja || finalStoreName,
        }))
        await saveVendorConsolidationsFromLines(linesToSave, refDate, stores)
      }

      setFileQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'done' } : q)))
      return true
    } catch (err: unknown) {
      console.error('Erro ao salvar registro FPD:', err)
      const msg = getErrorMessage(err)
      setFileQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: 'error', errorMessage: `Erro ao salvar: ${msg}` } : q,
        ),
      )
      return false
    }
  }

  // Save all ready items
  const handleSaveAll = async () => {
    const readyItems = fileQueue.filter(
      (item) => item.status === 'ready' || item.status === 'error',
    )
    if (readyItems.length === 0) {
      toast({
        title: 'Nenhum arquivo pronto',
        description: 'Adicione e processe os arquivos antes de salvar.',
      })
      return
    }

    // Validate reference dates on all ready items before starting
    const missingDateItems = readyItems.filter((item) => {
      const d = (item.referenteDate || globalReferenceDate || '').trim()
      return !d || !isValidDateDDMMAAAA(d)
    })

    if (missingDateItems.length > 0) {
      setGlobalDateError(
        'Informe uma Data de Referência válida (DD/MM/AAAA) para todos os arquivos.',
      )
      toast({
        title: 'Data de Referência obrigatória',
        description: 'Verifique os arquivos destacados com data ausente ou inválida.',
        variant: 'destructive',
      })
      setFileQueue((prev) =>
        prev.map((q) => {
          const d = (q.referenteDate || globalReferenceDate || '').trim()
          if (!d) {
            return {
              ...q,
              status: 'error',
              errorMessage: 'Data de Referência é obrigatória (ex: 20/08/2026).',
            }
          }
          if (!isValidDateDDMMAAAA(d)) {
            return { ...q, status: 'error', errorMessage: `Data inválida (${d}). Use DD/MM/AAAA.` }
          }
          return q
        }),
      )
      return
    }

    setGlobalDateError('')
    setIsProcessingAll(true)
    let successCount = 0

    for (const item of readyItems) {
      const ok = await saveItemToBackend(item)
      if (ok) successCount++
    }

    setIsProcessingAll(false)

    // Reload stores in background
    loadStores()

    toast({
      title: 'Importação concluída',
      description: `${successCount} de ${readyItems.length} lojas atualizadas no consolidado.`,
    })
  }

  const allCompleted = fileQueue.length > 0 && fileQueue.every((q) => q.status === 'done')

  return (
    <div className="space-y-6">
      {/* "Como funciona" Help banner */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-[#12365A]">
          <HelpCircle className="w-5 h-5 text-[#0E9F8A]" />
          <h2 className="text-sm font-bold tracking-tight uppercase">
            Como funciona a consolidação de arquivos .xlsx
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#5B6B82] pt-1">
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] space-y-1">
            <span className="font-bold text-[#12365A] block">1. Abas Móvel e Residencial</span>
            <p>
              Cada planilha de loja deve conter as abas <strong>Móvel</strong> e/ou{' '}
              <strong>Residencial</strong>. O sistema lê as linhas de ambas as abas e soma as
              ocorrências.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] space-y-1">
            <span className="font-bold text-[#12365A] block">2. Classificação Automática</span>
            <p>
              As ocorrências são agrupadas nos status do consolidado: Fatura(s) Paga(s), Enviado
              Fatura(s), Promessa de Pagto., Sem Contato, Cancelados, Pendente, Contato Realizado e
              Não Tratados. Célula vazia na coluna Ocorrências é ignorada nas quantidades (não entra
              em nenhuma categoria).
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] space-y-1">
            <span className="font-bold text-[#12365A] block">3. Consolidação em Tempo Real</span>
            <p>
              Apenas os totais somados são salvos. O consolidado geral é atualizado
              instantaneamente, preservando Coordenação e Supervisão.
            </p>
          </div>
        </div>
      </div>

      {/* Reference Date Card & Upload Dropzone */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#0E9F8A]" />
            <div>
              <h3 className="text-sm font-bold text-[#12365A]">
                Data de Referência da Importação <span className="text-red-500">*</span>
              </h3>
              <p className="text-xs text-[#5B6B82]">
                Data a que se referem os dados das planilhas importadas (obrigatório para
                consolidação e filtros históricos).
              </p>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <div className="relative">
              <Input
                value={globalReferenceDate}
                onChange={(e) => handleGlobalReferenceDateChange(e.target.value)}
                placeholder="DD/MM/AAAA (ex: 20/08/2026)"
                maxLength={10}
                className={cn(
                  'h-9 text-xs font-semibold tracking-wide bg-[#F8FAFC]',
                  globalDateError
                    ? 'border-red-500 focus-visible:ring-red-400'
                    : 'border-[#E3E9F2] focus:border-[#0E9F8A]',
                )}
              />
            </div>
            {globalDateError && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{globalDateError}</p>
            )}
          </div>
        </div>

        {/* Upload Dropzone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-[#0E9F8A] bg-[#0E9F8A]/5 scale-[0.99]'
              : 'border-[#cbd5e1] hover:border-[#0E9F8A] bg-[#FAFCFF] hover:bg-slate-50 shadow-xs',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
            }}
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#12365A]/5 flex items-center justify-center text-[#12365A]">
              <UploadCloud className="w-7 h-7 text-[#0E9F8A]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-[#12365A]">
                Arraste suas planilhas .xlsx aqui ou clique para selecionar
              </h3>
              <p className="text-xs text-[#5B6B82]">
                Selecione múltiplos arquivos das lojas simultaneamente.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-medium text-[#5B6B82]">
              <span>
                Formatos aceitos: <strong>.xlsx, .xls</strong>
              </span>
              <span>•</span>
              <span>
                Abas esperadas: <strong>Móvel / Residencial</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* File Queue List */}
      {fileQueue.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="text-base font-bold text-[#12365A]">
                Arquivos para Importação ({fileQueue.length})
              </h3>
              <p className="text-xs text-[#5B6B82]">
                Verifique o nome da loja e a data referente antes de consolidar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFileQueue([])}
                className="text-xs text-slate-500 hover:text-red-600"
                disabled={isProcessingAll}
              >
                Limpar lista
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={isProcessingAll || fileQueue.every((q) => q.status === 'done')}
                className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white text-xs font-semibold h-9 px-4 gap-2 shadow-sm"
              >
                {isProcessingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Consolidar Todos os Arquivos</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Queue Items */}
          <div className="space-y-3">
            {fileQueue.map((item) => {
              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-4 rounded-xl border transition-all text-xs',
                    item.status === 'done'
                      ? 'bg-green-50/50 border-green-200'
                      : item.status === 'error'
                        ? 'bg-red-50/50 border-red-200'
                        : 'bg-[#F8FAFC] border-[#E3E9F2]',
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* File info & status indicator */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5">
                        {item.status === 'parsing' && (
                          <Loader2 className="w-5 h-5 animate-spin text-[#0E9F8A]" />
                        )}
                        {item.status === 'saving' && (
                          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
                        )}
                        {item.status === 'ready' && (
                          <FileSpreadsheet className="w-5 h-5 text-[#12365A]" />
                        )}
                        {item.status === 'done' && (
                          <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="w-5 h-5 text-[#DC2626]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#12365A] truncate">
                            {item.file.name}
                          </span>
                          <span className="text-[10px] text-[#5B6B82]">
                            ({(item.file.size / 1024).toFixed(1)} KB)
                          </span>
                          {item.status === 'done' && (
                            <Badge className="bg-[#16A34A] text-white text-[10px] h-5">
                              Consolidado com sucesso
                            </Badge>
                          )}
                          {item.status === 'error' && (
                            <Badge className="bg-[#DC2626] text-white text-[10px] h-5">Erro</Badge>
                          )}
                        </div>

                        {/* Error message */}
                        {item.errorMessage && (
                          <p className="text-red-600 text-xs font-medium">{item.errorMessage}</p>
                        )}

                        {/* Breakdown summary preview if parsed */}
                        {item.parsedData && item.status !== 'error' && (
                          <div className="space-y-2 pt-1">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#5B6B82]">
                              <span>
                                Abas:{' '}
                                <strong>
                                  {[
                                    item.parsedData.sheetsFound.movel && 'Móvel',
                                    item.parsedData.sheetsFound.residencial && 'Residencial',
                                  ]
                                    .filter(Boolean)
                                    .join(' + ') || 'Nenhuma'}
                                </strong>
                              </span>
                              <span>•</span>
                              <span className="font-semibold text-[#12365A]">
                                Total:{' '}
                                {item.parsedData.aggregated.total_linhas.toLocaleString('pt-BR')}{' '}
                                ocorrências
                              </span>
                              <span>•</span>
                              <span className="text-[#0891B2] font-medium">
                                Pagas: {item.parsedData.aggregated.fatura_paga}
                              </span>
                              <span>•</span>
                              <span className="text-[#16A34A] font-medium">
                                Enviado: {item.parsedData.aggregated.envio_fatura}
                              </span>
                              <span>•</span>
                              <span className="text-[#9333EA] font-medium">
                                Promessa: {item.parsedData.aggregated.promessa_pagto}
                              </span>
                              <span>•</span>
                              <span className="text-[#64748B] font-medium">
                                Sem Contato: {item.parsedData.aggregated.sem_contato}
                              </span>
                              <span>•</span>
                              <span className="text-[#0F172A] font-medium">
                                Cancelados: {item.parsedData.aggregated.cancelados}
                              </span>
                              <span>•</span>
                              <span className="text-[#DC2626] font-medium">
                                Pendente: {item.parsedData.aggregated.pendente}
                              </span>
                              <span>•</span>
                              <span className="text-[#0D9488] font-medium">
                                Contato: {item.parsedData.aggregated.contato_realizado}
                              </span>
                              <span>•</span>
                              <span className="text-[#EA580C] font-medium">
                                Não Tratados: {item.parsedData.aggregated.nao_tratados}
                              </span>
                            </div>

                            {/* Column inspection toggle & display */}
                            {(item.parsedData.movelCounts?.columns?.length ||
                              item.parsedData.residencialCounts?.columns?.length) && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleColumnsExpanded(item.id)
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#12365A] hover:text-[#0E9F8A] bg-white border border-[#E3E9F2] px-2.5 py-1 rounded-md transition-colors"
                                >
                                  <TableProperties className="w-3.5 h-3.5 text-[#0E9F8A]" />
                                  <span>
                                    {expandedColumnsMap[item.id]
                                      ? 'Ocultar colunas detectadas'
                                      : 'Ver colunas detectadas nas abas'}
                                  </span>
                                  {expandedColumnsMap[item.id] ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>

                                {expandedColumnsMap[item.id] && (
                                  <div className="mt-2.5 space-y-3 bg-white p-3.5 rounded-lg border border-[#E3E9F2] text-xs shadow-xs">
                                    {/* Aba Móvel */}
                                    {item.parsedData.movelCounts && (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className="bg-[#12365A]/5 text-[#12365A] border-[#12365A]/20 font-bold text-[10px]"
                                          >
                                            Aba Móvel ({item.parsedData.movelCounts.sheetName})
                                          </Badge>
                                          <span className="text-[11px] text-[#5B6B82]">
                                            {item.parsedData.movelCounts.columns?.length || 0}{' '}
                                            colunas encontradas
                                          </span>
                                        </div>
                                        {item.parsedData.movelCounts.columns &&
                                        item.parsedData.movelCounts.columns.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                                            {item.parsedData.movelCounts.columns.map((col) => {
                                              const isKeyCol =
                                                col.letter === 'D' ||
                                                col.letter === 'E' ||
                                                col.letter === 'AE'
                                              return (
                                                <span
                                                  key={`movel-${col.letter}-${col.columnIndex}`}
                                                  className={cn(
                                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]',
                                                    isKeyCol
                                                      ? 'bg-[#0E9F8A]/10 text-[#0E9F8A] font-semibold border border-[#0E9F8A]/30'
                                                      : 'bg-slate-100 text-[#334155]',
                                                  )}
                                                  title={`Coluna ${col.letter} (índice ${col.columnIndex}): ${col.name}`}
                                                >
                                                  <strong className="text-[#12365A] font-mono">
                                                    {col.letter}:
                                                  </strong>{' '}
                                                  <span className="truncate max-w-[200px]">
                                                    {col.name}
                                                  </span>
                                                  {isKeyCol && (
                                                    <span className="text-[9px] bg-[#0E9F8A] text-white rounded px-1 ml-0.5">
                                                      {col.letter === 'D'
                                                        ? 'Vendedor'
                                                        : col.letter === 'E'
                                                          ? 'Loja'
                                                          : 'Qtd'}
                                                    </span>
                                                  )}
                                                </span>
                                              )
                                            })}
                                          </div>
                                        ) : (
                                          <p className="text-[11px] text-slate-400 italic">
                                            Nenhum cabeçalho detectado nesta aba.
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Aba Residencial */}
                                    {item.parsedData.residencialCounts && (
                                      <div className="space-y-1.5 pt-2 border-t border-[#F1F5F9]">
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className="bg-[#0E9F8A]/5 text-[#0E9F8A] border-[#0E9F8A]/20 font-bold text-[10px]"
                                          >
                                            Aba Residencial (
                                            {item.parsedData.residencialCounts.sheetName})
                                          </Badge>
                                          <span className="text-[11px] text-[#5B6B82]">
                                            {item.parsedData.residencialCounts.columns?.length || 0}{' '}
                                            colunas encontradas
                                          </span>
                                        </div>
                                        {item.parsedData.residencialCounts.columns &&
                                        item.parsedData.residencialCounts.columns.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                                            {item.parsedData.residencialCounts.columns.map(
                                              (col) => {
                                                const isKeyCol =
                                                  col.letter === 'AU' ||
                                                  col.letter === 'AV' ||
                                                  col.letter === 'AW'
                                                return (
                                                  <span
                                                    key={`res-${col.letter}-${col.columnIndex}`}
                                                    className={cn(
                                                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]',
                                                      isKeyCol
                                                        ? 'bg-[#0E9F8A]/10 text-[#0E9F8A] font-semibold border border-[#0E9F8A]/30'
                                                        : 'bg-slate-100 text-[#334155]',
                                                    )}
                                                    title={`Coluna ${col.letter} (índice ${col.columnIndex}): ${col.name}`}
                                                  >
                                                    <strong className="text-[#12365A] font-mono">
                                                      {col.letter}:
                                                    </strong>{' '}
                                                    <span className="truncate max-w-[200px]">
                                                      {col.name}
                                                    </span>
                                                    {isKeyCol && (
                                                      <span className="text-[9px] bg-[#0E9F8A] text-white rounded px-1 ml-0.5">
                                                        {col.letter === 'AU'
                                                          ? 'Loja'
                                                          : col.letter === 'AV'
                                                            ? 'Vendedor'
                                                            : 'Qtd'}
                                                      </span>
                                                    )}
                                                  </span>
                                                )
                                              },
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-[11px] text-slate-400 italic">
                                            Nenhum cabeçalho detectado nesta aba.
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Store and referente selectors */}
                    {item.status !== 'done' && (
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Store selection */}
                        <div className="w-full sm:w-56">
                          <label className="text-[10px] font-bold text-[#5B6B82] uppercase block mb-1">
                            Loja Destino
                          </label>
                          <select
                            value={item.matchedStoreId}
                            onChange={(e) => {
                              const val = e.target.value
                              setFileQueue((prev) =>
                                prev.map((q) => {
                                  if (q.id !== item.id) return q
                                  if (val === 'new') {
                                    return {
                                      ...q,
                                      matchedStoreId: 'new',
                                      newStoreName: q.parsedData?.guessedStoreName || '',
                                    }
                                  }
                                  const selectedStore = stores.find((s) => s.id === val)
                                  return {
                                    ...q,
                                    matchedStoreId: val,
                                    newStoreName: selectedStore?.name || '',
                                  }
                                }),
                              )
                            }}
                            className="w-full h-8 text-xs rounded-md border border-[#E3E9F2] bg-white px-2 text-[#12233A] focus:outline-none focus:border-[#0E9F8A]"
                          >
                            <option value="new">Criar nova loja</option>
                            {stores.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* If new store name input */}
                        {item.matchedStoreId === 'new' && (
                          <div className="w-full sm:w-48">
                            <label className="text-[10px] font-bold text-[#5B6B82] uppercase block mb-1">
                              Nome da Nova Loja
                            </label>
                            <Input
                              value={item.newStoreName}
                              onChange={(e) =>
                                setFileQueue((prev) =>
                                  prev.map((q) =>
                                    q.id === item.id ? { ...q, newStoreName: e.target.value } : q,
                                  ),
                                )
                              }
                              placeholder="Nome da loja"
                              className="h-8 text-xs bg-white uppercase"
                            />
                          </div>
                        )}

                        {/* Referente date */}
                        <div className="w-full sm:w-36">
                          <label className="text-[10px] font-bold text-[#5B6B82] uppercase block mb-1">
                            Data de Referência <span className="text-red-500">*</span>
                          </label>
                          <Input
                            value={item.referenteDate}
                            onChange={(e) => {
                              const masked = applyDateMask(e.target.value)
                              setFileQueue((prev) =>
                                prev.map((q) =>
                                  q.id === item.id ? { ...q, referenteDate: masked } : q,
                                ),
                              )
                            }}
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                            className={cn(
                              'h-8 text-xs bg-white',
                              !item.referenteDate || !isValidDateDDMMAAAA(item.referenteDate)
                                ? 'border-amber-400 focus-visible:ring-amber-300'
                                : 'border-[#E3E9F2]',
                            )}
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 self-end">
                          <Button
                            onClick={() => saveItemToBackend(item)}
                            disabled={item.status === 'saving' || item.status === 'parsing'}
                            size="sm"
                            className="h-8 bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs px-2.5"
                          >
                            {item.status === 'saving' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Salvar'
                            )}
                          </Button>
                          <Button
                            onClick={() => removeItem(item.id)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-white"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Success footer actions */}
          {allCompleted && (
            <div className="p-4 rounded-xl bg-[#0E9F8A]/10 border border-[#0E9F8A]/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#0E9F8A]">
                <Check className="w-5 h-5 font-bold" />
                <span className="font-bold text-xs sm:text-sm text-[#12365A]">
                  Todos os arquivos foram consolidados com sucesso!
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/vendedores')}
                  className="bg-white hover:bg-slate-50 text-[#12365A] text-xs font-semibold gap-2 border-[#0E9F8A]/40"
                >
                  <span>Ver Ranking por Vendedor</span>
                </Button>
                <Button
                  onClick={() => navigate('/')}
                  className="bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs font-semibold gap-2"
                >
                  <span>Ver Tabela Consolidada</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Importar
