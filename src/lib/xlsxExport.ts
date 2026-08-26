import * as XLSX from 'xlsx'
import type { ConsolidatedRow, ImportedFileRecord } from '@/types/fpd'

export function exportConsolidatedToXlsx(
  rows: ConsolidatedRow[],
  totals: {
    totalLinhas: number
    envioFatura: number
    pendente: number
    faturaPaga: number
    enviaFatura: number
    semContato: number
    promessaPagto: number
    cancelados: number
    naoTratados: number
    contatoRealizado: number
    outros: number
  },
  referenteLabel?: string,
) {
  // Headers matching the 10 FPD columns in exact order
  const headers = [
    'LOJAS',
    'COORDENAÇÃO',
    'SUPERVISÃO',
    'TOTAL LINHAS',
    'Enviado Fatura(s)',
    'Pendente',
    'Fatura(s) Paga(s)',
    'Envia Fatura(s)',
    'Sem Contato',
    'Promessa de Pagto.',
    'Cancelados',
    'Não Tratados',
    'Contato Realizado',
    'Outros Motivos',
    'OBSERVAÇÃO',
  ]

  const dataRows = rows.map((r) => [
    r.storeName,
    r.coordenacao || '',
    r.supervisao || '',
    r.hasData ? r.totalLinhas : '',
    r.hasData ? r.envioFatura : '',
    r.hasData ? r.pendente : '',
    r.hasData ? r.faturaPaga : '',
    r.hasData ? r.enviaFatura : '',
    r.hasData ? r.semContato : '',
    r.hasData ? r.promessaPagto : '',
    r.hasData ? r.cancelados : '',
    r.hasData ? r.naoTratados : '',
    r.hasData ? r.contatoRealizado : '',
    r.hasData ? r.outros : '',
    r.observacao || '',
  ])

  // Summary totals row
  const totalsRow = [
    'Totais',
    '',
    '',
    totals.totalLinhas,
    totals.envioFatura,
    totals.pendente,
    totals.faturaPaga,
    totals.enviaFatura,
    totals.semContato,
    totals.promessaPagto,
    totals.cancelados,
    totals.naoTratados,
    totals.contatoRealizado,
    totals.outros,
    '',
  ]

  const wsData = [headers, ...dataRows, totalsRow]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 32 }, // LOJAS
    { wch: 18 }, // COORDENACAO
    { wch: 18 }, // SUPERVISAO
    { wch: 15 }, // TOTAL LINHAS
    { wch: 20 }, // Enviado Fatura(s)
    { wch: 15 }, // Pendente
    { wch: 18 }, // Fatura(s) Paga(s)
    { wch: 18 }, // Envia Fatura(s)
    { wch: 16 }, // Sem Contato
    { wch: 20 }, // Promessa de Pagto.
    { wch: 15 }, // Cancelados
    { wch: 16 }, // Não Tratados
    { wch: 18 }, // Contato Realizado
    { wch: 18 }, // Outros Motivos
    { wch: 30 }, // OBSERVACAO
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
    envioFatura: number
    pendente: number
    faturaPaga: number
    enviaFatura: number
    semContato: number
    promessaPagto: number
    cancelados: number
    naoTratados: number
    contatoRealizado: number
    outros: number
  },
) {
  const headers = [
    'DATA / HORA',
    'LOJA',
    'NOME DO ARQUIVO',
    'DATA REF.',
    'TOTAL LINHAS',
    'Enviado Fatura(s)',
    'Pendente',
    'Fatura(s) Paga(s)',
    'Envia Fatura(s)',
    'Sem Contato',
    'Promessa de Pagto.',
    'Cancelados',
    'Não Tratados',
    'Contato Realizado',
    'Outros Motivos',
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
      enviado,
      f.pendente || 0,
      f.fatura_paga || 0,
      f.envia_fatura || 0,
      f.sem_contato || 0,
      f.promessa_pagto || 0,
      f.cancelados || 0,
      f.nao_tratados || 0,
      f.contato_realizado || 0,
      f.outros || 0,
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
      totals.envioFatura,
      totals.pendente,
      totals.faturaPaga,
      totals.enviaFatura,
      totals.semContato,
      totals.promessaPagto,
      totals.cancelados,
      totals.naoTratados,
      totals.contatoRealizado,
      totals.outros,
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
    { wch: 20 }, // Enviado Fatura(s)
    { wch: 15 }, // Pendente
    { wch: 18 }, // Fatura(s) Paga(s)
    { wch: 18 }, // Envia Fatura(s)
    { wch: 16 }, // Sem Contato
    { wch: 20 }, // Promessa de Pagto.
    { wch: 15 }, // Cancelados
    { wch: 16 }, // Não Tratados
    { wch: 18 }, // Contato Realizado
    { wch: 18 }, // Outros Motivos
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
