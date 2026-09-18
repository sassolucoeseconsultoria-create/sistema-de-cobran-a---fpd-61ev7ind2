import React, { useState, useEffect, useMemo } from 'react'
import {
  Store,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  ArrowUpDown,
  Filter,
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
import {
  fetchStores,
  fetchFpdRecords,
  createStore,
  updateStore,
  deleteStore,
  clearAllStores,
} from '@/services/fpdService'
import type { StoreRecord, FpdRecord } from '@/types/fpd'
import { cn } from '@/lib/utils'
import { isSessionExpiredError } from '@/lib/pocketbase/client'

export const Lojas: React.FC = () => {
  const { toast } = useToast()
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [records, setRecords] = useState<FpdRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Search & Filter
  const [search, setSearch] = useState('')
  const [filterDataStatus, setFilterDataStatus] = useState<'all' | 'with_data' | 'no_data'>('all')

  // Create store modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCoordenacao, setNewCoordenacao] = useState('')
  const [newSupervisao, setNewSupervisao] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    storeId: string
    field: 'coordenacao' | 'supervisao'
  } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Delete modal
  const [storeToDelete, setStoreToDelete] = useState<StoreRecord | null>(null)

  // Clear all stores modal
  const [clearStoresDialogOpen, setClearStoresDialogOpen] = useState(false)
  const [isClearingStores, setIsClearingStores] = useState(false)

  // Load data
  const loadData = async () => {
    try {
      setLoading(true)
      const [s, r] = await Promise.all([fetchStores(), fetchFpdRecords()])
      setStores(s)
      setRecords(r)
    } catch (err: unknown) {
      if (isSessionExpiredError(err)) {
        return
      }
      toast({
        title: 'Erro ao carregar lojas',
        description: 'Não foi possível carregar a lista de lojas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Real-time
  useRealtime<StoreRecord>('stores', (e) => {
    if (e.action === 'create') {
      setStores((prev) => {
        if (prev.some((s) => s.id === e.record.id)) return prev
        return [...prev, e.record].sort((a, b) => a.name.localeCompare(b.name))
      })
    } else if (e.action === 'update') {
      setStores((prev) => prev.map((s) => (s.id === e.record.id ? e.record : s)))
    } else if (e.action === 'delete') {
      setStores((prev) => prev.filter((s) => s.id !== e.record.id))
    }
  })

  useRealtime<FpdRecord>('fpd_records', (e) => {
    if (e.action === 'create') {
      setRecords((prev) => [e.record, ...prev.filter((r) => r.id !== e.record.id)])
    } else if (e.action === 'update') {
      setRecords((prev) => prev.map((r) => (r.id === e.record.id ? e.record : r)))
    } else if (e.action === 'delete') {
      setRecords((prev) => prev.filter((r) => r.id !== e.record.id))
    }
  })

  // Create Store
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!newName.trim()) {
      setCreateError('O nome da loja é obrigatório.')
      return
    }

    setCreating(true)
    try {
      await createStore({
        name: newName.trim().toUpperCase(),
        coordenacao: newCoordenacao.trim(),
        supervisao: newSupervisao.trim(),
      })

      toast({
        title: 'Loja cadastrada',
        description: `Loja "${newName.toUpperCase()}" cadastrada com sucesso.`,
      })

      setNewName('')
      setNewCoordenacao('')
      setNewSupervisao('')
      setCreateModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique') || msg.includes('already exists')) {
        setCreateError('Já existe uma loja com este nome.')
      } else {
        setCreateError('Erro ao cadastrar loja. Verifique os dados.')
      }
    } finally {
      setCreating(false)
    }
  }

  // Start inline edit
  const startInlineEdit = (store: StoreRecord, field: 'coordenacao' | 'supervisao') => {
    setEditingCell({ storeId: store.id, field })
    setEditValue(store[field] || '')
  }

  // Save inline edit
  const saveInlineEdit = async () => {
    if (!editingCell) return

    const { storeId, field } = editingCell
    const trimmed = editValue.trim()

    try {
      await updateStore(storeId, {
        [field]: trimmed,
      })
      toast({
        title: 'Campo atualizado',
        description: 'Informação salva com sucesso.',
      })
    } catch {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível atualizar o campo.',
        variant: 'destructive',
      })
    } finally {
      setEditingCell(null)
    }
  }

  // Delete Store
  const handleDeleteStore = async () => {
    if (!storeToDelete) return

    try {
      await deleteStore(storeToDelete.id)
      toast({
        title: 'Loja excluída',
        description: `A loja "${storeToDelete.name}" e seus registros foram removidos.`,
      })
      setStoreToDelete(null)
    } catch {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a loja.',
        variant: 'destructive',
      })
    }
  }

  // Clear all stores
  const handleClearAllStores = async () => {
    try {
      setIsClearingStores(true)
      const count = await clearAllStores()
      setStores([])
      setRecords([])
      setClearStoresDialogOpen(false)
      toast({
        title: 'Lojas limpas com sucesso!',
        description: `${count} loja(s) e todos os registros e históricos vinculados foram removidos.`,
      })
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao limpar lojas',
        description:
          err instanceof Error ? err.message : 'Não foi possível remover as lojas cadastradas.',
        variant: 'destructive',
      })
    } finally {
      setIsClearingStores(false)
    }
  }

  // Filtered stores
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      // Search
      if (search) {
        const q = search.toLowerCase()
        const matchName = store.name.toLowerCase().includes(q)
        const matchCoord = (store.coordenacao || '').toLowerCase().includes(q)
        const matchSuper = (store.supervisao || '').toLowerCase().includes(q)
        if (!matchName && !matchCoord && !matchSuper) return false
      }

      // Status filter
      const storeHasData = records.some((r) => r.store === store.id)
      if (filterDataStatus === 'with_data' && !storeHasData) return false
      if (filterDataStatus === 'no_data' && storeHasData) return false

      return true
    })
  }, [stores, records, search, filterDataStatus])

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-[#E3E9F2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#12365A]">
            Gerenciamento de Lojas ({stores.length})
          </h2>
          <p className="text-xs text-[#5B6B82]">
            Cadastre novas lojas ou edite inline Coordenação e Supervisão.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stores.length > 0 && (
            <Button
              onClick={() => setClearStoresDialogOpen(true)}
              variant="outline"
              className="h-9 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 font-medium text-xs sm:text-sm gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>Limpar Lojas</span>
            </Button>
          )}

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-[#12365A] hover:bg-[#0E2A47] text-white font-semibold text-xs sm:text-sm h-9 px-4 gap-2 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Loja</span>
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E3E9F2] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#8A97AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por nome, coordenação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#F8FAFC] border-[#E3E9F2]"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold text-[#5B6B82] uppercase">Status:</span>
            <div className="inline-flex rounded-lg border border-[#E3E9F2] p-0.5 bg-[#F8FAFC]">
              <button
                onClick={() => setFilterDataStatus('all')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  filterDataStatus === 'all'
                    ? 'bg-[#12365A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Todas ({stores.length})
              </button>
              <button
                onClick={() => setFilterDataStatus('with_data')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  filterDataStatus === 'with_data'
                    ? 'bg-[#0E9F8A] text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Com dados
              </button>
              <button
                onClick={() => setFilterDataStatus('no_data')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  filterDataStatus === 'no_data'
                    ? 'bg-slate-500 text-white shadow-xs'
                    : 'text-[#5B6B82] hover:text-[#12233A]',
                )}
              >
                Sem dados
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 min-w-[220px]">LOJA</th>
                <th className="px-3 py-3.5 min-w-[150px]">COORDENAÇÃO</th>
                <th className="px-3 py-3.5 min-w-[150px]">SUPERVISÃO</th>
                <th className="px-3 py-3.5 min-w-[120px]">STATUS FPD</th>
                <th className="px-3 py-3.5 min-w-[150px]">ÚLTIMA IMPORTAÇÃO</th>
                <th className="px-3 py-3.5 text-right min-w-[80px]">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9F2]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                      <span>Carregando lojas cadastradas...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#5B6B82]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
                      <p className="font-semibold text-[#12365A]">Nenhuma loja encontrada</p>
                      <p className="text-xs text-[#5B6B82]">
                        Cadastre uma nova loja com o botão acima ou importe planilhas para criá-las
                        automaticamente.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStores.map((store, idx) => {
                  const storeRecords = records.filter((r) => r.store === store.id)
                  const latestRecord = storeRecords[0]
                  const hasData = !!latestRecord

                  return (
                    <tr
                      key={store.id}
                      className={cn(
                        'hover:bg-[#F0F5FC] transition-colors',
                        idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                      )}
                    >
                      {/* LOJA */}
                      <td className="px-4 py-3 font-bold text-[#12365A]">{store.name}</td>

                      {/* COORDENAÇÃO (Inline editable) */}
                      <td className="px-3 py-2 text-[#5B6B82]">
                        {editingCell?.storeId === store.id &&
                        editingCell.field === 'coordenacao' ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveInlineEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveInlineEdit()
                                if (e.key === 'Escape') setEditingCell(null)
                              }}
                              autoFocus
                              className="h-7 text-xs bg-white"
                            />
                            <Button
                              onClick={saveInlineEdit}
                              size="sm"
                              className="h-7 w-7 p-0 bg-[#0E9F8A] text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            onClick={() => startInlineEdit(store, 'coordenacao')}
                            className="group flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-slate-100/80 -mx-1.5"
                            title="Clique para editar"
                          >
                            <span className={!store.coordenacao ? 'text-slate-300' : ''}>
                              {store.coordenacao || 'Adicionar...'}
                            </span>
                            <Edit2 className="w-3 h-3 text-[#8A97AC] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* SUPERVISÃO (Inline editable) */}
                      <td className="px-3 py-2 text-[#5B6B82]">
                        {editingCell?.storeId === store.id && editingCell.field === 'supervisao' ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveInlineEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveInlineEdit()
                                if (e.key === 'Escape') setEditingCell(null)
                              }}
                              autoFocus
                              className="h-7 text-xs bg-white"
                            />
                            <Button
                              onClick={saveInlineEdit}
                              size="sm"
                              className="h-7 w-7 p-0 bg-[#0E9F8A] text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            onClick={() => startInlineEdit(store, 'supervisao')}
                            className="group flex items-center justify-between cursor-pointer py-1 px-1.5 rounded hover:bg-slate-100/80 -mx-1.5"
                            title="Clique para editar"
                          >
                            <span className={!store.supervisao ? 'text-slate-300' : ''}>
                              {store.supervisao || 'Adicionar...'}
                            </span>
                            <Edit2 className="w-3 h-3 text-[#8A97AC] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* STATUS FPD */}
                      <td className="px-3 py-3">
                        {hasData ? (
                          <Badge className="bg-[#16A34A] text-white text-[10px] h-5 font-semibold">
                            Com dados ({latestRecord.total_linhas} linhas)
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-slate-400 border-slate-200 text-[10px] h-5"
                          >
                            Sem dados
                          </Badge>
                        )}
                      </td>

                      {/* ÚLTIMA IMPORTAÇÃO */}
                      <td className="px-3 py-3 text-[#5B6B82] text-[11px]">
                        {latestRecord ? (
                          <div>
                            <span className="font-semibold text-[#12365A]">
                              {latestRecord.referente
                                ? `Ref: ${latestRecord.referente}`
                                : 'Importado'}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {new Date(
                                latestRecord.importado_em || latestRecord.created,
                              ).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* AÇÕES */}
                      <td className="px-3 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStoreToDelete(store)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Excluir loja"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Adicionar Loja */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Cadastrar Nova Loja
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Insira os dados cadastrais da loja para a rede CELNET.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateStore} className="space-y-4 py-2">
            {createError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {createError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[#12365A]">
                Nome da Loja *
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: CELNET TAGUATINGA SHOPPING"
                className="text-xs uppercase bg-[#F8FAFC]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A]">
                  Coordenação
                </label>
                <Input
                  value={newCoordenacao}
                  onChange={(e) => setNewCoordenacao(e.target.value)}
                  placeholder="Ex: VALÉRIA"
                  className="text-xs uppercase bg-[#F8FAFC]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[#12365A]">Supervisão</label>
                <Input
                  value={newSupervisao}
                  onChange={(e) => setNewSupervisao(e.target.value)}
                  placeholder="Ex: LUANA"
                  className="text-xs uppercase bg-[#F8FAFC]"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs font-semibold"
              >
                {creating ? 'Salvando...' : 'Salvar Loja'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Exclusão de Loja */}
      <Dialog open={!!storeToDelete} onOpenChange={(open) => !open && setStoreToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Confirmar exclusão de loja
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5B6B82]">
              Tem certeza de que deseja excluir a loja{' '}
              <strong className="text-[#12365A]">"{storeToDelete?.name}"</strong>? Esta ação
              excluirá em cascata todos os registros consolidados de FPD vinculados a ela.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setStoreToDelete(null)} className="text-xs">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteStore}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              Sim, excluir loja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Limpar Todas as Lojas */}
      <Dialog
        open={clearStoresDialogOpen}
        onOpenChange={(open) => !isClearingStores && setClearStoresDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#12365A]">
              Limpar todas as lojas?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[#5B6B82] leading-relaxed">
              Tem certeza de que deseja excluir todas as{' '}
              <strong className="text-red-700">{stores.length} lojas cadastradas</strong> e todos os
              seus históricos de consolidação FPD? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setClearStoresDialogOpen(false)}
              disabled={isClearingStores}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAllStores}
              disabled={isClearingStores}
              className="text-xs bg-red-600 hover:bg-red-700 gap-2"
            >
              {isClearingStores && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{isClearingStores ? 'Limpando lojas...' : 'Limpar Todas as Lojas'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Lojas
