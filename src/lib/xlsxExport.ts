import * as XLSX from 'xlsx'
import type { ConsolidatedRow } from '@/types/fpd'

export function exportConsolidatedToXlsx(
  rows: ConsolidatedRow[],
  totals: {
    totalLinhas: number
    faturaPaga: number
    envioFatura: number
    contatoRealizado: number
    promessaPagto: number
    semContato: number
    cancelados: number
    naoTratados: number
    outros: number
  },
  referenteLabel?: string,
) {
  // Headers matching the reference template with new status names
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
    'OBSERVAÇÃO',
  ]

  const dataRows = rows.map((r) => [
    r.storeName,
    r.coordenacao || '',
    r.supervisao || '',
    r.hasData ? r.totalLinhas : '',
    r.hasData ? r.faturaPaga : '',
    r.hasData ? r.envioFatura : '',
    r.hasData ? r.contatoRealizado : '',
    r.hasData ? r.promessaPagto : '',
    r.hasData ? r.semContato : '',
    r.hasData ? r.cancelados : '',
    r.hasData ? r.naoTratados : '',
    r.hasData ? r.outros : '',
    r.observacao || '',
  ])

  // Summary totals row
  const totalsRow = [
    'Totais',
    '',
    '',
    totals.totalLinhas,
    totals.faturaPaga,
    totals.envioFatura,
    totals.contatoRealizado,
    totals.promessaPagto,
    totals.semContato,
    totals.cancelados,
    totals.naoTratados,
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
