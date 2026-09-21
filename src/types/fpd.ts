import type { RecordModel } from 'pocketbase'

export type AnalyticColumnType = 'texto' | 'numero' | 'data'
export type AnalyticColumnSheet = 'Móvel' | 'Residencial' | 'Ambas'

export interface AnalyticLayoutColumn {
  nome: string
  tipo: AnalyticColumnType
  aba: AnalyticColumnSheet
}

export interface AnalyticLayoutRecord extends RecordModel {
  nome: string
  descricao?: string
  colunas: AnalyticLayoutColumn[]
}

export interface AnalyticRowRecord extends RecordModel {
  layout_id: string
  origem: string
  aba: string
  numero_linha: number
  valores: Record<string, string | number | null>
  expand?: {
    layout_id?: AnalyticLayoutRecord
  }
}

export type RelacionamentoAba = 'Móvel' | 'Residencial'

export const OCORRENCIAS_OPTIONS = [
  'Fatura(s) Paga(s)',
  'Não Tratados',
  'Pendente',
  'Enviado Fatura(s)',
  'Sem Contato',
  'Promessa de Pagto.',
  'Cancelados',
  'Contato Realizado',
] as const
export type OcorrenciaType = (typeof OCORRENCIAS_OPTIONS)[number]

export interface MovelRecord extends RecordModel {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  data_referencia?: string
}

export interface ResidencialRecord extends RecordModel {
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>

  // Colunas tipadas residenciais
  nr_ano_mes?: string
  data_instalacao?: string
  nm_mercado?: string
  nm_marca?: string
  cod_municipio?: string
  canal?: string
  produto_atual?: string
  nm_indicador_negocio?: string
  nm_tipo_ass_domicilio?: string
  uf?: string
  nm_visao_analise?: string
  nm_linha_negocio?: string
  nm_cidade?: string
  nm_bairro?: string
  parceiro_resumido?: string
  cod_amx?: string
  coordenador?: string
  executivo?: string
  nr_contrato?: string
  dsc_status_contrato?: string
  dat_vencimento?: string
  dat_pagamento?: string
  vlr_total?: string
  vlr_pago?: string
  vlr_aberto?: string
  nm_forma_pagamento?: string
  nr_cep?: string
  qtde_instalada?: string
  fatura?: string
  devendo?: string
  data_relatorio?: string
  qtd_dias_pag_x_venc?: string
  indicador?: string
  pago?: string
  preventiva_fpd?: string
  virou_fpd?: string
  nao_vencidas?: string
  indefinido?: string
  desprezar?: string
  qtd_dias_venc_x_data_atual?: string
  canal_2?: string
  bcc_tipo_rede?: string
  coordenador_2?: string
  cpf?: string
  fone?: string
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  data_referencia?: string
}

export interface UnifiedAnalyticRecord extends RecordModel {
  aba: RelacionamentoAba
  arquivo?: string
  linha?: number
  loja?: string
  vendedor?: string
  cliente?: string
  dados?: Record<string, unknown>
  ocorrencias?: string
  data_promessa_de_pagto?: string
  comentarios?: string
  data_referencia?: string
}
export interface RelacionamentoRecord extends RecordModel {
  aba: RelacionamentoAba
  loja?: string
  arquivo?: string
  linha?: number
  dados?: Record<string, unknown>
}

export interface StoreRecord extends RecordModel {
  name: string
  coordenacao?: string
  supervisao?: string
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

export interface ConsolidatedComparisonRow {
  storeId: string
  storeName: string
  coordenacao: string
  supervisao: string
  hasDataPrimary: boolean
  hasDataCompared: boolean
  isNewInPrimary: boolean // exists in primary but not compared
  isMissingInPrimary: boolean // exists in compared but not primary
  primary: ConsolidatedRow
  compared: ConsolidatedRow
  diff: {
    totalLinhas: number
    faturaPaga: number
    envioFatura: number
    promessaPagto: number
    semContato: number
    cancelados: number
    pendente: number
    contatoRealizado: number
    naoTratados: number
    totalOcorrencias: number // soma das ocorrências ou totalLinhas
  }
}

export const DEFAULT_CONSOLIDATED_ROW: Omit<ConsolidatedRow, 'storeId' | 'storeName'> = {
  coordenacao: '',
  supervisao: '',
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

export interface VendorConsolidationRecord extends RecordModel {
  vendedor: string
  loja?: string
  supervisao?: string
  data_referencia?: string
  total_linhas: number
  fatura_paga: number
  envio_fatura: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  pendente: number
  contato_realizado: number
  outros: number
  nao_tratados: number
}

export interface VendorRow {
  id?: string
  vendedor: string
  loja: string
  supervisao: string
  dataReferencia?: string
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

export interface ParsedVendorLine {
  vendedor: string
  loja: string
  status: FpdStatusKey
  quantidade: number
}

export type FpdStatusKey =
  | 'fatura_paga'
  | 'envio_fatura'
  | 'promessa_pagto'
  | 'sem_contato'
  | 'cancelados'
  | 'pendente'
  | 'contato_realizado'
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
    key: 'nao_tratados',
    label: 'Não Tratados',
    color: '#EA580C',
    textColor: '#C2410C',
    bgTint: 'rgba(234, 88, 12, 0.08)',
    borderTint: 'rgba(234, 88, 12, 0.25)',
  },
  {
    key: 'pendente',
    label: 'Pendente',
    color: '#DC2626',
    textColor: '#B91C1C',
    bgTint: 'rgba(220, 38, 38, 0.08)',
    borderTint: 'rgba(220, 38, 38, 0.25)',
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
    color: '#0F172A',
    textColor: '#0F172A',
    bgTint: 'rgba(15, 23, 42, 0.08)',
    borderTint: 'rgba(15, 23, 42, 0.25)',
  },
  {
    key: 'contato_realizado',
    label: 'Contato Realizado',
    color: '#0D9488',
    textColor: '#0F766E',
    bgTint: 'rgba(13, 148, 136, 0.08)',
    borderTint: 'rgba(13, 148, 136, 0.25)',
  },
]

export interface ReferenceDatePermissionRecord {
  id: string
  collectionId: string
  collectionName: string
  referente: string
  gerente?: boolean
  supervisor?: boolean
  coordenador?: boolean
  created: string
  updated: string
  [key: string]: unknown
}

export type FaixaAtrasoMensagem = '>15 dias' | '16 a 30 dias' | '>30 dias'

export const FAIXAS_ATRASO_MENSAGEM: readonly FaixaAtrasoMensagem[] = [
  '>15 dias',
  '16 a 30 dias',
  '>30 dias',
] as const

export interface MensagemClienteRecord {
  id: string
  collectionId: string
  collectionName: string
  ordem: number
  texto: string
  faixa_atraso: FaixaAtrasoMensagem
  created: string
  updated: string
  [key: string]: unknown
}
