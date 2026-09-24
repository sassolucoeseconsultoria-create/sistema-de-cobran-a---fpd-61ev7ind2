import React, { useState, useEffect, useCallback } from 'react'
import { ToggleLeft, RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  fetchConfigBotoes,
  updateConfigBotaoRole,
  type ConfigBotaoRecord,
  type RoleConfigField,
} from '@/services/configBotoesService'

const SCREEN_ORDER: Record<string, { label: string; order: number }> = {
  ranking_vendedores: { label: 'Ranking por Vendedor', order: 1 },
  top_ofensores: { label: 'Principais Ofensores', order: 2 },
  painel_lojas: { label: 'Painel de Lojas', order: 3 },
  inadimplencia: { label: 'Inadimplência', order: 4 },
}

export function AdminBotoesTab() {
  const { toast } = useToast()
  const [botoes, setBotoes] = useState<ConfigBotaoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const list = await fetchConfigBotoes()
      setBotoes(list)
    } catch (err: unknown) {
      console.error('Erro ao carregar configurações de botões:', err)
      toast({
        title: 'Erro ao carregar configurações',
        description: 'Não foi possível buscar as parametrizações de botões.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (
    record: ConfigBotaoRecord,
    roleField: RoleConfigField,
    currentValue: boolean,
  ) => {
    const nextValue = !currentValue
    const saveKey = `${record.id}-${roleField}`
    if (savingKey === saveKey) return

    // Atualização otimista no estado local
    setBotoes((prev) =>
      prev.map((item) => (item.id === record.id ? { ...item, [roleField]: nextValue } : item)),
    )
    setSavingKey(saveKey)

    try {
      const updated = await updateConfigBotaoRole(record.id, roleField, nextValue)
      setBotoes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      toast({
        title: 'Permissão atualizada!',
        description: `Visibilidade do botão "${record.botao_nome}" alterada com sucesso.`,
      })
    } catch (err: unknown) {
      // Rollback em caso de erro
      setBotoes((prev) =>
        prev.map((item) => (item.id === record.id ? { ...item, [roleField]: currentValue } : item)),
      )
      const e = err as Error
      console.error('Falha ao atualizar permissão do botão:', err)
      toast({
        title: 'Erro ao salvar alteração',
        description: e?.message || 'Falha ao atualizar o parâmetro no banco.',
        variant: 'destructive',
      })
    } finally {
      setSavingKey(null)
    }
  }

  // Agrupar botões por tela respeitando a ordem
  const groupedScreens = React.useMemo(() => {
    const groups: Record<
      string,
      { screenId: string; screenLabel: string; items: ConfigBotaoRecord[] }
    > = {}

    botoes.forEach((btn) => {
      const screenId = btn.tela_id
      if (!groups[screenId]) {
        groups[screenId] = {
          screenId,
          screenLabel: SCREEN_ORDER[screenId]?.label || btn.tela_nome || screenId,
          items: [],
        }
      }
      groups[screenId].items.push(btn)
    })

    return Object.values(groups).sort((a, b) => {
      const orderA = SCREEN_ORDER[a.screenId]?.order ?? 99
      const orderB = SCREEN_ORDER[b.screenId]?.order ?? 99
      return orderA - orderB
    })
  }, [botoes])

  return (
    <div className="space-y-6">
      {/* Header da Aba com título e subtítulo */}
      <div className="bg-white rounded-xl p-5 border border-[#E3E9F2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#12365A] flex items-center justify-center text-white shadow-xs">
            <ToggleLeft className="w-5 h-5 text-[#0E9F8A]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#12365A] tracking-tight">Botões e Ações</h2>
            <p className="text-xs text-[#5B6B82]">
              Configure quais botões cada perfil visualiza em cada tela.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-9 text-xs border-[#E3E9F2] text-[#5B6B82] hover:text-[#12233A] hover:bg-[#F8FAFC] gap-1.5"
            title="Recarregar parâmetros"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Tabela ou estado de loading / vazio */}
      <div className="bg-white rounded-xl border border-[#E3E9F2] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#5B6B82] flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Carregando configurações de botões...</span>
          </div>
        ) : botoes.length === 0 ? (
          <div className="p-8 text-center text-[#5B6B82] flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
            <AlertCircle className="w-8 h-8 text-[#8A97AC]" />
            <p className="font-semibold text-[#12365A] text-sm">
              Nenhuma configuração de botão encontrada
            </p>
            <p className="text-xs text-[#5B6B82]">
              A tabela de configuração de botões não possui registros ativos no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#12365A] text-white font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3 min-w-[200px]">TELA / BOTÃO</th>
                  <th className="px-3 py-3 text-center min-w-[100px]">CHAVE</th>
                  <th className="px-3 py-3 text-center min-w-[120px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white" />
                      <span>ADM</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                      <span>COORDENADOR</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                      <span>SUPERVISÃO</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
                      <span>GERENTE</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F2]">
                {groupedScreens.map((group) => (
                  <React.Fragment key={group.screenId}>
                    {/* Header do Grupo de Tela */}
                    <tr className="bg-[#F0F5FC]/80 border-t-2 border-b border-[#D5E2F1]">
                      <td
                        colSpan={6}
                        className="px-4 py-2 font-bold text-[#12365A] uppercase text-[11px] tracking-wide"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#0E9F8A]" />
                          {group.screenLabel}
                        </span>
                      </td>
                    </tr>

                    {/* Linhas de botões da tela */}
                    {group.items.map((btn, idx) => {
                      const isSavingRow = savingKey?.startsWith(`${btn.id}-`) ?? false

                      return (
                        <tr
                          key={btn.id}
                          className={cn(
                            'hover:bg-[#F8FAFC] transition-colors',
                            idx % 2 === 1 ? 'bg-[#FAFCFF]' : 'bg-white',
                          )}
                        >
                          {/* Tela / Rótulo */}
                          <td className="px-4 py-3.5 text-[#12365A]">
                            <div className="flex items-center gap-2">
                              {isSavingRow && (
                                <Loader2 className="w-3.5 h-3.5 text-[#0E9F8A] animate-spin shrink-0" />
                              )}
                              <span className="font-semibold text-xs text-[#12365A]">
                                {btn.botao_nome}
                              </span>
                            </div>
                          </td>

                          {/* Chave do Botão */}
                          <td className="px-3 py-3.5 text-center">
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px] px-2 py-0.5 bg-slate-50 border-slate-200 text-[#5B6B82]"
                            >
                              {btn.botao_id}
                            </Badge>
                          </td>

                          {/* Toggle ADM */}
                          <td className="px-3 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                aria-label={`Toggle ADM ${btn.botao_nome}`}
                                checked={btn.adm}
                                disabled={savingKey === `${btn.id}-adm`}
                                onCheckedChange={() => handleToggle(btn, 'adm', btn.adm)}
                                className="data-[state=checked]:bg-[#12365A]"
                              />
                              <span
                                className={cn(
                                  'text-[11px] font-semibold w-12 text-left',
                                  btn.adm ? 'text-[#12365A]' : 'text-slate-400',
                                )}
                              >
                                {btn.adm ? 'Visível' : 'Oculto'}
                              </span>
                            </div>
                          </td>

                          {/* Toggle Coordenador */}
                          <td className="px-3 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                aria-label={`Toggle Coordenador ${btn.botao_nome}`}
                                checked={btn.coordenador}
                                disabled={savingKey === `${btn.id}-coordenador`}
                                onCheckedChange={() =>
                                  handleToggle(btn, 'coordenador', btn.coordenador)
                                }
                                className="data-[state=checked]:bg-[#0284C7]"
                              />
                              <span
                                className={cn(
                                  'text-[11px] font-semibold w-12 text-left',
                                  btn.coordenador ? 'text-[#0284C7]' : 'text-slate-400',
                                )}
                              >
                                {btn.coordenador ? 'Visível' : 'Oculto'}
                              </span>
                            </div>
                          </td>

                          {/* Toggle Supervisão */}
                          <td className="px-3 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                aria-label={`Toggle Supervisão ${btn.botao_nome}`}
                                checked={btn.supervisor}
                                disabled={savingKey === `${btn.id}-supervisor`}
                                onCheckedChange={() =>
                                  handleToggle(btn, 'supervisor', btn.supervisor)
                                }
                                className="data-[state=checked]:bg-[#0D9488]"
                              />
                              <span
                                className={cn(
                                  'text-[11px] font-semibold w-12 text-left',
                                  btn.supervisor ? 'text-[#0D9488]' : 'text-slate-400',
                                )}
                              >
                                {btn.supervisor ? 'Visível' : 'Oculto'}
                              </span>
                            </div>
                          </td>

                          {/* Toggle Gerente */}
                          <td className="px-3 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                aria-label={`Toggle Gerente ${btn.botao_nome}`}
                                checked={btn.gerente}
                                disabled={savingKey === `${btn.id}-gerente`}
                                onCheckedChange={() => handleToggle(btn, 'gerente', btn.gerente)}
                                className="data-[state=checked]:bg-[#EA580C]"
                              />
                              <span
                                className={cn(
                                  'text-[11px] font-semibold w-12 text-left',
                                  btn.gerente ? 'text-[#EA580C]' : 'text-slate-400',
                                )}
                              >
                                {btn.gerente ? 'Visível' : 'Oculto'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
