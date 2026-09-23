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
  Lock,
  MessageSquareText,
  Copy,
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
  deduplicateMovelBatchItems,
  deduplicateResidencialBatchItems,
  invalidateAnalyticalCache,
  clearAllAnalyticalRows,
} from '@/services/relacionamentoService'
import { getStoreVariants, buildStoreFilterClause, isSameStore } from '@/lib/storeMatchingUtils'
import { Trash2 } from 'lucide-react'
import { parseAnalyticalXlsxFile, ParsedAnalyticalFileData } from '@/lib/analyticalImportParser'
import { guessStoreName } from '@/lib/xlsxParser'
import { fetchStores, matchStore } from '@/services/fpdService'
import { useUserStoreAccess } from '@/hooks/useUserStoreAccess'
import { useAllowedReferenceDates } from '@/hooks/useAllowedReferenceDates'
import type { MovelRecord, ResidencialRecord, StoreRecord } from '@/types/fpd'
import { cn } from '@/lib/utils'
import { ClientesMovel } from '@/components/ClientesMovel'
import { ClientesResidencial } from '@/components/ClientesResidencial'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isSessionExpiredError } from '@/lib/pocketbase/client'
import { fetchMensagensPorFaixa } from '@/services/mensagensService'
import type { MensagemClienteRecord, FaixaAtrasoMensagem } from '@/types/fpd'

