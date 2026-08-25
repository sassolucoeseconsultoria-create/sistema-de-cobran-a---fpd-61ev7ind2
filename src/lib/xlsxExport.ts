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
  // Headers matching the reference template exactly
  const headers = [
    'LOJAS',
    'COORDENAÇÃO',
    'SUPERVISÃO',
    'TOTAL LINHAS',
    'FATURA PAGA',
    'ENVIO FATURA',
    'CONTATO REALIZADO',
    'PROMESSA PAGTO.',
    'SEM CONTATO',
    'CANCELADOS',
    'NÃO TRATADOS',
    'OUTROS',
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
    { wch: 15 }, // FATURA PAGA
    { wch: 15 }, // ENVIO FATURA
    { wch: 20 }, // CONTATO REALIZADO
    { wch: 18 }, // PROMESSA PAGTO.
    { wch: 15 }, // SEM CONTATO
    { wch: 15 }, // CANCELADOS
    { wch: 16 }, // NAO TRATADOS
    { wch: 12 }, // OUTROS
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
