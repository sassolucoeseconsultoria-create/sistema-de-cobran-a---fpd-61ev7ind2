import * as XLSX from 'xlsx'
import type { ConsolidatedRow, ImportedFileRecord } from '@/types/fpd'

export function exportVendorsToXlsx(
  rows: Array<{
    vendedor: string
    loja: string
    supervisao: string
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
  }>,
  totals: {
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
  },
  referenteLabel?: string,
  options?: { sheetName?: string; filePrefix?: string },
) {
  const headers = [
    'POSIÇÃO',
    'VENDEDOR',
    'LOJA',
    'SUPERVISÃO',
    'TOTAL LINHAS',
    'Fatura(s) Paga(s)',
    'Enviado Fatura(s)',
    'Promessa de Pagto.',
    'Sem Contato',
    'Cancelados',
    'Pendente',
    'Contato Realizado',
    'Outros Motivos',
    'Não Tratados',
  ]

  const dataRows = rows.map((r, idx) => [
    `#${idx + 1}`,
    r.vendedor,
    r.loja || '',
    r.supervisao || '',
    r.totalLinhas,
    r.faturaPaga,
    r.envioFatura,
    r.promessaPagto,
    r.semContato,
    r.cancelados,
    r.pendente,
    r.contatoRealizado,
    r.outros,
    r.naoTratados,
  ])

  const totalsRow = [
    'Totais',
    '',
    '',
    '',
    totals.totalLinhas,
    totals.faturaPaga,
    totals.envioFatura,
    totals.promessaPagto,
    totals.semContato,
    totals.cancelados,
    totals.pendente,
    totals.contatoRealizado,
    totals.outros,
    totals.naoTratados,
  ]

  const wsData = [headers, ...dataRows, totalsRow]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [
    { wch: 10 }, // POSICAO
    { wch: 30 }, // VENDEDOR
    { wch: 25 }, // LOJA
    { wch: 20 }, // SUPERVISAO
    { wch: 15 }, // TOTAL LINHAS
    { wch: 18 }, // Fatura(s) Paga(s)
    { wch: 20 }, // Enviado Fatura(s)
    { wch: 20 }, // Promessa de Pagto.
    { wch: 16 }, // Sem Contato
    { wch: 15 }, // Cancelados
    { wch: 15 }, // Pendente
    { wch: 18 }, // Contato Realizado
    { wch: 18 }, // Outros Motivos
    { wch: 16 }, // Não Tratados
  ]

  const wb = XLSX.utils.book_new()
  const sheetName = options?.sheetName || 'Ranking_Vendedores'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const dateSlug = (referenteLabel || 'Consolidado')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
  const prefix = options?.filePrefix || 'Ranking_Vendedores_FPD'
  const filename = `${prefix}_${dateSlug}.xlsx`

  XLSX.writeFile(wb, filename)
}

