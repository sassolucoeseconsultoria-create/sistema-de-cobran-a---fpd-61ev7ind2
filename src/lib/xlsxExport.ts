import * as XLSX from 'xlsx'
import type { ConsolidatedRow } from '@/types/fpd'

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
  },
  referenteLabel?: string,
) {
  // Headers matching the 9 FPD columns in exact order
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
