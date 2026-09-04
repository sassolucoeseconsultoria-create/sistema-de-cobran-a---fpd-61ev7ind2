import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  UploadCloud,
  Smartphone,
  Home,
  Check,
  Users,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  Info,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import useRealtime from '@/hooks/use-realtime'
import {
  fetchDistinctAnalyticalLojas,
  insertMovelBatch,
  insertResidencialBatch,
  invalidateAnalyticalCache,
} from '@/services/relacionamentoService'
import { parseAnalyticalXlsxFile, ParsedAnalyticalFileData } from '@/lib/analyticalImportParser'
import { fetchStores, matchStore } from '@/services/fpdService'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
import type { MovelRecord, ResidencialRecord, StoreRecord } from '@/types/fpd'
import { cn } from '@/lib/utils'
import { ClientesMovel } from '@/components/ClientesMovel'
import { ClientesResidencial } from '@/components/ClientesResidencial'

export const Relacionamento: React.FC = () => {
  const { toast } = useToast()
  const userAccess = useUserStoreAccess()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clientes tab: 'movel' | 'residencial'
  const [activeClientesTab, setActiveClientesTab] = useState<'movel' | 'residencial'>('movel')

  // Stores and counts
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [totalMovel, setTotalMovel] = useState(0)
  const [totalResidencial, setTotalResidencial] = useState(0)
  const [selectedLojaMovel, setSelectedLojaMovel] = useState<string>('TODAS')
  const [selectedLojaResidencial, setSelectedLojaResidencial] = useState<string>('TODAS')
  const [rawAvailableLojas, setRawAvailableLojas] = useState<string[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDataReferencia, setSelectedDataReferencia] = useState<string>('TODAS')

  // Import Dialog State
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [, setSelectedFiles] = useState<File[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [parsedFilesData, setParsedFilesData] = useState<ParsedAnalyticalFileData[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatusMessage, setImportStatusMessage] = useState('')

  // Flag to temporarily disable realtime updates during bulk operations
  const isImportingRef = useRef(false)
  isImportingRef.current = isImporting

  // Build PB filter string for counting a collection based on store, profile and reference date
  const buildCountFilter = useCallback(
    (loja: string, allowedLojas: string[]) => {
      if (userAccess.hasNoStoreAssigned) {
        return '__NO_ACCESS__'
      }

      const filterParts: string[] = []

      if (loja && loja !== 'TODAS') {
        if (!userAccess.isAdm && !userAccess.isStoreNameAllowed(loja, stores)) {
          return '__NO_ACCESS__'
        }

        const lojaVariants = new Set<string>()
        lojaVariants.add(loja)
        if (loja.endsWith('S') || loja.endsWith('s')) {
          lojaVariants.add(loja.slice(0, -1))
        } else {
          lojaVariants.add(`${loja}S`)
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
        filterParts.push(clauses.length === 1 ? clauses[0] : `(${clauses.join(' || ')})`)
      } else if (!userAccess.isAdm) {
        if (allowedLojas.length > 0) {
          const expandedStoreNames = new Set<string>()
          for (const l of allowedLojas) {
            if (!l || !l.trim()) continue
            expandedStoreNames.add(l.trim())
            const unacc = l
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .trim()
            if (unacc) expandedStoreNames.add(unacc)
          }

          const storeFilters = Array.from(expandedStoreNames).map(
            (l) => `loja = "${l.replace(/"/g, '\\"')}"`,
          )
          if (storeFilters.length > 0) {
            filterParts.push(`(${storeFilters.join(' || ')})`)
          }
        } else {
          return '__NO_ACCESS__'
        }
      }

      if (selectedDataReferencia && selectedDataReferencia !== 'TODAS') {
        const escapedRef = selectedDataReferencia.replace(/"/g, '\\"')
        filterParts.push(
          `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
        )
      }

      return filterParts.length > 0 ? filterParts.join(' && ') : undefined
    },
    [userAccess, stores, selectedDataReferencia],
  )

  // Load distinct store names, registered stores, and reference dates
  const loadInitialData = useCallback(async () => {
    try {
      const [lojas, registeredStores, distinctMovelDates, distinctResDates] = await Promise.all([
        fetchDistinctAnalyticalLojas(),
        fetchStores().catch(() => []),
        pb
          .collection('movel')
          .getFullList<{ data_referencia?: string }>({
            fields: 'data_referencia',
            filter: 'data_referencia != "" && data_referencia != null',
            requestKey: null,
          })
          .catch(() => []),
        pb
          .collection('residencial')
          .getFullList<{ data_referencia?: string }>({
            fields: 'data_referencia',
            filter: 'data_referencia != "" && data_referencia != null',
            requestKey: null,
          })
          .catch(() => []),
      ])

      const set = new Set<string>(Array.isArray(lojas) ? lojas : [])
      setRawAvailableLojas(Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR')))
      setStores(registeredStores)

      const datesSet = new Set<string>()
      distinctMovelDates.forEach((r) => {
        if (r.data_referencia && r.data_referencia.trim()) datesSet.add(r.data_referencia.trim())
      })
      distinctResDates.forEach((r) => {
        if (r.data_referencia && r.data_referencia.trim()) datesSet.add(r.data_referencia.trim())
      })
      const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a))
      setAvailableDates(sortedDates)
    } catch (err) {
      console.error('Erro ao carregar dados iniciais de inadimplência:', err)
    }
  }, [])

  // Initial load once on mount
  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Filtered available lojas based on user profile and linked stores
  const availableLojas = useMemo(() => {
    if (userAccess.isAdm) {
      const allNames = Array.from(
        new Set([...rawAvailableLojas, ...stores.map((s) => s.name)]),
      ).filter(Boolean)
      return allNames.sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    if (userAccess.hasNoStoreAssigned) return []

    // 1. Find which analytical loja strings belong to the user's allowed stores
    const allowedFromAnalytical = rawAvailableLojas.filter((l) =>
      userAccess.isStoreNameAllowed(l, stores),
    )

    // 2. Also retrieve registered store names for assigned stores
    const userRegisteredStoreNames = userAccess.getAllowedStoreNames(stores)

    const combined = Array.from(
      new Set([...allowedFromAnalytical, ...userRegisteredStoreNames]),
    ).filter(Boolean)
    return combined.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rawAvailableLojas, stores, userAccess])

  // Recalculate Móvel count whenever selectedLojaMovel, availableLojas or selectedDataReferencia change
  const refreshMovelCount = useCallback(async () => {
    const filter = buildCountFilter(selectedLojaMovel, availableLojas)
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
      console.error('Erro ao contar clientes móvel:', err)
      setTotalMovel(0)
    }
  }, [buildCountFilter, selectedLojaMovel, availableLojas])

  // Recalculate Residencial count whenever selectedLojaResidencial, availableLojas or selectedDataReferencia change
  const refreshResidencialCount = useCallback(async () => {
    const filter = buildCountFilter(selectedLojaResidencial, availableLojas)
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
      console.error('Erro ao contar clientes residencial:', err)
      setTotalResidencial(0)
    }
  }, [buildCountFilter, selectedLojaResidencial, availableLojas])

  useEffect(() => {
    refreshMovelCount()
  }, [refreshMovelCount])

  useEffect(() => {
    refreshResidencialCount()
  }, [refreshResidencialCount])

  // Real-time subscription to 'movel' and 'residencial'
  useRealtime<MovelRecord>('movel', (e) => {
    if (isImportingRef.current) return

    if (e.action === 'create') {
      if (e.record.loja && !rawAvailableLojas.includes(e.record.loja)) {
        setRawAvailableLojas((prev) =>
          [...prev, e.record.loja].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        )
      }
      refreshMovelCount()
    } else if (e.action === 'delete') {
      refreshMovelCount()
    }
  })

  useRealtime<ResidencialRecord>('residencial', (e) => {
    if (isImportingRef.current) return

    if (e.action === 'create') {
      if (e.record.loja && !rawAvailableLojas.includes(e.record.loja)) {
        setRawAvailableLojas((prev) =>
          [...prev, e.record.loja].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        )
      }
      refreshResidencialCount()
    } else if (e.action === 'delete') {
      refreshResidencialCount()
    }
  })

  // Handle files selection for import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        validFiles.push(file)
      }
    }

    if (validFiles.length === 0) {
      toast({
        title: 'Formato não suportado',
        description: 'Por favor, selecione arquivos de planilha no formato Excel (.xlsx ou .xls).',
        variant: 'destructive',
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setSelectedFiles(validFiles)
    setImportDialogOpen(true)
    setIsProcessingFiles(true)
    setParsedFilesData([])

    try {
      const parsedResults: ParsedAnalyticalFileData[] = []
      for (const file of validFiles) {
        const parsed = await parseAnalyticalXlsxFile(file)
        parsedResults.push(parsed)
      }
      setParsedFilesData(parsedResults)
    } catch (err: unknown) {
      const error = err as Error
      toast({
        title: 'Erro na leitura do arquivo',
        description: error?.message || 'Falha ao processar as abas do arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessingFiles(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Execute import to Móvel and Residencial collections
  const handleConfirmImport = async () => {
    if (parsedFilesData.length === 0) return

    setIsImporting(true)
    setImportProgress(0)

    let totalMovelToInsert = 0
    let totalResidencialToInsert = 0
    parsedFilesData.forEach((pf) => {
      totalMovelToInsert += pf.totalMovelRows
      totalResidencialToInsert += pf.totalResidencialRows
    })

    const totalLinesAll = totalMovelToInsert + totalResidencialToInsert
    if (totalLinesAll === 0) {
      toast({
        title: 'Nenhum dado encontrado',
        description:
          'Não foram encontradas linhas de dados nas abas Móvel e Residencial dos arquivos selecionados.',
        variant: 'destructive',
      })
      setIsImporting(false)
      return
    }

    let insertedGlobalCount = 0

    try {
      for (let i = 0; i < parsedFilesData.length; i++) {
        const pf = parsedFilesData[i]
        setImportStatusMessage(
          `Importando arquivo ${i + 1} de ${parsedFilesData.length}: ${pf.fileName}...`,
        )

        const fileRefDate = pf.guessedReferente || ''

        // 1. Insert Móvel rows
        if (pf.movelSheet && pf.movelSheet.rows.length > 0) {
          setImportStatusMessage(
            `Gravando ${pf.movelSheet.rows.length} linhas na tabela MÓVEL (${pf.fileName})...`,
          )
          const movelBatchData = pf.movelSheet.rows.map((r) => {
            let normalizedLoja = r.loja?.trim() || ''
            if (normalizedLoja) {
              const matchedStore = matchStore(normalizedLoja, stores)
              if (matchedStore) {
                normalizedLoja = matchedStore.name
              } else {
                console.warn(
                  `[Importação - Móvel] Loja "${r.loja}" não encontrada no cadastro. Mantendo valor bruto.`,
                )
              }
            }

            return {
              arquivo: pf.fileName,
              linha: r.linha,
              loja: normalizedLoja,
              vendedor: r.vendedor,
              cliente: r.cliente,
              dados: r.dados,
              data_referencia: fileRefDate,
              ocorrencias: r.ocorrencias || 'Não Tratados',
            }
          })

          await insertMovelBatch(movelBatchData, (insertedInBatch) => {
            const currentDone = insertedGlobalCount + insertedInBatch
            setImportProgress(Math.min(95, Math.round((currentDone / totalLinesAll) * 100)))
          })
          insertedGlobalCount += pf.movelSheet.rows.length
        }

        // 2. Insert Residencial rows
        if (pf.residencialSheet && pf.residencialSheet.rows.length > 0) {
          setImportStatusMessage(
            `Gravando ${pf.residencialSheet.rows.length} linhas na tabela RESIDENCIAL (${pf.fileName})...`,
          )
          const resBatchData = pf.residencialSheet.rows.map((r) => {
            let normalizedLoja = r.loja?.trim() || ''
            if (normalizedLoja) {
              const matchedStore = matchStore(normalizedLoja, stores)
              if (matchedStore) {
                normalizedLoja = matchedStore.name
              } else {
                console.warn(
                  `[Importação - Residencial] Loja "${r.loja}" não encontrada no cadastro. Mantendo valor bruto.`,
                )
              }
            }

            return {
              arquivo: pf.fileName,
              linha: r.linha,
              loja: normalizedLoja,
              vendedor: r.vendedor,
              cliente: r.cliente,
              dados: r.dados,
              data_referencia: fileRefDate,
              typedFields: r.typedFields,
              ocorrencias: r.ocorrencias || 'Não Tratados',
            }
          })

          await insertResidencialBatch(resBatchData, (insertedInBatch) => {
            const currentDone = insertedGlobalCount + insertedInBatch
            setImportProgress(Math.min(95, Math.round((currentDone / totalLinesAll) * 100)))
          })
          insertedGlobalCount += pf.residencialSheet.rows.length
        }
      }

      setImportProgress(100)
      setImportStatusMessage('Importação concluída com sucesso!')

      toast({
        title: 'Importação realizada com sucesso!',
        description: `${totalMovelToInsert} linhas gravadas em Móvel e ${totalResidencialToInsert} linhas gravadas em Residencial.`,
      })

      invalidateAnalyticalCache()
      setImportDialogOpen(false)
      setSelectedFiles([])
      setParsedFilesData([])
      setIsImporting(false)
      loadInitialData()
      refreshMovelCount()
      refreshResidencialCount()
    } catch (err: unknown) {
      const error = err as Error
      console.error('Erro na importação:', err)
      toast({
        title: 'Erro durante a importação',
        description: (
          <div className="max-h-60 overflow-y-auto whitespace-pre-line text-xs font-mono">
            {error?.message || 'Ocorreu uma falha ao salvar as linhas no banco de dados.'}
          </div>
        ),
        variant: 'destructive',
      })
      setIsImporting(false)
    }
  }

  // Summary counts of parsed files
  const importSummary = useMemo(() => {
    let movelCount = 0
    let residencialCount = 0
    parsedFilesData.forEach((p) => {
      movelCount += p.totalMovelRows
      residencialCount += p.totalResidencialRows
    })
    return {
      movelCount,
      residencialCount,
      total: movelCount + residencialCount,
    }
  }, [parsedFilesData])

  const totalClientes = totalMovel + totalResidencial

  return (
    <div className="space-y-6">
      {/* Hidden File Input for .xlsx import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".xlsx,.xls"
        multiple
        className="hidden"
      />

      {/* Top Banner / Actions Header */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#E3E9F2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-[#0E9F8A]/10 text-[#0E9F8A]">
            <Users className="w-6 h-6" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#12365A] tracking-tight">
              Gestão de Clientes em Inadimplência
            </h2>
            <p className="text-xs text-[#5B6B82]">
              Tratamento individualizado com ocorrências, promessas de pagamento e anotações.
            </p>
          </div>
        </div>

        {/* Counter Badge & Import Button */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Active Reference Date selector */}
          {availableDates.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E3E9F2] rounded-lg px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-[#0E9F8A]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B6B82]">
                Ref:
              </span>
              <Select value={selectedDataReferencia} onValueChange={setSelectedDataReferencia}>
                <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1 font-semibold text-[#12365A] focus:ring-0">
                  <SelectValue placeholder="Todas as datas" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="TODAS" className="text-xs font-semibold">
                    Todas as datas
                  </SelectItem>
                  {availableDates.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs font-mono">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] text-right shadow-2xs">
            <span className="text-[9px] uppercase font-bold tracking-wider text-[#5B6B82] block">
              Total de Clientes
            </span>
            <span className="text-sm font-bold text-[#12365A] tabular-nums">
              {totalClientes.toLocaleString('pt-BR')}
            </span>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            className="h-9 px-3.5 text-xs font-semibold bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-xs gap-1.5 transition-all"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Importar Planilha</span>
          </Button>
        </div>
      </div>

      {/* Information Banner: Clarifying Occurrences (Stores Panel) vs Unique Clients (Inadimplência) */}
      <div className="bg-[#F0F5FC] border border-[#D5E2F1] rounded-xl p-3 sm:p-3.5 flex items-start gap-3 text-xs text-[#12365A]">
        <Info className="w-4 h-4 text-[#12365A] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">
            {selectedDataReferencia && selectedDataReferencia !== 'TODAS'
              ? `Data de Referência Ativa: ${selectedDataReferencia}`
              : 'Visualização de Clientes em Tratamento'}
          </p>
          <p className="text-[#5B6B82]">
            Total de Clientes em tratamento analítico (linhas únicas). Para total de
            ocorrências/faturas por loja, consulte o <strong>Painel de Lojas</strong> (fonte da
            verdade).
          </p>
        </div>
      </div>

      {/* Toggle between Móvel and Residencial */}
      <div className="flex items-center justify-between border-b border-[#E3E9F2] pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-[#E8EEF5] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveClientesTab('movel')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all',
              activeClientesTab === 'movel'
                ? 'bg-white text-[#12365A] shadow-xs'
                : 'text-[#5B6B82] hover:text-[#12365A]',
            )}
          >
            <Smartphone className="w-4 h-4 text-[#12365A]" />
            <span>Clientes Móvel</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 bg-slate-50 border-slate-200"
            >
              {totalMovel.toLocaleString('pt-BR')}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveClientesTab('residencial')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all',
              activeClientesTab === 'residencial'
                ? 'bg-white text-[#0E9F8A] shadow-xs'
                : 'text-[#5B6B82] hover:text-[#0E9F8A]',
            )}
          >
            <Home className="w-4 h-4 text-[#0E9F8A]" />
            <span>Clientes Residencial</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 bg-slate-50 border-slate-200"
            >
              {totalResidencial.toLocaleString('pt-BR')}
            </Badge>
          </button>
        </div>
      </div>

      {/* Render Active Clientes Table */}
      {activeClientesTab === 'movel' ? (
        <ClientesMovel
          availableLojas={availableLojas}
          stores={stores}
          dataReferencia={selectedDataReferencia}
          selectedLoja={selectedLojaMovel}
          onLojaChange={setSelectedLojaMovel}
        />
      ) : (
        <ClientesResidencial
          availableLojas={availableLojas}
          stores={stores}
          dataReferencia={selectedDataReferencia}
          selectedLoja={selectedLojaResidencial}
          onLojaChange={setSelectedLojaResidencial}
        />
      )}

      {/* Import Modal Dialog */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!isImporting) {
            setImportDialogOpen(open)
            if (!open) {
              setSelectedFiles([])
              setParsedFilesData([])
              setImportProgress(0)
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#0E9F8A] mb-1">
              <UploadCloud className="w-5 h-5" />
              <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A]">
                Importação de Clientes em Inadimplência
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              As abas correspondentes serão identificadas automaticamente e inseridas nas tabelas
              analíticas <strong>Móvel</strong> e <strong>Residencial</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Body Content */}
          <div className="space-y-4 py-2">
            {isProcessingFiles ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-[#0E9F8A] animate-spin" />
                <p className="text-xs text-[#5B6B82]">
                  Lendo e estruturando linhas analíticas das planilhas...
                </p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B6B82] block">
                      Total de Linhas
                    </span>
                    <span className="text-lg font-bold text-[#12365A]">
                      {importSummary.total.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#12365A]/5 border border-[#12365A]/15">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#12365A] block">
                      Móvel
                    </span>
                    <span className="text-lg font-bold text-[#12365A]">
                      {importSummary.movelCount.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0E9F8A]/5 border border-[#0E9F8A]/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0E9F8A] block">
                      Residencial
                    </span>
                    <span className="text-lg font-bold text-[#0E9F8A]">
                      {importSummary.residencialCount.toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Selected Files List */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <span className="text-xs font-semibold text-[#12365A] block">
                    Arquivos selecionados ({parsedFilesData.length}):
                  </span>
                  {parsedFilesData.map((pf) => (
                    <div
                      key={pf.fileName}
                      className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E3E9F2] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate mr-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#0E9F8A] shrink-0" />
                        <span className="font-mono truncate">{pf.fileName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pf.movelSheet && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 bg-white text-[#12365A]"
                          >
                            Móvel: {pf.totalMovelRows}
                          </Badge>
                        )}
                        {pf.residencialSheet && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 bg-white text-[#0E9F8A]"
                          >
                            Res: {pf.totalResidencialRows}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress bar during import */}
                {isImporting && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5B6B82] flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0E9F8A]" />
                        {importStatusMessage || 'Importando dados...'}
                      </span>
                      <span className="font-bold text-[#12365A]">{importProgress}%</span>
                    </div>
                    <Progress value={importProgress} className="h-2" />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={isImporting || isProcessingFiles}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={
                isImporting ||
                isProcessingFiles ||
                parsedFilesData.length === 0 ||
                importSummary.total === 0
              }
              className="text-xs bg-[#0E9F8A] hover:bg-[#0c8a77] text-white gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {isImporting
                  ? 'Importando...'
                  : `Confirmar e Importar ${importSummary.total.toLocaleString('pt-BR')} Linhas`}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Relacionamento