export function exportConsolidatedToXlsx(
  rows: ConsolidatedRow[],
  totals: {
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
  },
  referenteLabel?: string,
) {
  // Headers matching the 9 FPD columns in exact order
  const headers = [
    'LOJAS',
    'COORDENAÇÃO',
    'SUPERVISÃO',
    'TOTAL LINHAS',
    'Fatura(s) Paga(s)',
    'Enviado Fatura(s)',
    'Promessa de Pagto.',
    'Sem Contato',
    'Cancelados',
    'Pendente',
    'Contato Realizado',
    'Outros Motivos',
    'Não Tratados',
  ]

  const dataRows = rows.map((r) => [
    r.storeName,
    r.coordenacao || '',
    r.supervisao || '',
    r.hasData ? r.totalLinhas : '',
    r.hasData ? r.faturaPaga : '',
    r.hasData ? r.envioFatura : '',
    r.hasData ? r.promessaPagto : '',
    r.hasData ? r.semContato : '',
    r.hasData ? r.cancelados : '',
    r.hasData ? r.pendente : '',
    r.hasData ? r.contatoRealizado : '',
    r.hasData ? r.outros : '',
    r.hasData ? r.naoTratados : '',
  ])

  // Summary totals row
  const totalsRow = [
    'Totais',
    '',
    '',
    totals.totalLinhas,
    totals.faturaPaga,
    totals.envioFatura,
    totals.promessaPagto,
    totals.semContato,
    totals.cancelados,
    totals.pendente,
    totals.contatoRealizado,
    totals.outros,
    totals.naoTratados,
  ]

  const wsData = [headers, ...dataRows, totalsRow]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 32 }, // LOJAS
    { wch: 18 }, // COORDENACAO
    { wch: 18 }, // SUPERVISAO
    { wch: 15 }, // TOTAL LINHAS
    { wch: 18 }, // Fatura(s) Paga(s)
    { wch: 20 }, // Enviado Fatura(s)
    { wch: 20 }, // Promessa de Pagto.
    { wch: 16 }, // Sem Contato
    { wch: 15 }, // Cancelados
    { wch: 15 }, // Pendente
    { wch: 18 }, // Contato Realizado
    { wch: 18 }, // Outros Motivos
    { wch: 16 }, // Não Tratados
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1')

  const dateSlug = (referenteLabel || 'Consolidado')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
  const filename = `Consolidado_FPD_${dateSlug}.xlsx`

  XLSX.writeFile(wb, filename)
}

export function exportImportedFilesToXlsx(
  files: ImportedFileRecord[],
  totals?: {
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
  },
) {
  const headers = [
    'DATA / HORA',
    'LOJA',
    'NOME DO ARQUIVO',
    'DATA REF.',
    'TOTAL LINHAS',
    'Fatura(s) Paga(s)',
    'Enviado Fatura(s)',
    'Promessa de Pagto.',
    'Sem Contato',
    'Cancelados',
    'Pendente',
    'Contato Realizado',
    'Outros Motivos',
    'Não Tratados',
  ]

  const dataRows = files.map((f) => {
    const storeName = f.expand?.store?.name || f.store_name || 'Loja'
    const dateFormatted =
      f.imported_at || f.created ? new Date(f.imported_at || f.created).toLocaleString('pt-BR') : ''
    const enviado = f.enviado_faturas !== undefined ? f.enviado_faturas : f.envio_fatura || 0

    return [
      dateFormatted,
      storeName,
      f.file_name,
      f.reference_date || '',
      f.total_linhas || 0,
      f.fatura_paga || 0,
      enviado,
      f.promessa_pagto || 0,
      f.sem_contato || 0,
      f.cancelados || 0,
      f.pendente || 0,
      f.contato_realizado || 0,
      f.outros || 0,
      f.nao_tratados || 0,
    ]
  })

  let wsData = [headers, ...dataRows]

  if (totals) {
    const totalsRow = [
      'Totais',
      '',
      '',
      '',
      totals.totalLinhas,
      totals.faturaPaga,
      totals.envioFatura,
      totals.promessaPagto,
      totals.semContato,
      totals.cancelados,
      totals.pendente,
      totals.contatoRealizado,
      totals.outros,
      totals.naoTratados,
    ]
    wsData = [...wsData, totalsRow]
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [
    { wch: 20 }, // DATA / HORA
    { wch: 30 }, // LOJA
    { wch: 35 }, // NOME DO ARQUIVO
    { wch: 15 }, // DATA REF
    { wch: 15 }, // TOTAL LINHAS
    { wch: 18 }, // Fatura(s) Paga(s)
    { wch: 20 }, // Enviado Fatura(s)
    { wch: 20 }, // Promessa de Pagto.
    { wch: 16 }, // Sem Contato
    { wch: 15 }, // Cancelados
    { wch: 15 }, // Pendente
    { wch: 18 }, // Contato Realizado
    { wch: 18 }, // Outros Motivos
    { wch: 16 }, // Não Tratados
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Arquivos_Importados')

  const now = new Date()
  const d = String(now.getDate()).padStart(2, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const y = now.getFullYear()
  const filename = `Arquivos_Importados_FPD_${d}_${m}_${y}.xlsx`

  XLSX.writeFile(wb, filename)
}
