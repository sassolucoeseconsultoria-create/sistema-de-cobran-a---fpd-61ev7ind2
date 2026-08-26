import React from 'react'
import {
  Building2,
  Calendar,
  Layers,
  Sparkles,
  BarChart3,
  History,
  Trash2,
  Clock,
  Inbox,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  FPD_STATUSES,
  type ConsolidatedRow,
  type FpdRecord,
  type FpdStatusConfig,
} from '@/types/fpd'

interface StoreAnalyticsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: ConsolidatedRow | null
  history: FpdRecord[]
  loadingHistory: boolean
  onDeleteRecord?: (recordId: string) => void
}

// Helper to extract status numeric value from a record or ConsolidatedRow
function getStatusCount(
  source: ConsolidatedRow | FpdRecord | undefined | null,
  key: string,
): number {
  if (!source) return 0
  // In ConsolidatedRow, camelCase is used: faturaPaga, envioFatura, promessaPagto, semContato, cancelados, pendente, contatoRealizado, outros, naoTratados
  const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as keyof ConsolidatedRow
  if (camelKey in source) {
    const val = (source as unknown as Record<string, unknown>)[camelKey]
    return typeof val === 'number' && Number.isFinite(val) ? val : 0
  }
  // In FpdRecord, snake_case is used: envio_fatura, etc.
  const rawVal = (source as unknown as Record<string, unknown>)[key]
  return typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : 0
}

