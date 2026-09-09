import type {
  ConsolidatedRow,
  ConsolidatedComparisonRow,
  FpdRecord,
  StoreRecord,
} from '@/types/fpd'

export interface ConsolidatedTotals {
  totalLinhas: number
  envioFatura: number
  pendente: number
  faturaPaga: number
  semContato: number
  promessaPagto: number
  cancelados: number
  naoTratados: number
  contatoRealizado: number
  outros: number
}

export function createEmptyConsolidatedRow(store: StoreRecord): ConsolidatedRow {
  return {
    storeId: store.id,
    storeName: store.name,
    coordenacao: store.coordenacao || '',
    supervisao: store.supervisao || '',
    hasData: false,
    totalLinhas: 0,
    envioFatura: 0,
    pendente: 0,
    faturaPaga: 0,
    semContato: 0,
    promessaPagto: 0,
    cancelados: 0,
    naoTratados: 0,
    contatoRealizado: 0,
    outros: 0,
  }
}

export function buildConsolidatedRow(
  store: StoreRecord,
  records: FpdRecord[],
  referenceFilter: string,
): ConsolidatedRow {
  const storeRecords = records.filter((r) => {
    if (r.store !== store.id) return false
    if (referenceFilter === 'all') return true
    if (referenceFilter === 'none') {
      return !r.referente || r.referente.trim() === ''
    }
    return r.referente === referenceFilter
  })

  const latest = storeRecords[0]
  if (!latest) {
    return createEmptyConsolidatedRow(store)
  }

  return {
    storeId: store.id,
    storeName: store.name,
    coordenacao: store.coordenacao || '',
    supervisao: store.supervisao || '',
    hasData: true,
    latestRecordId: latest.id,
    referente: latest.referente,
    importadoEm: latest.importado_em || latest.created,
    totalLinhas: latest.total_linhas || 0,
    envioFatura: latest.envio_fatura || 0,
    pendente: latest.pendente || 0,
    faturaPaga: latest.fatura_paga || 0,
    semContato: latest.sem_contato || 0,
    promessaPagto: latest.promessa_pagto || 0,
    cancelados: latest.cancelados || 0,
    naoTratados: latest.nao_tratados || 0,
    contatoRealizado: latest.contato_realizado || 0,
    outros: latest.outros || 0,
  }
}

/**
 * Total de ocorrências de uma linha:
 * Fatura Paga + Enviado Fatura + Promessa + Sem Contato + Cancelados + Pendente + Contato Realizado + Não Tratados
 */
export function calculateOcorrenciasTotal(row: ConsolidatedRow): number {
  return (
    row.faturaPaga +
    row.envioFatura +
    row.promessaPagto +
    row.semContato +
    row.cancelados +
    row.pendente +
    row.contatoRealizado +
    row.naoTratados
  )
}

/**
 * Constrói as linhas de comparação entre duas referências para uma lista de lojas acessíveis.
 */
export function buildComparisonRows(
  stores: StoreRecord[],
  records: FpdRecord[],
  primaryDate: string,
  comparedDate: string,
): ConsolidatedComparisonRow[] {
  return stores.map((store) => {
    const primary = buildConsolidatedRow(store, records, primaryDate)
    const compared = buildConsolidatedRow(store, records, comparedDate)

    const hasDataPrimary = primary.hasData
    const hasDataCompared = compared.hasData
    const isNewInPrimary = hasDataPrimary && !hasDataCompared
    const isMissingInPrimary = !hasDataPrimary && hasDataCompared

    const diff = {
      totalLinhas:
        (hasDataPrimary ? primary.totalLinhas : 0) - (hasDataCompared ? compared.totalLinhas : 0),
      faturaPaga:
        (hasDataPrimary ? primary.faturaPaga : 0) - (hasDataCompared ? compared.faturaPaga : 0),
      envioFatura:
        (hasDataPrimary ? primary.envioFatura : 0) - (hasDataCompared ? compared.envioFatura : 0),
      promessaPagto:
        (hasDataPrimary ? primary.promessaPagto : 0) -
        (hasDataCompared ? compared.promessaPagto : 0),
      semContato:
        (hasDataPrimary ? primary.semContato : 0) - (hasDataCompared ? compared.semContato : 0),
      cancelados:
        (hasDataPrimary ? primary.cancelados : 0) - (hasDataCompared ? compared.cancelados : 0),
      pendente: (hasDataPrimary ? primary.pendente : 0) - (hasDataCompared ? compared.pendente : 0),
      contatoRealizado:
        (hasDataPrimary ? primary.contatoRealizado : 0) -
        (hasDataCompared ? compared.contatoRealizado : 0),
      naoTratados:
        (hasDataPrimary ? primary.naoTratados : 0) - (hasDataCompared ? compared.naoTratados : 0),
      totalOcorrencias:
        (hasDataPrimary ? calculateOcorrenciasTotal(primary) : 0) -
        (hasDataCompared ? calculateOcorrenciasTotal(compared) : 0),
    }

    return {
      storeId: store.id,
      storeName: store.name,
      coordenacao: store.coordenacao || '',
      supervisao: store.supervisao || '',
      hasDataPrimary,
      hasDataCompared,
      isNewInPrimary,
      isMissingInPrimary,
      primary,
      compared,
      diff,
    }
  })
}

export interface ComparisonSummary {
  primaryDate: string
  comparedDate: string
  totalPrimaryLinhas: number
  totalComparedLinhas: number
  diffLinhas: number
  storeWithHighestIncrease: {
    storeName: string
    diff: number
  } | null
  storeWithHighestDecrease: {
    storeName: string
    diff: number
  } | null
}

export function computeComparisonSummary(
  comparisonRows: ConsolidatedComparisonRow[],
  primaryDate: string,
  comparedDate: string,
): ComparisonSummary {
  let totalPrimary = 0
  let totalCompared = 0

  let highestIncrease: { storeName: string; diff: number } | null = null
  let highestDecrease: { storeName: string; diff: number } | null = null

  for (const row of comparisonRows) {
    if (row.hasDataPrimary) totalPrimary += row.primary.totalLinhas
    if (row.hasDataCompared) totalCompared += row.compared.totalLinhas

    // Considera apenas se a loja tiver dados em ao menos uma referência
    if (row.hasDataPrimary || row.hasDataCompared) {
      // Usamos a variação de totalLinhas (ou total de ocorrências) para o destaque
      const diffVal = row.diff.totalLinhas

      if (diffVal > 0) {
        if (!highestIncrease || diffVal > highestIncrease.diff) {
          highestIncrease = { storeName: row.storeName, diff: diffVal }
        }
      } else if (diffVal < 0) {
        if (!highestDecrease || diffVal < highestDecrease.diff) {
          highestDecrease = { storeName: row.storeName, diff: diffVal }
        }
      }
    }
  }

  return {
    primaryDate,
    comparedDate,
    totalPrimaryLinhas: totalPrimary,
    totalComparedLinhas: totalCompared,
    diffLinhas: totalPrimary - totalCompared,
    storeWithHighestIncrease: highestIncrease,
    storeWithHighestDecrease: highestDecrease,
  }
}
