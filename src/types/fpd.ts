import type { RecordModel } from 'pocketbase'

export interface StoreRecord extends RecordModel {
  name: string
  coordenacao?: string
  supervisao?: string
  observacao?: string
}

export interface FpdRecord extends RecordModel {
  store: string
  referente?: string
  total_linhas: number
  envio_fatura: number
  pendente?: number
  fatura_paga: number
  sem_contato: number
  promessa_pagto: number
  cancelados: number
  nao_tratados: number
  contato_realizado?: number
  outros?: number
  importado_em: string
  expand?: {
    store?: StoreRecord
  }
}

export interface ImportedFileRecord extends RecordModel {
  store?: string
  store_id?: string
  store_name?: string
  file_name: string
  reference_date?: string
  total_linhas: number
  enviado_faturas?: number
  envio_fatura?: number
  pendente?: number
  fatura_paga: number
  sem_contato: number
  promessa_pagto: number
  cancelados: number
  nao_tratados: number
  contato_realizado?: number
  outros?: number
  imported_at?: string
  expand?: {
    store?: StoreRecord
  }
}

export interface ConsolidatedRow {
  storeId: string
  storeName: string
  coordenacao: string
  supervisao: string
  observacao: string
  hasData: boolean
  latestRecordId?: string
  referente?: string
  importadoEm?: string
  totalLinhas: number
  faturaPaga: number
  envioFatura: number
  promessaPagto: number
  semContato: number
  cancelados: number
  pendente: number
  contatoRealizado: number
  outros: number
  naoTratados: number
}

export const DEFAULT_CONSOLIDATED_ROW: Omit<ConsolidatedRow, 'storeId' | 'storeName'> = {
  coordenacao: '',
  supervisao: '',
  observacao: '',
  hasData: false,
  totalLinhas: 0,
  faturaPaga: 0,
  envioFatura: 0,
  promessaPagto: 0,
  semContato: 0,
  cancelados: 0,
  pendente: 0,
  contatoRealizado: 0,
  outros: 0,
  naoTratados: 0,
}

export type FpdStatusKey =
  | 'fatura_paga'
  | 'envio_fatura'
  | 'promessa_pagto'
  | 'sem_contato'
  | 'cancelados'
  | 'pendente'
  | 'contato_realizado'
  | 'outros'
  | 'nao_tratados'

export interface FpdStatusConfig {
  key: FpdStatusKey
  label: string
  shortLabel?: string
  color: string
  textColor: string
  bgTint: string
  borderTint: string
}

export const FPD_STATUSES: FpdStatusConfig[] = [
  {
    key: 'fatura_paga',
    label: 'Fatura(s) Paga(s)',
    color: '#0891B2',
    textColor: '#0E7490',
    bgTint: 'rgba(8, 145, 178, 0.08)',
    borderTint: 'rgba(8, 145, 178, 0.25)',
  },
  {
    key: 'envio_fatura',
    label: 'Enviado Fatura(s)',
    color: '#16A34A',
    textColor: '#15803D',
    bgTint: 'rgba(22, 163, 74, 0.08)',
    borderTint: 'rgba(22, 163, 74, 0.25)',
  },
  {
    key: 'promessa_pagto',
    label: 'Promessa de Pagto.',
    color: '#9333EA',
    textColor: '#7E22CE',
    bgTint: 'rgba(147, 51, 234, 0.08)',
    borderTint: 'rgba(147, 51, 234, 0.25)',
  },
  {
    key: 'sem_contato',
    label: 'Sem Contato',
    color: '#64748B',
    textColor: '#475569',
    bgTint: 'rgba(100, 116, 139, 0.08)',
    borderTint: 'rgba(100, 116, 139, 0.25)',
  },
  {
    key: 'cancelados',
    label: 'Cancelados',
    color: '#DC2626',
    textColor: '#B91C1C',
    bgTint: 'rgba(220, 38, 38, 0.08)',
    borderTint: 'rgba(220, 38, 38, 0.25)',
  },
  {
    key: 'pendente',
    label: 'Pendente',
    color: '#2563EB',
    textColor: '#1D4ED8',
    bgTint: 'rgba(37, 99, 235, 0.08)',
    borderTint: 'rgba(37, 99, 235, 0.25)',
  },
  {
    key: 'contato_realizado',
    label: 'Contato Realizado',
    color: '#0D9488',
    textColor: '#0F766E',
    bgTint: 'rgba(13, 148, 136, 0.08)',
    borderTint: 'rgba(13, 148, 136, 0.25)',
  },
  {
    key: 'outros',
    label: 'Outros Motivos',
    color: '#8B5CF6',
    textColor: '#7C3AED',
    bgTint: 'rgba(139, 92, 246, 0.08)',
    borderTint: 'rgba(139, 92, 246, 0.25)',
  },
  {
    key: 'nao_tratados',
    label: 'Não Tratados',
    color: '#EA580C',
    textColor: '#C2410C',
    bgTint: 'rgba(234, 88, 12, 0.08)',
    borderTint: 'rgba(234, 88, 12, 0.25)',
  },
]