export const StoreAnalyticsDrawer: React.FC<StoreAnalyticsDrawerProps> = ({
  open,
  onOpenChange,
  store,
  history,
  loadingHistory,
  onDeleteRecord,
}) => {
  if (!store) return null

  const hasData = store.hasData && store.totalLinhas > 0

  // Calculate status items with percentages
  const statusItems = FPD_STATUSES.map((status: FpdStatusConfig) => {
    const count = getStatusCount(store, status.key)
    const pct = hasData && store.totalLinhas > 0 ? (count / store.totalLinhas) * 100 : 0
    return {
      ...status,
      count,
      pct,
    }
  })

  // Sort by count descending for ranking/insights if needed
  const nonZeroStatuses = statusItems.filter((s) => s.count > 0)
  const maxStatusCount = Math.max(...statusItems.map((s) => s.count), 1)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] md:max-w-[500px] p-0 flex flex-col bg-[#F8FAFC] border-l border-[#E3E9F2] shadow-2xl overflow-hidden"
      >
        {/* Top Sticky Header */}
        <div className="bg-white border-b border-[#E3E9F2] px-6 py-5 shrink-0">
          <SheetHeader className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#12365A]/10 text-[#12365A] flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4 text-[#12365A]" />
                </div>
                <Badge
                  variant="outline"
                  className="border-[#0E9F8A] text-[#0E9F8A] bg-[#0E9F8A]/10 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
                >
                  Visão Analítica
                </Badge>
              </div>

              {store.referente && (
                <span className="text-[11px] font-semibold text-[#5B6B82] bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#5B6B82]" />
                  Ref: {store.referente}
                </span>
              )}
            </div>

            <SheetTitle className="text-xl font-bold text-[#12365A] tracking-tight leading-snug">
              {store.storeName}
            </SheetTitle>

            <SheetDescription className="text-xs text-[#5B6B82]">
              Painel analítico detalhado de status, volumetria e histórico de importações.
            </SheetDescription>
          </SheetHeader>

          {/* 1. Header Metadata Section (Coordenação, Supervisão, Observação) */}
          <div className="mt-4 pt-4 border-t border-[#E3E9F2] grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-[#F8FAFC] border border-[#E3E9F2] rounded-lg p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A97AC] block">
                Coordenação
              </span>
              <span className="font-semibold text-[#12365A] truncate block mt-0.5">
                {store.coordenacao || (
                  <span className="text-slate-400 font-normal">Não informada</span>
                )}
              </span>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E3E9F2] rounded-lg p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A97AC] block">
                Supervisão
              </span>
              <span className="font-semibold text-[#12365A] truncate block mt-0.5">
                {store.supervisao || (
                  <span className="text-slate-400 font-normal">Não informada</span>
                )}
              </span>
            </div>

            {store.observacao && (
              <div className="col-span-2 bg-[#F8FAFC] border border-[#E3E9F2] rounded-lg p-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A97AC] block">
                  Observação
                </span>
                <p className="text-xs text-[#12365A] mt-0.5 leading-relaxed font-normal">
                  {store.observacao}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Highlight for Total Lines (Coluna D) */}
          <div className="bg-gradient-to-br from-[#12365A] to-[#1a4a7a] rounded-xl p-4 text-white shadow-md flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0E9F8A]" />
                Total de Linhas (Coluna D)
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold tabular-nums tracking-tight">
                  {store.totalLinhas.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-slate-300 font-medium">Móvel + Residencial</span>
              </div>
              {store.importadoEm && (
                <span className="text-[10px] text-slate-300 block mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  Última importação: {new Date(store.importadoEm).toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-[#0E9F8A]">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>

          {!hasData && (
            <div className="bg-white rounded-xl border border-dashed border-[#CBD5E1] p-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Inbox className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-[#12365A]">Sem dados importados</h4>
              <p className="text-xs text-[#5B6B82] max-w-xs mx-auto">
                Esta loja ainda não possui registros importados de planilhas FPD.
              </p>
            </div>
          )}

          {hasData && (
            <>
              {/* 2. Resumo de status (grid com 10 cards/badges) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#12365A] flex items-center gap-1.5">
                    <span>Resumo por Status</span>
                    <span className="text-[11px] font-normal text-[#5B6B82] lowercase">
                      ({nonZeroStatuses.length} com registros)
                    </span>
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {statusItems.map((item) => {
                    const isPositive = item.count > 0
                    return (
                      <div
                        key={item.key}
                        className="p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between relative overflow-hidden"
                        style={{
                          backgroundColor: isPositive ? item.bgTint : '#FFFFFF',
                          borderColor: isPositive ? item.borderTint : '#E3E9F2',
                        }}
                      >
                        {/* Top Indicator bar */}
                        <div
                          className="absolute top-0 left-0 right-0 h-1"
                          style={{
                            backgroundColor: isPositive ? item.color : 'transparent',
                          }}
                        />

                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span
                            className="text-xs font-semibold truncate leading-tight"
                            style={{ color: isPositive ? item.textColor : '#475569' }}
                            title={item.label}
                          >
                            {item.label}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between mt-auto">
                          <span
                            className="text-lg font-bold tabular-nums"
                            style={{ color: isPositive ? item.textColor : '#94A3B8' }}
                          >
                            {item.count.toLocaleString('pt-BR')}
                          </span>
                          <span
                            className="text-[11px] font-medium tabular-nums"
                            style={{ color: isPositive ? item.textColor : '#94A3B8' }}
                          >
                            {item.pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 4. Gráfico de barras horizontal simples (distribuição proporcional) */}
              <div className="bg-white rounded-xl border border-[#E3E9F2] p-4 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#E3E9F2] pb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#12365A] flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#0E9F8A]" />
                    <span>Distribuição dos Status</span>
                  </h4>
                  <span className="text-[11px] text-[#5B6B82] font-medium">
                    Proporção sobre {store.totalLinhas.toLocaleString('pt-BR')} linhas
                  </span>
                </div>

                {/* Combined Stacked progress preview */}
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                  {statusItems.map((item) => {
                    if (item.count <= 0) return null
                    return (
                      <div
                        key={item.key}
                        style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                        title={`${item.label}: ${item.count.toLocaleString('pt-BR')} (${item.pct.toFixed(1)}%)`}
                      />
                    )
                  })}
                </div>

                {/* Horizontal bar chart list */}
                <div className="space-y-2.5 pt-1">
                  {statusItems.map((item) => {
                    const barWidth =
                      maxStatusCount > 0 ? Math.max((item.count / maxStatusCount) * 100, 0) : 0

                    return (
                      <div key={item.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-medium text-[#12365A] truncate text-[12px]">
                              {item.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span className="font-bold text-[#12365A] text-[12px]">
                              {item.count.toLocaleString('pt-BR')}
                            </span>
                            <span className="text-[11px] text-[#5B6B82] w-12 text-right">
                              ({item.pct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        {/* Bar track */}
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: item.color,
                              opacity: item.count > 0 ? 1 : 0.2,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* 3. Histórico de importações (lista cronológica, mais recente primeiro) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#12365A] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#0E9F8A]" />
                <span>Histórico de Importações</span>
              </h4>
              {history.length > 0 && (
                <Badge variant="secondary" className="text-[10px] font-semibold text-[#5B6B82]">
                  {history.length} {history.length === 1 ? 'registro' : 'registros'}
                </Badge>
              )}
            </div>

            {loadingHistory ? (
              <div className="py-8 bg-white rounded-xl border border-[#E3E9F2] text-center text-xs text-[#5B6B82] flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-[#0E9F8A] border-t-transparent rounded-full animate-spin" />
                <span>Buscando histórico de importações...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="p-4 bg-white rounded-xl border border-[#E3E9F2] text-center text-xs text-[#5B6B82]">
                Nenhuma importação registrada no histórico desta loja.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-0.5">
                {history.map((record, index) => {
                  const recordTotal = record.total_linhas || 0
                  const isLatest = index === 0

                  return (
                    <div
                      key={record.id}
                      className="p-3.5 rounded-xl border border-[#E3E9F2] bg-white shadow-2xs space-y-2.5 transition hover:border-[#CBD5E1]"
                    >
                      {/* Top Row: Date & Referente */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[#12365A] text-xs">
                              {record.referente
                                ? `Ref: ${record.referente}`
                                : 'Importação sem ref.'}
                            </span>
                            {isLatest && (
                              <Badge className="bg-[#0E9F8A] text-white text-[9px] px-1.5 py-0 h-4 uppercase font-bold tracking-wider">
                                Atual
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-[#5B6B82] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(record.importado_em || record.created).toLocaleString(
                              'pt-BR',
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-xs font-bold text-[#12365A] tabular-nums block">
                              {recordTotal.toLocaleString('pt-BR')}
                            </span>
                            <span className="text-[10px] text-[#8A97AC] uppercase font-semibold">
                              linhas
                            </span>
                          </div>

                          {onDeleteRecord && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDeleteRecord(record.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg ml-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-[#12365A] text-white">
                                Excluir importação
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      {/* Mini Breakdown Bars */}
                      {recordTotal > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-100">
                          {/* Mini Progress Bar */}
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                            {FPD_STATUSES.map((status) => {
                              const count = getStatusCount(record, status.key)
                              if (count <= 0) return null
                              const pct = (count / recordTotal) * 100
                              return (
                                <div
                                  key={status.key}
                                  style={{ width: `${pct}%`, backgroundColor: status.color }}
                                  title={`${status.label}: ${count} (${pct.toFixed(0)}%)`}
                                />
                              )
                            })}
                          </div>

                          {/* Compact Status Chips (top non-zero ones) */}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {FPD_STATUSES.filter((s) => getStatusCount(record, s.key) > 0).map(
                              (status) => {
                                const count = getStatusCount(record, status.key)
                                return (
                                  <span
                                    key={status.key}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    style={{
                                      backgroundColor: status.bgTint,
                                      color: status.textColor,
                                      border: `1px solid ${status.borderTint}`,
                                    }}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ backgroundColor: status.color }}
                                    />
                                    <span className="truncate max-w-[90px]">{status.label}:</span>
                                    <span className="font-bold tabular-nums">{count}</span>
                                  </span>
                                )
                              },
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default StoreAnalyticsDrawer
