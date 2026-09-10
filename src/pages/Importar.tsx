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
  Smartphone,
  Home,
  X,
  Store,
  Users,
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
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  fetchStores,
  createStore,
  saveFpdRecord,
  saveImportedFile,
  findStoreByName,
  saveVendorConsolidationsFromLines,
  matchStore,
  fetchDistinctReferenceDates,
} from '@/services/fpdService'
import { parseXlsxFile, classifyRow, guessStoreName, type ParsedFileData } from '@/lib/xlsxParser'
import type { ParsedVendorLine } from '@/types/fpd'
import {
  parseBatchXlsxFile,
  executeBatchImport,
  type BatchImportType,
  type ParsedBatchData,
} from '@/services/batchImportService'
import { parseAnalyticalXlsxFile } from '@/lib/analyticalImportParser'
import {
  insertMovelBatch,
  insertResidencialBatch,
  type MovelInsertItem,
  type ResidencialInsertItem,
} from '@/services/relacionamentoService'
import { FPD_STATUSES, type StoreRecord } from '@/types/fpd'
import { useAuth } from '@/contexts/AuthContext'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
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
  const { user } = useAuth()
  const { isAdm } = useUserStoreAccess()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stores, setStores] = useState<StoreRecord[]>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [globalReferenceDate, setGlobalReferenceDate] = useState<string>('')
  const [globalDateError, setGlobalDateError] = useState<string>('')
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([])
  const [expandedColumnsMap, setExpandedColumnsMap] = useState<Record<string, boolean>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingAll, setIsProcessingAll] = useState(false)

  // Batch import state
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchType, setBatchType] = useState<BatchImportType>('movel')
  const [batchFile, setBatchFile] = useState<File | null>(null)
  const [batchRefDate, setBatchRefDate] = useState<string>('')
  const [batchRefDateError, setBatchRefDateError] = useState<string>('')
  const [isParsingBatch, setIsParsingBatch] = useState(false)
  const [batchParsedData, setBatchParsedData] = useState<ParsedBatchData | null>(null)
  const [isExecutingBatch, setIsExecutingBatch] = useState(false)
  const [batchProgressMsg, setBatchProgressMsg] = useState('')
  const [batchProgressPct, setBatchProgressPct] = useState(0)
  const [batchImportDone, setBatchImportDone] = useState(false)
  const [batchExecutionResult, setBatchExecutionResult] = useState<{
    storesCount: number
    totalFpdUpdated: number
    totalVendorSaved: number
    totalAnalyticalInserted: number
  } | null>(null)
  const batchFileInputRef = useRef<HTMLInputElement>(null)

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
    if (!isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'A importação de arquivos é permitida apenas para o perfil ADM.',
        variant: 'destructive',
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

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
    if (!isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas usuários com perfil ADM podem salvar dados consolidados no sistema.',
        variant: 'destructive',
      })
      return false
    }

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

      // Sempre buscar a lista atualizada de lojas do backend para evitar cache desatualizado ou race conditions
      const liveStores = await fetchStores()
      let currentStores = liveStores.length > 0 ? liveStores : stores

      let storeId = item.matchedStoreId
      let finalStoreName = (item.newStoreName || item.parsedData.guessedStoreName || '')
        .trim()
        .toUpperCase()

      // 1. Tentar resolver a loja contra a lista atualizada
      let matchedStore: StoreRecord | null = null
      if (storeId && storeId !== 'new') {
        matchedStore = currentStores.find((s) => s.id === storeId) || null
      }
      if (!matchedStore && finalStoreName) {
        matchedStore = matchStore(finalStoreName, currentStores)
      }

      // 2. Se encontrou loja cadastrada, garante storeId e nome oficial
      if (matchedStore) {
        storeId = matchedStore.id
        finalStoreName = matchedStore.name
      } else {
        // Se a loja não existe em stores, cria-a imediatamente (com upper case e sem espaços sobressalentes)
        const nameToCreate = finalStoreName || guessStoreName(item.file.name)
        try {
          const created = await createStore({
            name: nameToCreate,
          })
          storeId = created.id
          finalStoreName = created.name
          currentStores = [...currentStores, created]
          setStores(currentStores)
        } catch (createErr: unknown) {
          // Se falhar por colisão unique/concorrência, busca novamente por nome
          const foundAfterErr = await findStoreByName(nameToCreate, currentStores)
          if (foundAfterErr) {
            storeId = foundAfterErr.id
            finalStoreName = foundAfterErr.name
          } else {
            console.error(
              '[Importar] Falha crítica ao criar/resolver loja para fpd_records:',
              createErr,
            )
            throw new Error(
              `Não foi possível vincular ou criar a loja "${nameToCreate}" para gravação no consolidado.`,
            )
          }
        }
      }

      if (!storeId || storeId === 'new') {
        throw new Error(
          `ID de loja inválido para "${finalStoreName}". O registro consolidado exige vínculo com uma loja válida.`,
        )
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
      // Se vendorLines não veio populado no parsedData (ex.: planilhas sem aba analítica direta ou sem colunas vendedor),
      // extraímos as linhas de clientes lendo as abas analíticas Móvel/Residencial do próprio arquivo.
      let vendorLinesToSave: ParsedVendorLine[] = item.parsedData.vendorLines || []

      // 4. Save analytical customer lines in 'movel' and 'residencial' collections
      // Re-read file with parseAnalyticalXlsxFile to extract full row objects with columns and occurrences
      try {
        const analyticalData = await parseAnalyticalXlsxFile(item.file)

        // Se vendorLines da etapa 3 estiver vazio, extraímos das abas analíticas lidas
        if (vendorLinesToSave.length === 0) {
          const synthesizedLines: ParsedVendorLine[] = []
          if (analyticalData.movelSheet && analyticalData.movelSheet.rows.length > 0) {
            for (const r of analyticalData.movelSheet.rows) {
              const cat = classifyRow([r.ocorrencias || ''])
              if (cat) {
                synthesizedLines.push({
                  vendedor: r.vendedor || 'NÃO INFORMADO',
                  loja: r.loja || finalStoreName,
                  status: cat,
                  quantidade: 1,
                })
              }
            }
          }
          if (analyticalData.residencialSheet && analyticalData.residencialSheet.rows.length > 0) {
            for (const r of analyticalData.residencialSheet.rows) {
              const cat = classifyRow([r.ocorrencias || ''])
              if (cat) {
                synthesizedLines.push({
                  vendedor: r.vendedor || 'NÃO INFORMADO',
                  loja: r.loja || finalStoreName,
                  status: cat,
                  quantidade: 1,
                })
              }
            }
          }
          if (synthesizedLines.length > 0) {
            vendorLinesToSave = synthesizedLines
          }
        }

        // 4.1 Móvel rows
        if (analyticalData.movelSheet && analyticalData.movelSheet.rows.length > 0) {
          const movelBatchData: MovelInsertItem[] = analyticalData.movelSheet.rows.map((r) => {
            let normalizedLoja = r.loja?.trim() || finalStoreName
            if (normalizedLoja) {
              const matched = matchStore(normalizedLoja, currentStores)
              if (matched) {
                normalizedLoja = matched.name
              }
            }
            return {
              arquivo: item.file.name,
              linha: r.linha,
              loja: normalizedLoja,
              vendedor: r.vendedor,
              cliente: r.cliente,
              dados: r.dados,
              data_referencia: refDate,
              ocorrencias: r.ocorrencias,
            }
          })
          await insertMovelBatch(movelBatchData)
        }

        // 4.2 Residencial rows
        if (analyticalData.residencialSheet && analyticalData.residencialSheet.rows.length > 0) {
          const resBatchData: ResidencialInsertItem[] = analyticalData.residencialSheet.rows.map(
            (r) => {
              let normalizedLoja = r.loja?.trim() || finalStoreName
              if (normalizedLoja) {
                const matched = matchStore(normalizedLoja, currentStores)
                if (matched) {
                  normalizedLoja = matched.name
                }
              }
              return {
                arquivo: item.file.name,
                linha: r.linha,
                loja: normalizedLoja,
                vendedor: r.vendedor,
                cliente: r.cliente,
                dados: r.dados,
                data_referencia: refDate,
                typedFields: r.typedFields,
                ocorrencias: r.ocorrencias,
              }
            },
          )
          await insertResidencialBatch(resBatchData)
        }
      } catch (analyticalErr: unknown) {
        console.warn(
          `[Importar] Aviso ao gravar linhas analíticas em Móvel/Residencial para "${item.file.name}":`,
          analyticalErr,
        )
      }

      // Gravar vendor_consolidations com supervisão resolvida
      if (vendorLinesToSave.length > 0) {
        const linesToSave = vendorLinesToSave.map((vl) => ({
          ...vl,
          loja: vl.loja || finalStoreName,
        }))
        await saveVendorConsolidationsFromLines(linesToSave, refDate, currentStores)
      }

      // 4. Save analytical customer lines in 'movel' and 'residencial' collections
      // Re-read file with parseAnalyticalXlsxFile to extract full row objects with columns and occurrences
      try {
        const analyticalData = await parseAnalyticalXlsxFile(item.file)

        // 4.1 Móvel rows
        if (analyticalData.movelSheet && analyticalData.movelSheet.rows.length > 0) {
          const movelBatchData: MovelInsertItem[] = analyticalData.movelSheet.rows.map((r) => {
            let normalizedLoja = r.loja?.trim() || finalStoreName
            if (normalizedLoja) {
              const matched = matchStore(normalizedLoja, stores)
              if (matched) {
                normalizedLoja = matched.name
              }
            }
            return {
              arquivo: item.file.name,
              linha: r.linha,
              loja: normalizedLoja,
              vendedor: r.vendedor,
              cliente: r.cliente,
              dados: r.dados,
              data_referencia: refDate,
              ocorrencias: r.ocorrencias,
            }
          })
          await insertMovelBatch(movelBatchData)
        }

        // 4.2 Residencial rows
        if (analyticalData.residencialSheet && analyticalData.residencialSheet.rows.length > 0) {
          const resBatchData: ResidencialInsertItem[] = analyticalData.residencialSheet.rows.map(
            (r) => {
              let normalizedLoja = r.loja?.trim() || finalStoreName
              if (normalizedLoja) {
                const matched = matchStore(normalizedLoja, stores)
                if (matched) {
                  normalizedLoja = matched.name
                }
              }
              return {
                arquivo: item.file.name,
                linha: r.linha,
                loja: normalizedLoja,
                vendedor: r.vendedor,
                cliente: r.cliente,
                dados: r.dados,
                data_referencia: refDate,
                typedFields: r.typedFields,
                ocorrencias: r.ocorrencias,
              }
            },
          )
          await insertResidencialBatch(resBatchData)
        }
      } catch (analyticalErr: unknown) {
        console.warn(
          `[Importar] Aviso ao gravar linhas analíticas em Móvel/Residencial para "${item.file.name}":`,
          analyticalErr,
        )
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
    if (!isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas usuários com perfil ADM podem executar a consolidação de arquivos.',
        variant: 'destructive',
      })
      return
    }

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

  // Open batch import modal for selected type
  const openBatchModal = async (type: BatchImportType) => {
    if (!isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'A importação em lote é restrita ao perfil ADM.',
        variant: 'destructive',
      })
      return
    }

    setBatchType(type)
    setBatchFile(null)
    setBatchRefDateError('')
    setBatchParsedData(null)
    setIsParsingBatch(false)
    setIsExecutingBatch(false)
    setBatchImportDone(false)
    setBatchExecutionResult(null)
    setBatchProgressMsg('')
    setBatchProgressPct(0)

    let initialDate = (globalReferenceDate || '').trim()
    if (!initialDate) {
      try {
        const distinctDates = await fetchDistinctReferenceDates()
        if (distinctDates.length > 0 && distinctDates[0]) {
          initialDate = distinctDates[0].trim()
        }
      } catch {
        // ignore fallback error
      }
    }
    setBatchRefDate(initialDate)
    setBatchModalOpen(true)
  }

  // Handle batch file selection
  const handleBatchFileSelected = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: 'Arquivo inválido',
        description: 'O arquivo precisa ser uma planilha Excel (.xlsx ou .xls).',
        variant: 'destructive',
      })
      return
    }

    setBatchFile(file)
    setIsParsingBatch(true)
    setBatchParsedData(null)
    setBatchImportDone(false)

    try {
      const parsed = await parseBatchXlsxFile(file, batchType, stores)
      setBatchParsedData(parsed)

      if (parsed.totalValidRows === 0) {
        toast({
          title: 'Nenhuma ocorrência válida encontrada',
          description: `O arquivo foi lido, mas nenhuma linha com ocorrência válida foi encontrada na aba ${parsed.targetSheetName}. As linhas vazias foram expurgadas.`,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao processar arquivo em lote',
        description: msg,
        variant: 'destructive',
      })
      setBatchFile(null)
    } finally {
      setIsParsingBatch(false)
      if (batchFileInputRef.current) {
        batchFileInputRef.current.value = ''
      }
    }
  }

  // Execute batch import
  const handleExecuteBatch = async () => {
    if (!isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'A importação em lote é exclusiva do perfil ADM.',
        variant: 'destructive',
      })
      return
    }

    if (!batchParsedData) return

    const refDate = (batchRefDate || '').trim()
    if (!refDate) {
      setBatchRefDateError('Data de Referência é obrigatória no modal (ex: 26/08/2026).')
      toast({
        title: 'Data de Referência obrigatória',
        description: 'Informe a Data de Referência no modal antes de iniciar a importação em lote.',
        variant: 'destructive',
      })
      return
    }

    if (!isValidDateDDMMAAAA(refDate)) {
      setBatchRefDateError('Formato inválido. Use DD/MM/AAAA (ex: 26/08/2026).')
      toast({
        title: 'Data de Referência inválida',
        description: `A data "${refDate}" não é uma data válida no formato DD/MM/AAAA.`,
        variant: 'destructive',
      })
      return
    }

    setBatchRefDateError('')
    setIsExecutingBatch(true)
    setBatchProgressMsg('Iniciando gravação...')
    setBatchProgressPct(5)

    try {
      const result = await executeBatchImport(batchParsedData, refDate, stores, (step, pct) => {
        setBatchProgressMsg(step)
        setBatchProgressPct(pct)
      })

      setBatchExecutionResult(result)
      setBatchImportDone(true)
      loadStores()

      toast({
        title: `Importação em Lote — ${batchType === 'movel' ? 'Móvel' : 'Residencial'} Concluída!`,
        description: `${result.storesCount} loja(s) processadas, ${result.totalAnalyticalInserted} registros analíticos gravados e ranking de vendedores atualizado.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Erro na importação em lote',
        description: msg || 'Ocorreu um erro ao salvar os registros.',
        variant: 'destructive',
      })
    } finally {
      setIsExecutingBatch(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner de restrição de perfil caso acessado por não-ADM */}
      {!isAdm && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-950 shadow-xs">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm sm:text-base text-amber-950">
                Acesso Restrito ao Administrador (ADM)
              </h3>
              <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[10px]">
                Perfil atual: {user?.role || 'Usuário'}
              </Badge>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              A importação de arquivos e consolidação de planilhas está restrita exclusivamente ao
              perfil <strong>ADM</strong>. Perfis como Gerentes, Coordenadores e Supervisores
              possuem acesso para consulta e tratamento nas demais telas do sistema, mas não podem
              subir arquivos ou alterar as consolidações.
            </p>
            <div className="pt-1">
              <Link to="/">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs h-8 gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Ir para o Painel Consolidado</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Batch Import Action Banner */}
      <div className="bg-gradient-to-r from-[#12365A] via-[#1a4975] to-[#0E9F8A] rounded-xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-bold tracking-wide uppercase text-[#E0F2FE]">
            <Layers className="w-3.5 h-3.5 text-[#0E9F8A]" />
            <span>Novo • Importação de Arquivo Único Multi-Loja</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            Importação em Lote de Todas as Lojas
          </h2>
          <p className="text-xs text-slate-200 max-w-2xl">
            Importe um único arquivo .xlsx contendo dados de todas as lojas simultaneamente. O
            sistema identifica a Loja e o Vendedor pelas mesmas colunas da planilha e consolida os
            dados automaticamente de forma separada para Móvel e Residencial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            disabled={!isAdm}
            onClick={() => openBatchModal('movel')}
            title={!isAdm ? 'Importação exclusiva do perfil ADM' : undefined}
            className={cn(
              'font-bold text-xs h-10 px-4 shadow-sm gap-2 transition-all',
              isAdm
                ? 'bg-white hover:bg-slate-100 text-[#12365A] hover:scale-[1.02]'
                : 'bg-white/40 text-slate-300 cursor-not-allowed opacity-60',
            )}
          >
            <Smartphone className="w-4 h-4" />
            <span>Importar em Lote — Móvel</span>
          </Button>

          <Button
            type="button"
            disabled={!isAdm}
            onClick={() => openBatchModal('residencial')}
            title={!isAdm ? 'Importação exclusiva do perfil ADM' : undefined}
            className={cn(
              'font-bold text-xs h-10 px-4 shadow-sm gap-2 border border-white/20 transition-all',
              isAdm
                ? 'bg-[#0E9F8A] hover:bg-[#0c8a77] text-white hover:scale-[1.02]'
                : 'bg-[#0E9F8A]/40 text-slate-200 cursor-not-allowed opacity-60',
            )}
          >
            <Home className="w-4 h-4 text-white" />
            <span>Importar em Lote — Residencial</span>
          </Button>
        </div>
      </div>
      {/* Section Header: Importação Loja a Loja (Protagonismo Restaurado) */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#12365A]/10 text-[#12365A]">
              <Store className="w-6 h-6 text-[#12365A]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#12365A]/5 text-[#12365A] text-[10px] font-bold uppercase tracking-wide mb-1">
                <span>Fluxo Tradicional</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#12365A] tracking-tight">
                Importação Loja a Loja (Arquivo Individual de Loja)
              </h2>
              <p className="text-xs text-[#5B6B82]">
                Processe a planilha individual de cada loja contendo as abas <strong>Móvel</strong>{' '}
                e/ou <strong>Residencial</strong>. O sistema soma as ocorrências de ambas as abas,
                consolida a loja, atualiza o ranking de vendedores e grava a base analítica de
                clientes para tratamento individual.
              </p>
            </div>
          </div>

          {/* Reference Date Input */}
          <div className="w-full sm:w-64 shrink-0 bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E3E9F2]">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-[#12365A]">
              <Calendar className="w-3.5 h-3.5 text-[#0E9F8A]" />
              <span>Data de Referência</span>
              <span className="text-red-500">*</span>
            </div>
            <Input
              value={globalReferenceDate}
              onChange={(e) => handleGlobalReferenceDateChange(e.target.value)}
              placeholder="DD/MM/AAAA (ex: 20/08/2026)"
              maxLength={10}
              className={cn(
                'h-8 text-xs font-semibold tracking-wide bg-white',
                globalDateError
                  ? 'border-red-500 focus-visible:ring-red-400'
                  : 'border-[#E3E9F2] focus:border-[#0E9F8A]',
              )}
            />
            {globalDateError && (
              <p className="text-[10px] text-red-600 mt-1 font-medium">{globalDateError}</p>
            )}
          </div>
        </div>

        {/* Upload Dropzone */}
        <div
          onDragOver={isAdm ? onDragOver : (e) => e.preventDefault()}
          onDragLeave={isAdm ? onDragLeave : undefined}
          onDrop={isAdm ? onDrop : (e) => e.preventDefault()}
          onClick={() => {
            if (isAdm) {
              fileInputRef.current?.click()
            } else {
              toast({
                title: 'Acesso Restrito',
                description: 'Apenas o perfil ADM possui permissão para importar arquivos.',
                variant: 'destructive',
              })
            }
          }}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all',
            !isAdm
              ? 'border-slate-200 bg-slate-50/60 cursor-not-allowed opacity-70'
              : isDragging
                ? 'border-[#0E9F8A] bg-[#0E9F8A]/5 scale-[0.99] cursor-pointer'
                : 'border-[#cbd5e1] hover:border-[#0E9F8A] bg-[#FAFCFF] hover:bg-slate-50 shadow-xs cursor-pointer',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            multiple
            disabled={!isAdm}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
            }}
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center',
                isAdm ? 'bg-[#12365A]/5 text-[#12365A]' : 'bg-slate-200/60 text-slate-400',
              )}
            >
              <UploadCloud className={cn('w-7 h-7', isAdm ? 'text-[#0E9F8A]' : 'text-slate-400')} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-[#12365A]">
                {isAdm
                  ? 'Arraste os arquivos .xlsx individuais das lojas aqui ou clique para selecionar'
                  : 'Importação bloqueada: exclusivo do perfil Administrador (ADM)'}
              </h3>
              <p className="text-xs text-[#5B6B82]">
                {isAdm
                  ? 'Selecione um ou múltiplos arquivos de lojas simultaneamente para consolidar.'
                  : 'Usuários Gerentes, Coordenadores e Supervisores não possuem permissão para upload.'}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-medium text-[#5B6B82]">
              <span>
                Formatos aceitos: <strong>.xlsx, .xls</strong>
              </span>
              <span>•</span>
              <span>
                Abas lidas: <strong>Móvel e Residencial (somadas)</strong>
              </span>
              <span>•</span>
              <span>
                Gravação: <strong>Consolidado + Vendedores + Clientes (Móvel/Residencial)</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

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
            <span className="font-bold text-[#12365A] block">
              1. Abas Móvel e Residencial Somadas
            </span>
            <p>
              Cada planilha de loja contém as abas <strong>Móvel</strong> e/ou{' '}
              <strong>Residencial</strong>. O fluxo loja a loja lê ambas as abas, soma as
              ocorrências no consolidado geral e salva as linhas de clientes para tratamento
              individual.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] space-y-1">
            <span className="font-bold text-[#12365A] block">
              2. Classificação Automática e Expurgo
            </span>
            <p>
              As ocorrências válidas são agrupadas nos status oficiais (Fatura Paga, Enviado Fatura,
              Promessa, Sem Contato, Cancelados, Pendente, Contato e Não Tratados). Células vazias
              na coluna Ocorrências são <strong>expurgadas</strong> e não entram em nenhuma
              quantidade.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] space-y-1">
            <span className="font-bold text-[#12365A] block">3. Substituição e Sem Duplicação</span>
            <p>
              Ao reimportar o mesmo arquivo, os dados da loja e data de referência são
              atualizados/substituídos, preservando anotações manuais já realizadas sem somar dados
              duplicados.
            </p>
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

      {/* Batch Import Dialog Modal */}
      <Dialog
        open={batchModalOpen}
        onOpenChange={(open) => {
          if (!isExecutingBatch) {
            setBatchModalOpen(open)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-6 space-y-4">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center',
                    batchType === 'movel'
                      ? 'bg-[#12365A]/10 text-[#12365A]'
                      : 'bg-[#0E9F8A]/10 text-[#0E9F8A]',
                  )}
                >
                  {batchType === 'movel' ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <Home className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A]">
                    Importação em Lote — {batchType === 'movel' ? 'Móvel' : 'Residencial'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#5B6B82]">
                    Arquivo único contendo dados de todas as lojas. Colunas LOJA e VENDEDOR serão
                    lidas automaticamente.
                  </DialogDescription>
                </div>
              </div>

              <Badge
                variant="outline"
                className={cn(
                  'text-xs font-bold px-2.5 py-1',
                  batchType === 'movel'
                    ? 'bg-blue-50 text-[#12365A] border-blue-200'
                    : 'bg-teal-50 text-[#0E9F8A] border-teal-200',
                )}
              >
                Aba: {batchType === 'movel' ? 'Móvel' : 'Residencial'}
              </Badge>
            </div>
          </DialogHeader>

          {/* Reference Date input */}
          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E3E9F2] space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0E9F8A]" />
                <div>
                  <span className="text-xs font-bold text-[#12365A] block">
                    Data de Referência da Importação <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[11px] text-[#5B6B82]">
                    Data referente aos registros do lote (ex: 20/08/2026).
                  </span>
                </div>
              </div>
              <div className="w-full sm:w-56">
                <Input
                  value={batchRefDate}
                  disabled={isExecutingBatch}
                  onChange={(e) => {
                    const masked = applyDateMask(e.target.value)
                    setBatchRefDate(masked)
                    if (batchRefDateError) setBatchRefDateError('')
                  }}
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                  className={cn(
                    'h-9 text-xs font-semibold bg-white',
                    batchRefDateError
                      ? 'border-red-500 focus-visible:ring-red-400'
                      : 'border-[#E3E9F2] focus:border-[#0E9F8A]',
                  )}
                />
                {batchRefDateError && (
                  <p className="text-[10px] text-red-600 mt-1 font-medium">{batchRefDateError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Hidden File Input for Batch */}
          <input
            ref={batchFileInputRef}
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleBatchFileSelected(e.target.files[0])
              }
            }}
          />

          {/* File Selector Dropzone */}
          {!batchFile ? (
            <div
              onClick={() => batchFileInputRef.current?.click()}
              className="border-2 border-dashed border-[#cbd5e1] hover:border-[#0E9F8A] bg-[#FAFCFF] hover:bg-slate-50 rounded-xl p-8 text-center cursor-pointer transition-all space-y-2"
            >
              <div className="w-12 h-12 rounded-xl bg-[#12365A]/5 text-[#0E9F8A] mx-auto flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-[#12365A]">
                  Clique para selecionar o arquivo .xlsx de{' '}
                  {batchType === 'movel' ? 'Móvel' : 'Residencial'} em lote
                </p>
                <p className="text-xs text-[#5B6B82]">
                  Contendo todas as lojas em um único arquivo
                </p>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-[10px] font-medium text-[#5B6B82]">
                  Coluna <strong>LOJA</strong> e <strong>VENDEDOR</strong> identificadas
                  automaticamente
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-xl border border-[#E3E9F2] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-teal-50 text-[#0E9F8A]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-[#12365A] block">{batchFile.name}</span>
                    <span className="text-[10px] text-[#5B6B82]">
                      {(batchFile.size / 1024).toFixed(1)} KB • Aba processada:{' '}
                      <strong>{batchParsedData?.targetSheetName || 'Detectando...'}</strong>
                    </span>
                  </div>
                </div>

                {!isExecutingBatch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBatchFile(null)
                      setBatchParsedData(null)
                      setBatchImportDone(false)
                    }}
                    className="text-xs text-slate-500 hover:text-red-600 h-8"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Trocar arquivo
                  </Button>
                )}
              </div>

              {isParsingBatch && (
                <div className="flex items-center justify-center py-6 gap-2 text-xs text-[#5B6B82]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0E9F8A]" />
                  <span>Lendo e agrupando dados de todas as lojas...</span>
                </div>
              )}

              {/* Parsed Summary Table */}
              {batchParsedData && (
                <div className="space-y-3 pt-2 border-t border-[#E3E9F2]">
                  {/* Totals Header Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2]">
                      <span className="text-[10px] text-[#5B6B82] uppercase font-bold block">
                        Lojas Encontradas
                      </span>
                      <span className="text-base font-bold text-[#12365A]">
                        {batchParsedData.storeSummaries.length}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2]">
                      <span className="text-[10px] text-[#5B6B82] uppercase font-bold block">
                        Ocorrências Válidas
                      </span>
                      <span className="text-base font-bold text-[#0E9F8A]">
                        {batchParsedData.totalValidRows.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2]">
                      <span className="text-[10px] text-[#5B6B82] uppercase font-bold block">
                        Vendedores
                      </span>
                      <span className="text-base font-bold text-[#12365A]">
                        {batchParsedData.vendorLines.length.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200">
                      <span className="text-[10px] text-amber-700 uppercase font-bold block">
                        Células Vazias (Expurgadas)
                      </span>
                      <span className="text-base font-bold text-amber-900">
                        {batchParsedData.totalExpurgadasRows.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Store by store breakdown table */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#12365A]">
                        Resumo por Loja Encontrada ({batchParsedData.storeSummaries.length})
                      </span>
                      <span className="text-[10px] text-[#5B6B82]">
                        Correspondência canônica com cadastro existente
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto border border-[#E3E9F2] rounded-lg">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-[#F8FAFC] border-b border-[#E3E9F2] sticky top-0 text-[#12365A] font-bold">
                          <tr>
                            <th className="p-2">Loja (Planilha ➔ Canônica)</th>
                            <th className="p-2 text-right">Total</th>
                            <th className="p-2 text-right text-[#0891B2]">Pagas</th>
                            <th className="p-2 text-right text-[#16A34A]">Enviado</th>
                            <th className="p-2 text-right text-[#9333EA]">Promessa</th>
                            <th className="p-2 text-right text-[#64748B]">Sem Contato</th>
                            <th className="p-2 text-right text-[#DC2626]">Pendente</th>
                            <th className="p-2 text-right text-[#EA580C]">Não Tratados</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E9F2]">
                          {batchParsedData.storeSummaries.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2">
                                <span className="font-bold text-[#12365A] block truncate max-w-[220px]">
                                  {s.canonicalStoreName}
                                </span>
                                {s.rawStoreName !== s.canonicalStoreName && (
                                  <span className="text-[9px] text-[#5B6B82] block truncate max-w-[220px]">
                                    Original: {s.rawStoreName}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-right font-bold text-[#12365A]">
                                {s.totalLinhas}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#0891B2]">
                                {s.fatura_paga}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#16A34A]">
                                {s.envio_fatura}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#9333EA]">
                                {s.promessa_pagto}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#64748B]">
                                {s.sem_contato}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#DC2626]">
                                {s.pendente}
                              </td>
                              <td className="p-2 text-right font-semibold text-[#EA580C]">
                                {s.nao_tratados}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar when Executing */}
          {isExecutingBatch && (
            <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E3E9F2] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#12365A] flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E9F8A]" />
                  {batchProgressMsg || 'Processando lote multi-loja...'}
                </span>
                <span className="font-mono font-bold text-[#0E9F8A]">{batchProgressPct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0E9F8A] transition-all duration-300 rounded-full"
                  style={{ width: `${batchProgressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Success summary after execution */}
          {batchImportDone && batchExecutionResult && (
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-xs space-y-2 text-[#12365A]">
              <div className="flex items-center gap-2 text-green-700 font-bold">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span>Importação em Lote Concluída com Sucesso!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                <div className="p-2 bg-white rounded border border-green-200">
                  <span className="text-[#5B6B82] block">Lojas Processadas</span>
                  <span className="font-bold text-[#12365A] text-sm">
                    {batchExecutionResult.storesCount}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-green-200">
                  <span className="text-[#5B6B82] block">Consolidados FPD</span>
                  <span className="font-bold text-[#12365A] text-sm">
                    {batchExecutionResult.totalFpdUpdated}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-green-200">
                  <span className="text-[#5B6B82] block">Vendedores Atualizados</span>
                  <span className="font-bold text-[#12365A] text-sm">
                    {batchExecutionResult.totalVendorSaved}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-green-200">
                  <span className="text-[#5B6B82] block">
                    Linhas {batchType === 'movel' ? 'Móvel' : 'Residencial'}
                  </span>
                  <span className="font-bold text-[#0E9F8A] text-sm">
                    {batchExecutionResult.totalAnalyticalInserted}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              disabled={isExecutingBatch}
              onClick={() => setBatchModalOpen(false)}
              className="text-xs"
            >
              {batchImportDone ? 'Fechar' : 'Cancelar'}
            </Button>

            <div className="flex items-center gap-2">
              {batchImportDone ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBatchModalOpen(false)
                      navigate('/vendedores')
                    }}
                    className="text-xs font-semibold text-[#12365A]"
                  >
                    Ver Vendedores
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setBatchModalOpen(false)
                      navigate('/')
                    }}
                    className="bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs font-semibold gap-1.5"
                  >
                    <span>Ver Tabela Consolidada</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={!batchParsedData || isExecutingBatch || isParsingBatch}
                  onClick={handleExecuteBatch}
                  className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white text-xs font-bold px-4 gap-2 shadow-sm"
                >
                  {isExecutingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gravando Dados...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar e Gravar Lote</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Importar
