import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import type { MensagemClienteRecord, FaixaAtrasoMensagem } from '@/types/fpd'
import { FAIXAS_ATRASO_MENSAGEM } from '@/types/fpd'
import {
  fetchMensagens,
  createMensagem,
  updateMensagem,
  deleteMensagem,
} from '@/services/mensagensService'

export function AdminMensagensTab() {
  const { toast } = useToast()
  const [mensagens, setMensagens] = useState<MensagemClienteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [faixaFilter, setFaixaFilter] = useState<'ALL' | FaixaAtrasoMensagem>('ALL')

  // Modal de criação / edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMensagem, setEditingMensagem] = useState<MensagemClienteRecord | null>(null)
  const [formData, setFormData] = useState<{
    texto: string
    faixa_atraso: FaixaAtrasoMensagem
    ordem?: number
  }>({
    texto: '',
    faixa_atraso: 'Menos de 30 dias',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Modal de exclusão
  const [deletingMensagem, setDeletingMensagem] = useState<MensagemClienteRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Feedback de cópia inline
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const list = await fetchMensagens()
      setMensagens(list)
    } catch (err: unknown) {
      console.error('Erro ao carregar mensagens:', err)
      toast({
        title: 'Erro ao carregar mensagens',
        description: 'Não foi possível buscar as mensagens cadastradas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime updates
  useRealtime<MensagemClienteRecord>('mensagens', (e) => {
    if (e.action === 'create') {
      setMensagens((prev) => {
        if (prev.some((m) => m.id === e.record.id)) return prev
        const next = [...prev, e.record]
        next.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
        return next
      })
    } else if (e.action === 'update') {
      setMensagens((prev) => {
        const next = prev.map((m) => (m.id === e.record.id ? { ...m, ...e.record } : m))
        next.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
        return next
      })
    } else if (e.action === 'delete') {
      setMensagens((prev) => prev.filter((m) => m.id !== e.record.id))
    }
  })

  // Próximo número da ordem estimado para exibição no cadastro
  const proximaOrdem = useMemo(() => {
    if (mensagens.length === 0) return 1
    const max = Math.max(...mensagens.map((m) => Number(m.ordem || 0)))
    return Number.isFinite(max) && max >= 1 ? max + 1 : 1
  }, [mensagens])

  const handleOpenCreate = () => {
    setEditingMensagem(null)
    setFormData({
      texto: '',
      faixa_atraso: 'Menos de 30 dias',
      ordem: proximaOrdem,
    })
    setFormErrors({})
    setModalOpen(true)
  }

  const handleOpenEdit = (msg: MensagemClienteRecord) => {
    setEditingMensagem(msg)
    setFormData({
      texto: msg.texto,
      faixa_atraso: msg.faixa_atraso,
      ordem: msg.ordem,
    })
    setFormErrors({})
    setModalOpen(true)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formData.texto.trim()) {
      errors.texto = 'O texto da mensagem é obrigatório.'
    }
    if (!formData.faixa_atraso) {
      errors.faixa_atraso = 'Selecione a faixa de atraso correspondente.'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    try {
      if (editingMensagem) {
        const updated = await updateMensagem(editingMensagem.id, {
          texto: formData.texto,
          faixa_atraso: formData.faixa_atraso,
          ordem: formData.ordem,
        })
        setMensagens((prev) => {
          const next = prev.map((m) => (m.id === updated.id ? updated : m))
          next.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
          return next
        })
        toast({
          title: 'Mensagem atualizada',
          description: `Mensagem #${updated.ordem} atualizada com sucesso.`,
        })
      } else {
        const created = await createMensagem({
          texto: formData.texto,
          faixa_atraso: formData.faixa_atraso,
          ordem: formData.ordem,
        })
        setMensagens((prev) => {
          if (prev.some((m) => m.id === created.id)) return prev
          const next = [...prev, created]
          next.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
          return next
        })
        toast({
          title: 'Mensagem cadastrada',
          description: `Mensagem #${created.ordem} cadastrada com sucesso.`,
        })
      }
      setModalOpen(false)
    } catch (err: unknown) {
      const e = err as Error
      console.error('Erro ao salvar mensagem:', err)
      toast({
        title: 'Erro ao salvar',
        description: e?.message || 'Não foi possível salvar a mensagem. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingMensagem) return
    setIsDeleting(true)
    try {
      await deleteMensagem(deletingMensagem.id)
      setMensagens((prev) => prev.filter((m) => m.id !== deletingMensagem.id))
      toast({
        title: 'Mensagem excluída',
        description: `A mensagem #${deletingMensagem.ordem} foi removida com sucesso.`,
      })
      setDeletingMensagem(null)
    } catch (err: unknown) {
      const e = err as Error
      console.error('Erro ao excluir mensagem:', err)
      toast({
        title: 'Erro ao excluir',
        description: e?.message || 'Não foi possível excluir a mensagem.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCopyText = async (msg: MensagemClienteRecord) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg.texto)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = msg.texto
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast({
        title: 'Mensagem copiada!',
        description: 'Texto copiado para a área de transferência.',
      })
    } catch (err) {
      console.error('Erro ao copiar texto:', err)
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o texto automaticamente.',
        variant: 'destructive',
      })
    }
  }

  const filteredMensagens = useMemo(() => {
    return mensagens.filter((m) => {
      if (faixaFilter !== 'ALL' && m.faixa_atraso !== faixaFilter) {
        return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const textMatch = (m.texto || '').toLowerCase().includes(q)
        const faixaMatch = (m.faixa_atraso || '').toLowerCase().includes(q)
        const ordemMatch = String(m.ordem || '').includes(q)
        return textMatch || faixaMatch || ordemMatch
      }
      return true
    })
  }, [mensagens, faixaFilter, search])

  const renderFaixaBadge = (faixa: FaixaAtrasoMensagem) => {
    switch (faixa) {
      case 'Menos de 30 dias':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            Menos de 30 dias
          </Badge>
        )
      case '31 a 60 dias':
        return (
          <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            31 a 60 dias
          </Badge>
        )
      case 'Maior que 90 dias':
        return (
          <Badge className="bg-rose-600 hover:bg-rose-700 text-white border-none text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
            Maior que 90 dias
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[11px]">
            {faixa}
          </Badge>
        )
    }
  }

  const countsPorFaixa = useMemo(() => {
    return {
      menos30: mensagens.filter((m) => m.faixa_atraso === 'Menos de 30 dias').length,
      de31a60: mensagens.filter((m) => m.faixa_atraso === '31 a 60 dias').length,
      maior90: mensagens.filter((m) => m.faixa_atraso === 'Maior que 90 dias').length,
    }
  }, [mensagens])

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#12365A] flex items-center justify-center text-white shadow-xs">
            <MessageSquare className="w-5 h-5 text-[#0E9F8A]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#12365A] tracking-tight">
              Mensagens para Clientes
            </h2>
            <p className="text-xs text-[#5B6B82]">
              Cadastre e gerencie os modelos de mensagens usados no contato com clientes por faixa
              de atraso
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-9 text-xs border-[#E3E9F2] text-[#5B6B82] hover:text-[#12233A] hover:bg-[#F8FAFC] gap-1.5"
            title="Recarregar mensagens"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>

          <Button
            onClick={handleOpenCreate}
            className="bg-[#12365A] hover:bg-[#0E2A47] text-white font-semibold text-xs sm:text-sm h-9 px-4 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#0E9F8A]" />
            <span>Nova Mensagem</span>
          </Button>
        </div>
      </div>

      {/* Cards de Métricas por Faixa */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Geral */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#5B6B82] uppercase tracking-wider">
              Total de Modelos
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#12233A] mt-0.5">
              {mensagens.length}
            </p>
            <p className="text-[10px] text-[#8A97AC] mt-0.5">Mensagens cadastradas</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#F0F5FC] border border-[#E3E9F2] flex items-center justify-center text-[#12365A] shrink-0">
            <MessageSquare className="w-5 h-5 text-[#12365A]" />
          </div>
        </div>

        {/* Menos de 30 dias */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                &lt; 30 dias
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">
              {countsPorFaixa.menos30}
            </p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Menos de 30 dias</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <span className="font-bold text-xs">M30</span>
          </div>
        </div>

        {/* 31 a 60 dias */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <p className="text-[11px] font-semibold text-orange-700 uppercase tracking-wider">
                31 a 60 dias
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5">
              {countsPorFaixa.de31a60}
            </p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Faixa intermediária</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
            <span className="font-bold text-xs">31-60</span>
          </div>
        </div>

        {/* Maior que 90 dias */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E3E9F2] shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                &gt; 90 dias
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-600 mt-0.5">
              {countsPorFaixa.maior90}
            </p>
            <p className="text-[10px] text-[#5B6B82] mt-0.5">Atraso crítico</p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <span className="font-bold text-xs">&gt;90</span>
          </div>
        </div>
      </div>

      {/* Tabela de Mensagens */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {/* Barra de filtros e busca */}
        <div className="p-4 border-b border-[#E3E9F2] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por texto, ordem ou faixa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]"
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <span className="text-xs font-semibold text-[#5B6B82] uppercase">Faixa:</span>
            <div className="inline-flex rounded-lg border border-[#E3E9F2] p-0.5 bg-[#F8FAFC] flex-wrap gap-0.5">
              <button
                type="button"
                onClick={() => setFaixaFilter('ALL')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  faixaFilter === 'ALL'
                    ? 'bg-[#12365A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Todas ({mensagens.length})
              </button>
              <button
                type="button"
                onClick={() => setFaixaFilter('Menos de 30 dias')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  faixaFilter === 'Menos de 30 dias'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Menos de 30 dias
              </button>
              <button
                type="button"
                onClick={() => setFaixaFilter('31 a 60 dias')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  faixaFilter === '31 a 60 dias'
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                31 a 60 dias
              </button>
              <button
                type="button"
                onClick={() => setFaixaFilter('Maior que 90 dias')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  faixaFilter === 'Maior que 90 dias'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Maior que 90 dias
              </button>
            </div>
          </div>
        </div>

        {/* Tabela com listagem ordenada pela ordem */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 w-24 text-center">ORDEM</th>
                <th className="px-4 py-3.5 w-48">FAIXA DE ATRASO</th>
                <th className="px-4 py-3.5 min-w-[320px]">TEXTO DA MENSAGEM</th>
                <th className="px-4 py-3.5 text-right w-32">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando mensagens...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredMensagens.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-semibold text-[#12365A]">Nenhuma mensagem encontrada</p>
                      <p className="text-xs text-[#5B6B82]">
                        {search || faixaFilter !== 'ALL'
                          ? 'Tente ajustar os filtros ou o termo de busca.'
                          : 'Clique em "Nova Mensagem" para cadastrar o primeiro modelo de envio.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMensagens.map((msg, idx) => {
                  const isCopied = copiedId === msg.id

                  return (
                    <tr
                      key={msg.id}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* ORDEM */}
                      <td className="px-4 py-3.5 text-center font-bold text-[#12365A] font-mono text-sm">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#12365A]/10 text-[#12365A]">
                          #{msg.ordem}
                        </span>
                      </td>

                      {/* FAIXA DE ATRASO */}
                      <td className="px-4 py-3.5">{renderFaixaBadge(msg.faixa_atraso)}</td>

                      {/* TEXTO DA MENSAGEM */}
                      <td className="px-4 py-3.5 text-[#12233A]">
                        <p className="whitespace-pre-wrap leading-relaxed text-xs font-normal max-w-3xl">
                          {msg.texto}
                        </p>
                      </td>

                      {/* AÇÕES */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyText(msg)}
                            className={cn(
                              'h-8 w-8 p-0',
                              isCopied
                                ? 'text-emerald-600 bg-emerald-50'
                                : 'text-slate-500 hover:text-[#12365A] hover:bg-slate-100',
                            )}
                            title="Copiar texto"
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(msg)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-[#12365A] hover:bg-slate-100"
                            title="Editar mensagem"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingMensagem(msg)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir mensagem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#12365A] mb-1">
              <MessageSquare className="w-5 h-5 text-[#0E9F8A]" />
              <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A]">
                {editingMensagem ? `Editar Mensagem #${editingMensagem.ordem}` : 'Nova Mensagem'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              {editingMensagem
                ? 'Altere o conteúdo e a faixa de atraso desta mensagem.'
                : 'Defina o texto e a faixa de atraso. O número de ordem é gerado sequencialmente.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            {/* Ordem (automática, informada/exibida) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#12365A] block mb-1">Ordem de Criação:</label>
                <Input
                  type="number"
                  disabled
                  value={editingMensagem ? editingMensagem.ordem : proximaOrdem}
                  className="h-9 text-xs bg-slate-100 text-[#12365A] font-bold font-mono cursor-not-allowed"
                />
                <span className="text-[10px] text-[#5B6B82] mt-0.5 block">
                  Atribuída automaticamente na sequência.
                </span>
              </div>

              <div>
                <label className="font-semibold text-[#12365A] block mb-1">
                  Faixa de Atraso: <span className="text-red-500">*</span>
                </label>
                <Select
                  value={formData.faixa_atraso}
                  onValueChange={(val: FaixaAtrasoMensagem) =>
                    setFormData((prev) => ({ ...prev, faixa_atraso: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]">
                    <SelectValue placeholder="Selecione a faixa" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {FAIXAS_ATRASO_MENSAGEM.map((faixa) => (
                      <SelectItem key={faixa} value={faixa} className="text-xs">
                        {faixa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.faixa_atraso && (
                  <span className="text-[11px] text-red-500 mt-1 block">
                    {formErrors.faixa_atraso}
                  </span>
                )}
              </div>
            </div>

            {/* Texto da mensagem */}
            <div>
              <label className="font-semibold text-[#12365A] block mb-1">
                Texto da Mensagem: <span className="text-red-500">*</span>
              </label>
              <Textarea
                rows={5}
                placeholder="Ex.: Olá! Identificamos pendência na sua fatura. Por favor, regularize para evitar o bloqueio dos serviços..."
                value={formData.texto}
                onChange={(e) => setFormData((prev) => ({ ...prev, texto: e.target.value }))}
                className="text-xs bg-[#F8FAFC] border-[#E3E9F2] resize-y min-h-[120px]"
              />
              {formErrors.texto ? (
                <span className="text-[11px] text-red-500 mt-1 block">{formErrors.texto}</span>
              ) : (
                <span className="text-[10px] text-[#5B6B82] mt-0.5 block">
                  Texto livre que será copiado pela equipe na tela de Inadimplência.
                </span>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="text-xs bg-[#12365A] hover:bg-[#0E2A47] text-white gap-1.5"
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingMensagem ? 'Salvar Alterações' : 'Cadastrar Mensagem'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog
        open={Boolean(deletingMensagem)}
        onOpenChange={(open) => !isDeleting && !open && setDeletingMensagem(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <Trash2 className="w-5 h-5" />
              <DialogTitle className="text-base sm:text-lg font-bold text-[#12365A]">
                Confirmar Exclusão
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Esta ação não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs text-[#12233A] space-y-2">
            <p>
              Deseja realmente excluir a mensagem <strong>#{deletingMensagem?.ordem}</strong> da
              faixa <strong>&ldquo;{deletingMensagem?.faixa_atraso}&rdquo;</strong>?
            </p>
            {deletingMensagem?.texto && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 italic max-h-32 overflow-y-auto">
                &ldquo;{deletingMensagem.texto}&rdquo;
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeletingMensagem(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
              className="text-xs gap-1.5"
            >
              {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Excluir Mensagem</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
