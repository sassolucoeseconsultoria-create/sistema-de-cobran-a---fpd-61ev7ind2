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
  fatura_paga: number
  envio_fatura: number
  contato_realizado: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  nao_tratados: number
  outros: number
  importado_em: string
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
  contatoRealizado: number
  promessaPagto: number
  semContato: number
  cancelados: number
  naoTratados: number
  outros: number
}

export type FpdStatusKey =
  | 'fatura_paga'
  | 'envio_fatura'
  | 'contato_realizado'
  | 'promessa_pagto'
  | 'sem_contato'
  | 'cancelados'
  | 'nao_tratados'
  | 'outros'

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
    label: 'Enviado Fatura(s)',
    color: '#16A34A',
    textColor: '#15803D',
    bgTint: 'rgba(22, 163, 74, 0.08)',
    borderTint: 'rgba(22, 163, 74, 0.25)',
  },
  {
    key: 'envio_fatura',
    label: 'Pendente',
    color: '#2563EB',
    textColor: '#1D4ED8',
    bgTint: 'rgba(37, 99, 235, 0.08)',
    borderTint: 'rgba(37, 99, 235, 0.25)',
  },
  {
    key: 'contato_realizado',
    label: 'Fatura(s) Paga(s)',
    color: '#0891B2',
    textColor: '#0E7490',
    bgTint: 'rgba(8, 145, 178, 0.08)',
    borderTint: 'rgba(8, 145, 178, 0.25)',
  },
  {
    key: 'promessa_pagto',
    label: 'Envia Fatura(s)',
    color: '#D97706',
    textColor: '#B45309',
    bgTint: 'rgba(217, 119, 6, 0.08)',
    borderTint: 'rgba(217, 119, 6, 0.25)',
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
    label: 'Promessa de Pagto.',
    color: '#DC2626',
    textColor: '#B91C1C',
    bgTint: 'rgba(220, 38, 38, 0.08)',
    borderTint: 'rgba(220, 38, 38, 0.25)',
  },
  {
    key: 'nao_tratados',
    label: 'Cancelados',
    color: '#EA580C',
    textColor: '#C2410C',
    bgTint: 'rgba(234, 88, 12, 0.08)',
    borderTint: 'rgba(234, 88, 12, 0.25)',
  },
  {
    key: 'outros',
    label: 'Não Tratados',
    color: '#7C3AED',
    textColor: '#6D28D9',
    bgTint: 'rgba(124, 58, 237, 0.08)',
    borderTint: 'rgba(124, 58, 237, 0.25)',
  },
]