export const Relacionamento: React.FC = () => {
  const { toast } = useToast()
  const userAccess = useUserStoreAccess()
  const {
    allowedReferenceDates,
    initialReferenceDate,
    isRestrictedRole,
    isDateAllowed,
    loading: loadingRefs,
  } = useAllowedReferenceDates()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clientes tab: 'movel' | 'residencial'
  const [activeClientesTab, setActiveClientesTab] = useState<'movel' | 'residencial'>('movel')

  // Stores and counts
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [totalMovel, setTotalMovel] = useState(0)
  const [totalResidencial, setTotalResidencial] = useState(0)
  // Para Gerente com loja vinculada já conhecida de imediato, inicializar direto com o ID/nome se possível
  const [selectedLoja, setSelectedLoja] = useState<string>(() => {
    if (userAccess.isGerente) {
      if (userAccess.hasNoStoreAssigned) return ''
      if (userAccess.managerStoreId) return userAccess.managerStoreId
    }
    return 'TODAS'
  })
  const [rawAvailableLojas, setRawAvailableLojas] = useState<string[]>([])
  const [rawAvailableDates, setRawAvailableDates] = useState<string[]>([])
  const [selectedDataReferencia, setSelectedDataReferencia] = useState<string>('TODAS')

  // Clear dialog state
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Import Dialog State
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [, setSelectedFiles] = useState<File[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [parsedFilesData, setParsedFilesData] = useState<ParsedAnalyticalFileData[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatusMessage, setImportStatusMessage] = useState('')

  // Modal Mensagens por Faixa de Atraso
  const [modalFaixa, setModalFaixa] = useState<FaixaAtrasoMensagem | null>(null)
  const [modalMensagens, setModalMensagens] = useState<MensagemClienteRecord[]>([])
  const [loadingMensagens, setLoadingMensagens] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleOpenFaixaModal = useCallback(
    async (faixa: FaixaAtrasoMensagem) => {
      setModalFaixa(faixa)
      setLoadingMensagens(true)
      try {
        const items = await fetchMensagensPorFaixa(faixa)
        setModalMensagens(items)
      } catch (err) {
        if (!isSessionExpiredError(err)) {
          console.error('Erro ao buscar mensagens da faixa:', err)
          toast({
            title: 'Erro ao carregar mensagens',
            description: 'Não foi possível carregar as mensagens desta faixa de atraso.',
            variant: 'destructive',
          })
        }
        setModalMensagens([])
      } finally {
        setLoadingMensagens(false)
      }
    },
    [toast],
  )

  const handleCopyMensagem = useCallback(
    async (msg: MensagemClienteRecord) => {
      const text = msg.texto || ''
      let copied = false

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text)
          copied = true
        } catch {
          copied = false
        }
      }

      if (!copied) {
        try {
          const textArea = document.createElement('textarea')
          textArea.value = text
          textArea.style.position = 'fixed'
          textArea.style.left = '-999999px'
          textArea.style.top = '-999999px'
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          copied = document.execCommand('copy')
          document.body.removeChild(textArea)
        } catch {
          copied = false
        }
      }

      if (copied) {
        setCopiedId(msg.id)
        setTimeout(() => setCopiedId(null), 2000)
        toast({
          title: 'Mensagem copiada!',
          description: 'O texto foi copiado para a área de transferência.',
        })
      } else {
        toast({
          title: 'Não foi possível copiar',
          description: 'Selecione e copie o texto manualmente.',
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  // Flag to temporarily disable realtime updates during bulk operations
  const isImportingRef = useRef(false)
  isImportingRef.current = isImporting

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

      // Se for Gerente, já resolver e travar o selectedLoja imediatamente na loja vinculada
      if (userAccess.isGerente && !userAccess.hasNoStoreAssigned) {
        if (userAccess.managerStoreId) {
          const matchedStore = registeredStores.find((s) => s.id === userAccess.managerStoreId)
          if (matchedStore?.name?.trim()) {
            setSelectedLoja(matchedStore.name.trim())
          }
        }
      }

      const datesSet = new Set<string>()
      distinctMovelDates.forEach((r) => {
        if (r.data_referencia && r.data_referencia.trim()) datesSet.add(r.data_referencia.trim())
      })
      distinctResDates.forEach((r) => {
        if (r.data_referencia && r.data_referencia.trim()) datesSet.add(r.data_referencia.trim())
      })
      // Também incluir as datas de allowedReferenceDates
      allowedReferenceDates.forEach((d) => {
        if (d && d.trim()) datesSet.add(d.trim())
      })
      const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a))
      setRawAvailableDates(sortedDates)
    } catch (err) {
      if (isSessionExpiredError(err)) {
        return
      }
      console.error('Erro ao carregar dados iniciais de inadimplência:', err)
    }
  }, [userAccess.isGerente, userAccess.hasNoStoreAssigned, userAccess.managerStoreId])

  // Initial load once on mount
  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Filtrar availableDates pelas permissões do perfil do usuário logado e garantir que contenha allowedReferenceDates
  const availableDates = useMemo(() => {
    const set = new Set<string>()
    rawAvailableDates.filter((d) => isDateAllowed(d)).forEach((d) => set.add(d.trim()))
    allowedReferenceDates.forEach((d) => {
      if (isDateAllowed(d)) set.add(d.trim())
    })
    // Se allowedReferenceDates tiver datas ordenadas, manter a união ordenada desc
    return Array.from(set).sort((a, b) => {
      const partsA = a.split('/')
      const partsB = b.split('/')
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(
          Number(partsA[2]),
          Number(partsA[1]) - 1,
          Number(partsA[0]),
        ).getTime()
        const dateB = new Date(
          Number(partsB[2]),
          Number(partsB[1]) - 1,
          Number(partsB[0]),
        ).getTime()
        if (!isNaN(dateA) && !isNaN(dateB)) {
          return dateB - dateA
        }
      }
      return b.localeCompare(a)
    })
  }, [rawAvailableDates, isDateAllowed, allowedReferenceDates])

  // Build PB filter string for counting a collection based on store, profile and reference date
  const buildCountFilter = useCallback(
    (loja: string, allowedLojas: string[]) => {
      if (userAccess.hasNoStoreAssigned) {
        return '__NO_ACCESS__'
      }

      const filterParts: string[] = []

      // Se for Gerente e loja for TODAS ou não definida, nunca contar todas as lojas da rede
      if (userAccess.isGerente && (!loja || loja === 'TODAS')) {
        return '__NO_ACCESS__'
      }

      if (loja && loja !== 'TODAS') {
        if (!userAccess.isAdm && !userAccess.isStoreNameAllowed(loja, stores)) {
          return '__NO_ACCESS__'
        }

        const storeClause = buildStoreFilterClause(loja)
        if (storeClause) {
          filterParts.push(storeClause)
        }
      } else if (!userAccess.isAdm) {
        // Se usuário não é ADM e TODAS está selecionado, somar todas as lojas do escopo do perfil
        const expandedStoreNames = new Set<string>()

        // 1. Variantes das lojas detectadas no banco pertencentes ao perfil
        for (const l of allowedLojas) {
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
          return '__NO_ACCESS__'
        }
      }
      // Se userAccess.isAdm e loja === 'TODAS', não adiciona cláusula de loja => soma todas as lojas da base

      if (selectedDataReferencia && selectedDataReferencia !== 'TODAS') {
        const trimmedRef = selectedDataReferencia.trim()
        const escapedRef = trimmedRef.replace(/"/g, '\\"')
        filterParts.push(
          `(data_referencia = "${escapedRef}" || data_referencia = "" || data_referencia = null)`,
        )
      } else if (selectedDataReferencia === 'TODAS') {
        // Quando TODAS, se não for ADM restringir às referências permitidas do usuário
        if (!userAccess.isAdm) {
          if (availableDates.length === 0) {
            return '__NO_ACCESS__'
          }
          const refClauses = availableDates.map(
            (d) => `data_referencia = "${d.trim().replace(/"/g, '\\"')}"`,
          )
          filterParts.push(`(${refClauses.join(' || ')})`)
        }
      }

      return filterParts.length > 0 ? filterParts.join(' && ') : undefined
    },
    [userAccess, stores, selectedDataReferencia, availableDates],
  )

  const hasMultipleReferences = availableDates.length >= 2
  const initialRefSetRef = useRef(false)

  // Fallback e sincronização de data de referência:
  // - Perfis restritos (Gerente, Supervisão, Coordenação):
  //     * Ao abrir, pré-seleciona a referência habilitada mais recente (initialReferenceDate).
  //     * Se 1 habilitada: seleciona automaticamente e NÃO exibe opção 'TODAS'.
  //     * Se 0 habilitadas: define 'NONE'.
  //     * Se múltiplas: pré-seleciona a mais recente habilitada.
  // - ADM:
  //     * Default 'TODAS' (ou a única disponível).
  useEffect(() => {
    if (loadingRefs) return

    if (!initialRefSetRef.current) {
      initialRefSetRef.current = true
      if (initialReferenceDate === 'none' || availableDates.length === 0) {
        setSelectedDataReferencia('NONE')
      } else if (isRestrictedRole) {
        setSelectedDataReferencia(initialReferenceDate)
      } else {
        setSelectedDataReferencia(initialReferenceDate === 'all' ? 'TODAS' : initialReferenceDate)
      }
      return
    }

    if (availableDates.length === 0) {
      if (selectedDataReferencia !== 'NONE') {
        setSelectedDataReferencia('NONE')
      }
    } else if (availableDates.length === 1) {
      const singleDate = availableDates[0]
      if (selectedDataReferencia !== singleDate) {
        setSelectedDataReferencia(singleDate)
      }
    } else if (availableDates.length >= 2) {
      if (selectedDataReferencia !== 'TODAS' && selectedDataReferencia !== 'NONE') {
        if (!isDateAllowed(selectedDataReferencia)) {
          setSelectedDataReferencia(isRestrictedRole ? availableDates[0] : 'TODAS')
        }
      }
    }
  }, [
    loadingRefs,
    selectedDataReferencia,
    availableDates,
    initialReferenceDate,
    isRestrictedRole,
    isDateAllowed,
  ])

  // Filtered available lojas based on user profile and linked stores
  const availableLojas = useMemo(() => {
    // Collect all candidate store names
    let candidateNames: string[] = []
    if (userAccess.isAdm) {
      candidateNames = Array.from(
        new Set([...rawAvailableLojas, ...stores.map((s) => s.name)]),
      ).filter(Boolean)
    } else {
      if (userAccess.hasNoStoreAssigned) return []

      // 1. Find which analytical loja strings belong to the user's allowed stores
      const allowedFromAnalytical = rawAvailableLojas.filter((l) =>
        userAccess.isStoreNameAllowed(l, stores),
      )

      // 2. Also retrieve registered store names for assigned stores
      const userRegisteredStoreNames = userAccess.getAllowedStoreNames(stores)

      candidateNames = Array.from(
        new Set([...allowedFromAnalytical, ...userRegisteredStoreNames]),
      ).filter(Boolean)
    }

    // Unify duplicates that represent the same store (e.g. prioritize registered store name over alias)
    const unified: string[] = []
    for (const cand of candidateNames) {
      // Garantir novamente que não-ADM nunca receba lojas não autorizadas (ex.: CALL / ILHA)
      if (!userAccess.isAdm && !userAccess.isStoreNameAllowed(cand, stores)) {
        continue
      }
      const alreadyHas = unified.some((u) => isSameStore(u, cand))
      if (!alreadyHas) {
        unified.push(cand)
      }
    }

    return unified.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rawAvailableLojas, stores, userAccess])

  // Identifica o nome canônico da loja vinculada ao Gerente
  const managerAssignedStoreName = useMemo(() => {
    if (!userAccess.isGerente || userAccess.hasNoStoreAssigned) return null

    // 1. Procurar nas lojas cadastradas (stores) pelo ID vinculado
    if (userAccess.managerStoreId && stores.length > 0) {
      const matchedStore = stores.find((s) => s.id === userAccess.managerStoreId)
      if (matchedStore?.name?.trim()) {
        return matchedStore.name.trim()
      }
    }

    // 2. Procurar em availableLojas
    if (availableLojas.length > 0) {
      return availableLojas[0]
    }

    // 3. Fallback: se o allowedStoreId for o próprio nome da loja
    if (userAccess.allowedStoreIds.length > 0) {
      return userAccess.allowedStoreIds[0]
    }

    return null
  }, [userAccess, stores, availableLojas])

  // Efeito para sincronizar a loja selecionada com a loja do perfil
  useEffect(() => {
    if (userAccess.isAdm) return

    if (userAccess.hasNoStoreAssigned) {
      if (selectedLoja !== '') {
        setSelectedLoja('')
      }
      return
    }

    if (userAccess.isGerente) {
      if (managerAssignedStoreName && selectedLoja !== managerAssignedStoreName) {
        setSelectedLoja(managerAssignedStoreName)
      }
      return
    }

    // Supervisor ou Coordenador: garantir que selectedLoja seja válida entre as permitidas ou 'TODAS'
    if (selectedLoja === '' && availableLojas.length > 0) {
      setSelectedLoja('TODAS')
    } else if (
      selectedLoja !== 'TODAS' &&
      selectedLoja !== '' &&
      !availableLojas.includes(selectedLoja)
    ) {
      setSelectedLoja(availableLojas.length > 0 ? 'TODAS' : '')
    }
  }, [
    userAccess.isAdm,
    userAccess.isGerente,
    userAccess.hasNoStoreAssigned,
    managerAssignedStoreName,
    selectedLoja,
    availableLojas,
  ])

  // Recalculate Móvel count whenever selectedLoja, availableLojas or selectedDataReferencia change
  const refreshMovelCount = useCallback(
    async (lojaOverride?: string) => {
      if (userAccess.hasNoStoreAssigned) {
        setTotalMovel(0)
        return
      }

      // Determina a loja efetiva a ser consultada:
      // Para Gerente, prioriza loja resolvida se o estado estiver TODAS/inválido
      const baseLoja = lojaOverride !== undefined ? lojaOverride : selectedLoja
      let effectiveLoja = baseLoja

      if (userAccess.isGerente) {
        if (managerAssignedStoreName) {
          effectiveLoja = managerAssignedStoreName
        } else if (
          effectiveLoja === 'TODAS' ||
          !userAccess.isStoreNameAllowed(effectiveLoja, stores)
        ) {
          // Se ainda não temos o nome da loja em stores, verificar se o ID bate com alguma loja ou esperar resolução
          const directMatch = stores.find((s) => userAccess.isStoreIdAllowed(s.id))
          if (directMatch?.name) {
            effectiveLoja = directMatch.name
          } else {
            return
          }
        }
      }

      // Construir lista de lojas permitidas: se availableLojas ainda não foi populada mas temos managerAssignedStoreName, usá-lo
      const effectiveAllowed =
        availableLojas.length > 0
          ? availableLojas
          : managerAssignedStoreName
            ? [managerAssignedStoreName]
            : []

      const filter = buildCountFilter(effectiveLoja, effectiveAllowed)
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
        if (isSessionExpiredError(err)) {
          return
        }
        console.error('Erro ao contar clientes móvel:', err)
        setTotalMovel(0)
      }
    },
    [buildCountFilter, selectedLoja, availableLojas, userAccess, stores, managerAssignedStoreName],
  )

  // Recalculate Residencial count whenever selectedLoja, availableLojas or selectedDataReferencia change
  const refreshResidencialCount = useCallback(
    async (lojaOverride?: string) => {
      if (userAccess.hasNoStoreAssigned) {
        setTotalResidencial(0)
        return
      }

      // Determina a loja efetiva a ser consultada:
      const baseLoja = lojaOverride !== undefined ? lojaOverride : selectedLoja
      let effectiveLoja = baseLoja

      if (userAccess.isGerente) {
        if (managerAssignedStoreName) {
          effectiveLoja = managerAssignedStoreName
        } else if (
          effectiveLoja === 'TODAS' ||
          !userAccess.isStoreNameAllowed(effectiveLoja, stores)
        ) {
          const directMatch = stores.find((s) => userAccess.isStoreIdAllowed(s.id))
          if (directMatch?.name) {
            effectiveLoja = directMatch.name
          } else {
            return
          }
        }
      }

      const effectiveAllowed =
        availableLojas.length > 0
          ? availableLojas
          : managerAssignedStoreName
            ? [managerAssignedStoreName]
            : []

      const filter = buildCountFilter(effectiveLoja, effectiveAllowed)
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
        if (isSessionExpiredError(err)) {
          return
        }
        console.error('Erro ao contar clientes residencial:', err)
        setTotalResidencial(0)
      }
    },
    [buildCountFilter, selectedLoja, availableLojas, userAccess, stores, managerAssignedStoreName],
  )

  useEffect(() => {
    refreshMovelCount()
  }, [refreshMovelCount])

  useEffect(() => {
    refreshResidencialCount()
  }, [refreshResidencialCount])

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
    } else if (e.action === 'delete' || e.action === 'update') {
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
    } else if (e.action === 'delete' || e.action === 'update') {
      refreshResidencialCount()
    }
  })

  // Handle files selection for import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userAccess.isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'A importação de planilhas é permitida apenas para o perfil ADM.',
        variant: 'destructive',
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

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
    if (!userAccess.isAdm) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas usuários com perfil ADM podem importar planilhas.',
        variant: 'destructive',
      })
      return
    }

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
              // Try direct store matching
              const matchedStore = matchStore(normalizedLoja, stores)
              if (matchedStore) {
                normalizedLoja = matchedStore.name
              } else {
                const same = stores.find((s) => isSameStore(s.name, normalizedLoja))
                if (same) {
                  normalizedLoja = same.name
                } else {
                  console.warn(
                    `[Importação - Móvel] Loja "${r.loja}" não encontrada no cadastro. Mantendo valor bruto.`,
                  )
                }
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
              ocorrencias: r.ocorrencias,
            }
          })

          const dedupedMovel = deduplicateMovelBatchItems(movelBatchData)
          await insertMovelBatch(dedupedMovel, (insertedInBatch) => {
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
          // Tentar inferir a loja do arquivo para fallback quando a linha estiver sem loja
          const guessedStoreFromFile = guessStoreName(pf.fileName)
          let defaultFileStoreName = ''
          if (guessedStoreFromFile) {
            const matchedGuessed = matchStore(guessedStoreFromFile, stores)
            defaultFileStoreName = matchedGuessed
              ? matchedGuessed.name
              : guessedStoreFromFile.toUpperCase()
          }

          const resBatchData = pf.residencialSheet.rows.map((r) => {
            let normalizedLoja = r.loja?.trim() || ''
            if (normalizedLoja) {
              const matchedStore = matchStore(normalizedLoja, stores)
              if (matchedStore) {
                normalizedLoja = matchedStore.name
              } else {
                const same = stores.find((s) => isSameStore(s.name, normalizedLoja))
                if (same) {
                  normalizedLoja = same.name
                } else {
                  console.warn(
                    `[Importação - Residencial] Loja "${r.loja}" não encontrada no cadastro. Mantendo valor bruto.`,
                  )
                }
              }
            } else {
              // Resolver OBRIGATORIAMENTE se vier vazia: derivar do nome do arquivo ou padrão
              normalizedLoja = defaultFileStoreName || 'LOJA NÃO IDENTIFICADA'
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
              ocorrencias: r.ocorrencias,
            }
          })

          const dedupedRes = deduplicateResidencialBatchItems(resBatchData)
          await insertResidencialBatch(dedupedRes, (insertedInBatch) => {
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
          {availableDates.length > 0 && selectedDataReferencia !== 'NONE' ? (
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E3E9F2] rounded-lg px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-[#0E9F8A]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B6B82]">
                Ref:
              </span>
              <Select value={selectedDataReferencia} onValueChange={setSelectedDataReferencia}>
                <SelectTrigger
                  aria-label="Selecione a data de referência"
                  className="h-7 text-xs border-0 bg-transparent shadow-none px-1 font-semibold text-[#12365A] focus:ring-0"
                >
                  <SelectValue
                    placeholder={
                      hasMultipleReferences ? 'Todas as datas' : availableDates[0] || 'Selecione'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {hasMultipleReferences && (
                    <SelectItem value="TODAS" className="text-xs font-semibold">
                      Todas as datas
                    </SelectItem>
                  )}
                  {availableDates.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs font-mono">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-100 border border-[#E3E9F2] rounded-lg px-2.5 py-1 text-xs text-[#5B6B82]">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B6B82]">
                Ref:
              </span>
              <span className="font-semibold text-slate-500">Nenhuma referência habilitada</span>
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

          {userAccess.isAdm ? (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3.5 text-xs font-semibold bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-xs gap-1.5 transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Importar Planilha</span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    disabled
                    className="h-9 px-3.5 text-xs font-semibold bg-slate-200 text-slate-500 cursor-not-allowed opacity-60 shadow-none gap-1.5"
                    title="Importação exclusiva do perfil ADM"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <UploadCloud className="w-4 h-4" />
                    <span>Importar Planilha</span>
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-[#0E2A47] text-white border border-[#1e456f] text-xs font-medium max-w-[240px]"
              >
                <p className="font-semibold text-amber-300">Acesso Restrito</p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  A importação de planilhas é exclusiva do perfil Administrador (ADM).
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {userAccess.isAdm && (
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(true)}
              className="h-9 px-3 text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 shadow-xs gap-1.5 transition-all"
              title="Limpar dados de clientes em inadimplência"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>Limpar Dados</span>
            </Button>
          )}
        </div>
      </div>

      {/* Perfil restrito sem nenhuma data de referência habilitada no Controle de Apresentação */}
      {!userAccess.isAdm && (availableDates.length === 0 || selectedDataReferencia === 'NONE') && (
        <div
          data-testid="no-reference-banner"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">
              Nenhuma referência habilitada para o seu perfil. Fale com a Coordenação.
            </p>
            <p className="text-amber-800">
              As datas de referência cadastradas estão desabilitadas para o seu perfil no Controle
              de Apresentação. Solicite à Coordenação a habilitação da data desejada para visualizar
              os clientes de inadimplência.
            </p>
          </div>
        </div>
      )}

      {/* Usuário sem loja vinculada (Gerente, Supervisor ou Coordenador) - aviso / estado vazio amigável */}
      {!userAccess.isAdm && userAccess.hasNoStoreAssigned && (
        <div
          data-testid="no-store-banner"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">
              Nenhuma loja vinculada ao seu perfil de {userAccess.userRole || 'acesso'}
            </p>
            <p className="text-amber-800">
              Seu perfil ainda não possui lojas vinculadas pelo Administrador. Para visualizar e
              gerenciar os clientes de inadimplência (Móvel e Residencial), solicite a vinculação à
              equipe administradora.
            </p>
          </div>
        </div>
      )}

      {/* Information Banner: Clarifying Occurrences (Stores Panel) vs Unique Clientes (Inadimplência) */}
      <div className="bg-[#F0F5FC] border border-[#D5E2F1] rounded-xl p-3 sm:p-3.5 flex items-start gap-3 text-xs text-[#12365A]">
        <Info className="w-4 h-4 text-[#12365A] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">
            {selectedDataReferencia && selectedDataReferencia !== 'TODAS'
              ? `Data de Referência Ativa: ${selectedDataReferencia}`
              : 'Visualização de Clientes em Tratamento'}
          </p>
          <p className="text-[#5B6B82]">
            Total de Clientes em tratamento analítico (linhas únicas). Célula vazia na coluna
            Ocorrências é ignorada nas quantidades. Para total de ocorrências/faturas por loja,
            consulte o <strong>Painel de Lojas</strong> (fonte da verdade).
          </p>
        </div>
      </div>
      {/* Metric Cards & Delay Range Messages Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E3E9F2] pb-3">
        {/* Toggle between Móvel and Residencial */}
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

        {/* 3 Botões por Faixa de Atraso: Amarelo, Laranja, Vermelho */}
        <div className="flex flex-wrap items-center gap-2">
          {/* AMARELO: < 15 dias */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenFaixaModal('< 15 dias')}
            className="h-9 px-3.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 hover:border-amber-400 shadow-2xs gap-1.5 transition-all"
            data-testid="btn-faixa-menos-30"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <MessageSquareText className="w-3.5 h-3.5 text-amber-700" />
            <span>&lt; 15 dias</span>
          </Button>

          {/* LARANJA: 16 a 30 dias */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenFaixaModal('16 a 30 dias')}
            className="h-9 px-3.5 text-xs font-bold bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-300 hover:border-orange-400 shadow-2xs gap-1.5 transition-all"
            data-testid="btn-faixa-31-60"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
            <MessageSquareText className="w-3.5 h-3.5 text-orange-700" />
            <span>16 a 30 dias</span>
          </Button>

          {/* VERMELHO: >30 dias */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenFaixaModal('>30 dias')}
            className="h-9 px-3.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300 hover:border-rose-400 shadow-2xs gap-1.5 transition-all"
            data-testid="btn-faixa-maior-90"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <MessageSquareText className="w-3.5 h-3.5 text-rose-700" />
            <span>&gt;30 dias</span>
          </Button>
        </div>
      </div>

      {/* Render Active Clientes Table */}
      {activeClientesTab === 'movel' ? (
        <ClientesMovel
          availableLojas={availableLojas}
          stores={stores}
          dataReferencia={selectedDataReferencia}
          selectedLoja={selectedLoja}
          onLojaChange={setSelectedLoja}
        />
      ) : (
        <ClientesResidencial
          availableLojas={availableLojas}
          stores={stores}
          dataReferencia={selectedDataReferencia}
          selectedLoja={selectedLoja}
          onLojaChange={setSelectedLoja}
        />
      )}

      {/* Clear Data Confirmation Dialog */}
      <Dialog
        open={clearDialogOpen}
        onOpenChange={(open) => !isClearing && setClearDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <Trash2 className="w-5 h-5" />
              <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A]">
                Limpar Dados de Inadimplência
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Escolha o escopo de limpeza dos dados da Gestão de Clientes em Inadimplência.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-[#12365A]">
              Deseja limpar os registros das lojas com solicitações pendentes ou de toda a base?
            </p>

            <div className="space-y-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={async () => {
                  try {
                    setIsClearing(true)
                    const res = await clearAllAnalyticalRows({
                      targetAba: 'TODAS',
                      lojas: [
                        'CELNET AGUAS CLARA',
                        'CELNET AGUAS CLARAS',
                        'CELNET ÁGUAS CLARAS',
                        'CELNET ÁGUAS CLARA',
                        'CELNET MATRIZ PLANALTINA DF',
                        'CELNET PLANALTINA DF',
                      ],
                    })
                    toast({
                      title: 'Limpeza concluída com sucesso',
                      description: `Águas Claras e Planaltina DF: ${res.movelCount} cliente(s) móvel e ${res.residencialCount} residencial removidos.`,
                    })
                    setClearDialogOpen(false)
                    invalidateAnalyticalCache()
                    loadInitialData()
                    refreshMovelCount()
                    refreshResidencialCount()
                  } catch (err: unknown) {
                    const e = err as Error
                    toast({
                      title: 'Erro ao limpar dados',
                      description: e?.message || 'Falha ao executar a limpeza.',
                      variant: 'destructive',
                    })
                  } finally {
                    setIsClearing(false)
                  }
                }}
                className="w-full text-left p-3 rounded-lg border border-[#E3E9F2] hover:border-rose-300 hover:bg-rose-50/50 transition-all flex flex-col gap-1"
              >
                <span className="font-bold text-[#12365A]">
                  Limpar apenas CELNET Águas Claras e Planaltina DF
                </span>
                <span className="text-[11px] text-[#5B6B82]">
                  Apaga registros das duas lojas nas coleções Móvel e Residencial (mantendo outras
                  lojas).
                </span>
              </button>

              <button
                type="button"
                disabled={isClearing}
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Tem certeza de que deseja apagar TODOS os dados de clientes de todas as lojas em Inadimplência?',
                    )
                  ) {
                    return
                  }
                  try {
                    setIsClearing(true)
                    const res = await clearAllAnalyticalRows('TODAS')
                    toast({
                      title: 'Base limpa com sucesso',
                      description: `${res.movelCount} registros móvel e ${res.residencialCount} residencial removidos.`,
                    })
                    setClearDialogOpen(false)
                    invalidateAnalyticalCache()
                    loadInitialData()
                    refreshMovelCount()
                    refreshResidencialCount()
                  } catch (err: unknown) {
                    const e = err as Error
                    toast({
                      title: 'Erro ao limpar dados',
                      description: e?.message || 'Falha ao executar a limpeza total.',
                      variant: 'destructive',
                    })
                  } finally {
                    setIsClearing(false)
                  }
                }}
                className="w-full text-left p-3 rounded-lg border border-[#E3E9F2] hover:border-rose-300 hover:bg-rose-50/50 transition-all flex flex-col gap-1"
              >
                <span className="font-bold text-rose-700">
                  Limpar TODAS as Lojas (Base Completa)
                </span>
                <span className="text-[11px] text-[#5B6B82]">
                  Remove todos os clientes cadastrados em Móvel e Residencial.
                </span>
              </button>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              disabled={isClearing}
              onClick={() => setClearDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              analíticas <strong>Móvel</strong> e <strong>Residencial</strong>. Linhas com célula
              vazia na coluna Ocorrências são ignoradas nas quantidades.
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

      {/* Modal: Mensagens da Faixa de Atraso */}
      <Dialog
        open={modalFaixa !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModalFaixa(null)
            setModalMensagens([])
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-white max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="shrink-0 pb-2 border-b border-[#E3E9F2]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-3 h-3 rounded-full shrink-0',
                  modalFaixa === '< 15 dias' && 'bg-amber-500',
                  modalFaixa === '16 a 30 dias' && 'bg-orange-500',
                  modalFaixa === '>30 dias' && 'bg-rose-500',
                )}
              />
              <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A] flex items-center gap-2">
                <span>Mensagens para Clientes</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5 border',
                    modalFaixa === '< 15 dias' && 'bg-amber-50 text-amber-800 border-amber-300',
                    modalFaixa === '16 a 30 dias' &&
                      'bg-orange-50 text-orange-800 border-orange-300',
                    modalFaixa === '>30 dias' && 'bg-rose-50 text-rose-800 border-rose-300',
                  )}
                >
                  {modalFaixa}
                </Badge>
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Consulte e copie os modelos de mensagens cadastrados para abordagem nesta faixa de
              atraso.
            </DialogDescription>
          </DialogHeader>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[140px]">
            {loadingMensagens ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                <RefreshCw className="w-7 h-7 text-[#0E9F8A] animate-spin" />
                <span className="text-xs text-[#5B6B82]">Carregando mensagens da faixa...</span>
              </div>
            ) : modalMensagens.length === 0 ? (
              <div
                data-testid="mensagens-empty-state"
                className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-2 bg-[#F8FAFC] border border-dashed border-[#D5E2F1] rounded-xl"
              >
                <MessageSquareText className="w-10 h-10 text-[#8A97AC]" />
                <p className="font-semibold text-sm text-[#12365A]">
                  Nenhuma mensagem cadastrada para esta faixa de atraso
                </p>
                <p className="text-xs text-[#5B6B82] max-w-md">
                  Para cadastrar novos modelos de mensagem para a faixa "{modalFaixa}", acesse a aba{' '}
                  <strong>Mensagens</strong> no módulo <strong>Administração</strong>.
                </p>
              </div>
            ) : (
              modalMensagens.map((msg, index) => {
                const tituloDisplay =
                  typeof msg.titulo === 'string' && msg.titulo.trim()
                    ? msg.titulo
                    : `Modelo ${msg.ordem ? `#${msg.ordem}` : index + 1}`
                const descricaoDisplay =
                  typeof msg.descricao === 'string' && msg.descricao.trim() ? msg.descricao : null

                return (
                  <div
                    key={msg.id}
                    data-testid={`mensagem-card-${msg.id}`}
                    className="p-4 rounded-xl border border-[#E3E9F2] bg-[#F8FAFC] hover:bg-white hover:border-[#CBD5E1] transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#12365A]">{tituloDisplay}</span>
                          {descricaoDisplay && (
                            <span className="text-[11px] text-[#5B6B82]">({descricaoDisplay})</span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleCopyMensagem(msg)}
                        className={cn(
                          'h-8 px-3 text-xs font-semibold gap-1.5 shrink-0 transition-all shadow-2xs',
                          copiedId === msg.id
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-[#12365A] hover:bg-[#0d2742] text-white',
                        )}
                        data-testid={`btn-copy-${msg.id}`}
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar texto</span>
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="p-3 bg-white border border-[#E3E9F2] rounded-lg text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed select-text">
                      {msg.texto}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-[#E3E9F2]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalFaixa(null)
                setModalMensagens([])
              }}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Relacionamento
