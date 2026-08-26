import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  classifyRow,
  isHeaderOrTotalRow,
  normalizeText,
  columnLetterToIndex,
  extractRowQuantity,
  parseWorksheet,
} from './xlsxParser'

describe('normalizeText', () => {
  it('should remove accents and normalize spaces and lowercase', () => {
    expect(normalizeText('  FATURA  PAGA  ')).toBe('fatura paga')
    expect(normalizeText('NÃO TRATADO')).toBe('nao tratado')
    expect(normalizeText('Boleto_Pago\n')).toBe('boleto pago')
  })
})

describe('classifyRow', () => {
  it('should accurately classify variations of "Enviado Fatura(s)" (envio_fatura)', () => {
    expect(classifyRow('enviado fatura')).toBe('envio_fatura')
    expect(classifyRow('enviado fatura(s)')).toBe('envio_fatura')
    expect(classifyRow('envio fatura')).toBe('envio_fatura')
    expect(classifyRow('fatura enviada')).toBe('envio_fatura')
    expect(classifyRow('env fatura')).toBe('envio_fatura')
    expect(classifyRow('envio de fatura')).toBe('envio_fatura')
    expect(classifyRow('envio da fatura por whatsapp')).toBe('envio_fatura')
    expect(classifyRow('enviado')).toBe('envio_fatura')
    expect(classifyRow('enviada')).toBe('envio_fatura')
    expect(classifyRow('fatura reenviada')).toBe('envio_fatura')
    expect(classifyRow('reencaminhado')).toBe('envio_fatura')
    expect(classifyRow('2 via')).toBe('envio_fatura')
    expect(classifyRow('2 via enviada')).toBe('envio_fatura')
    expect(classifyRow('segunda via')).toBe('envio_fatura')
    expect(classifyRow('reenvio')).toBe('envio_fatura')
    expect(classifyRow('enviado boleto')).toBe('envio_fatura')
    expect(classifyRow('boleto enviado')).toBe('envio_fatura')
  })

  it('should accurately classify variations of "Pendente" (pendente)', () => {
    expect(classifyRow('pendente')).toBe('pendente')
    expect(classifyRow('em analise')).toBe('pendente')
    expect(classifyRow('em andamento')).toBe('pendente')
    expect(classifyRow('em tratativa')).toBe('pendente')
    expect(classifyRow('aguardando retorno')).toBe('pendente')
  })

  it('should accurately classify variations of "Fatura(s) Paga(s)" (fatura_paga)', () => {
    expect(classifyRow('fatura paga')).toBe('fatura_paga')
    expect(classifyRow('faturas pagas')).toBe('fatura_paga')
    expect(classifyRow('pago')).toBe('fatura_paga')
    expect(classifyRow('paga')).toBe('fatura_paga')
    expect(classifyRow('fatura paga pelo cliente')).toBe('fatura_paga')
    expect(classifyRow('boleto pago')).toBe('fatura_paga')
    expect(classifyRow('pg')).toBe('fatura_paga')
    expect(classifyRow('fatura pg')).toBe('fatura_paga')
    expect(classifyRow('pagamento efetuado')).toBe('fatura_paga')
    expect(classifyRow('cliente já quitou / quitado')).toBe('fatura_paga')
    expect(classifyRow('liquidado')).toBe('fatura_paga')
    expect(classifyRow('debito pago')).toBe('fatura_paga')
    expect(classifyRow('ja pago')).toBe('fatura_paga')
  })

  it('should distinguish "Envia Fatura(s)" (envia_fatura) from "Enviado Fatura(s)" (envio_fatura) without overlap', () => {
    expect(classifyRow('envia fatura')).toBe('envia_fatura')
    expect(classifyRow('enviar fatura')).toBe('envia_fatura')
    expect(classifyRow('precisa enviar')).toBe('envia_fatura')
    expect(classifyRow('a enviar')).toBe('envia_fatura')
    expect(classifyRow('a enviar fatura')).toBe('envia_fatura')
    expect(classifyRow('reenviar fatura')).toBe('envia_fatura')
    expect(classifyRow('mandar fatura')).toBe('envia_fatura')
    expect(classifyRow('solicitou envio')).toBe('envia_fatura')
    expect(classifyRow('solicitou envio de fatura')).toBe('envia_fatura')
    expect(classifyRow('enviar boleto')).toBe('envia_fatura')
    expect(classifyRow('enviar codigo de barras')).toBe('envia_fatura')
    expect(classifyRow('enviar pix')).toBe('envia_fatura')

    // Contrast explicitly:
    expect(classifyRow('enviado fatura')).toBe('envio_fatura')
    expect(classifyRow('enviar fatura')).toBe('envia_fatura')
    expect(classifyRow('fatura enviada')).toBe('envio_fatura')
    expect(classifyRow('envia fatura')).toBe('envia_fatura')
  })

  it('should classify "Sem Contato" (sem_contato)', () => {
    expect(classifyRow('sem contato')).toBe('sem_contato')
    expect(classifyRow('caixa postal')).toBe('sem_contato')
    expect(classifyRow('nao atende')).toBe('sem_contato')
    expect(classifyRow('numero ocupado')).toBe('sem_contato')
    expect(classifyRow('telefone incorreto')).toBe('sem_contato')
    expect(classifyRow('numero invalido')).toBe('sem_contato')
    expect(classifyRow('desligado')).toBe('sem_contato')
  })

  it('should classify "Promessa de Pagto." (promessa_pagto) strictly and avoid over-matching', () => {
    expect(classifyRow('promessa de pagamento')).toBe('promessa_pagto')
    expect(classifyRow('promessa de pagto para 25/08')).toBe('promessa_pagto')
    expect(classifyRow('promessa pagto')).toBe('promessa_pagto')
    expect(classifyRow('promessa pgto')).toBe('promessa_pagto')
    expect(classifyRow('prometeu pagar amanha')).toBe('promessa_pagto')
    expect(classifyRow('promete pagar')).toBe('promessa_pagto')
    expect(classifyRow('vai pagar')).toBe('promessa_pagto')
    expect(classifyRow('ira pagar na sexta')).toBe('promessa_pagto')
    expect(classifyRow('combinou pagamento')).toBe('promessa_pagto')
    expect(classifyRow('combinou pagto')).toBe('promessa_pagto')
    expect(classifyRow('pp')).toBe('promessa_pagto')

    // Words that should NOT trigger promessa_pagto on their own:
    expect(classifyRow('pagamento efetuado')).toBe('fatura_paga')
    expect(classifyRow('pagamento realizado')).toBe('fatura_paga')
    expect(classifyRow('solicitou informacao de pagamento')).toBe('nao_tratados')
    expect(classifyRow('aguardando analise de pagamento')).toBe('pendente')
  })

  it('should classify "Cancelados" (cancelados)', () => {
    expect(classifyRow('pedido cancelado')).toBe('cancelados')
    expect(classifyRow('cancelamento')).toBe('cancelados')
    expect(classifyRow('fraude confirmada')).toBe('cancelados')
    expect(classifyRow('desistencia do cliente')).toBe('cancelados')
    expect(classifyRow('devolucao')).toBe('cancelados')
    expect(classifyRow('portabilidade')).toBe('cancelados')
  })

  it('should classify "Contato Realizado" (contato_realizado)', () => {
    expect(classifyRow('contato realizado')).toBe('contato_realizado')
    expect(classifyRow('contato efetuado')).toBe('contato_realizado')
    expect(classifyRow('fez contato')).toBe('contato_realizado')
    expect(classifyRow('contactado')).toBe('contato_realizado')
    expect(classifyRow('contatado')).toBe('contato_realizado')
    expect(classifyRow('cliente atendido')).toBe('contato_realizado')
    expect(classifyRow('falou com cliente')).toBe('contato_realizado')
    expect(classifyRow('contato ok')).toBe('contato_realizado')
  })

  it('should classify "Não Tratados" (nao_tratados)', () => {
    expect(classifyRow('nao tratado')).toBe('nao_tratados')
    expect(classifyRow('naotratad')).toBe('nao_tratados')
    expect(classifyRow('nao trabalhad')).toBe('nao_tratados')
    expect(classifyRow('a tratar')).toBe('nao_tratados')
    expect(classifyRow('aguardando')).toBe('nao_tratados')
    expect(classifyRow('sem status')).toBe('nao_tratados')
    expect(classifyRow('em branco')).toBe('nao_tratados')
    expect(classifyRow('algum texto desconhecido')).toBe('nao_tratados')
  })
})

describe('isHeaderOrTotalRow', () => {
  it('should identify header rows without discarding data rows', () => {
    // Header row
    expect(isHeaderOrTotalRow(['LOJA', 'CLIENTE', 'STATUS', 'MOTIVO', 'TELEFONE', 'DATA'])).toBe(
      true,
    )

    // Data row with customer name and status "FATURA PAGA"
    expect(
      isHeaderOrTotalRow([
        'LOJA CENTRO',
        'MARIA DA SILVA',
        'FATURA PAGA',
        'PAGOU NO BANCO',
        '61999999999',
      ]),
    ).toBe(false)

    // Data row with customer and status "ENVIADO FATURA(S)"
    expect(
      isHeaderOrTotalRow([
        'LOJA NORTE',
        'JOAO PEREIRA',
        'ENVIADO FATURA(S)',
        'CLIENTE RECEBEU VIA WHATSAPP',
        '61988888888',
      ]),
    ).toBe(false)

    // Data row with customer and status "ENVIA FATURA"
    expect(
      isHeaderOrTotalRow([
        'LOJA SUL',
        'ANA SOUZA',
        'ENVIA FATURA',
        'PENDENTE DE ENVIO',
        '61977777777',
      ]),
    ).toBe(false)

    // Single total row
    expect(isHeaderOrTotalRow(['Total Geral', 50])).toBe(true)
    expect(isHeaderOrTotalRow(['Total', 19])).toBe(true)
  })

  it('should correctly sum occurrences across Móvel (19) and Residencial (1) for Enviado Fatura', () => {
    // Simulate rows from Móvel sheet: 19 rows with "Enviado Fatura(s)"
    const movelStatuses = Array(19).fill('ENVIADO FATURA(S)')
    const residencialStatuses = ['Enviado fatura']

    let movelCount = 0
    for (const text of movelStatuses) {
      if (classifyRow(normalizeText(text)) === 'envio_fatura') {
        movelCount++
      }
    }

    let resCount = 0
    for (const text of residencialStatuses) {
      if (classifyRow(normalizeText(text)) === 'envio_fatura') {
        resCount++
      }
    }

    expect(movelCount).toBe(19)
    expect(resCount).toBe(1)
    expect(movelCount + resCount).toBe(20)
  })
})

describe('columnLetterToIndex and extractRowQuantity', () => {
  it('should convert Excel column letters to 0-based indices correctly', () => {
    expect(columnLetterToIndex('A')).toBe(0)
    expect(columnLetterToIndex('B')).toBe(1)
    expect(columnLetterToIndex('Z')).toBe(25)
    expect(columnLetterToIndex('AA')).toBe(26)
    expect(columnLetterToIndex('AE')).toBe(30)
    expect(columnLetterToIndex('AW')).toBe(48)
  })

  it('should extract quantity from row with fallback to 1 when empty or missing', () => {
    const rowMovel: unknown[] = []
    rowMovel[30] = 5 // AE = index 30
    expect(extractRowQuantity(rowMovel, 30)).toBe(5)

    const rowResidencial: unknown[] = []
    rowResidencial[48] = '12' // AW = index 48
    expect(extractRowQuantity(rowResidencial, 48)).toBe(12)

    // Empty or invalid -> fallback to 1
    expect(extractRowQuantity([], 30)).toBe(1)
    expect(extractRowQuantity(['a', 'b'], 30)).toBe(1)
    const emptyRow: unknown[] = []
    emptyRow[30] = ''
    expect(extractRowQuantity(emptyRow, 30)).toBe(1)
    emptyRow[30] = 0
    expect(extractRowQuantity(emptyRow, 30)).toBe(1)
  })
})

describe('parseWorksheet with AE (Móvel) and AW (Residencial) column counts', () => {
  it('should sum quantities from column AE for Móvel worksheet', () => {
    // Build rows for Móvel:
    // Header row:
    const headerRow = Array(35).fill('')
    headerRow[0] = 'LOJA'
    headerRow[1] = 'STATUS'
    headerRow[30] = 'QUANTIDADE' // AE

    // Row 1: Enviado Fatura with quantity 4 in column AE (index 30)
    const row1 = Array(35).fill('')
    row1[0] = 'LOJA CENTRO'
    row1[1] = 'ENVIADO FATURA(S)'
    row1[30] = 4

    // Row 2: Fatura Paga with quantity 3 in column AE
    const row2 = Array(35).fill('')
    row2[0] = 'LOJA CENTRO'
    row2[1] = 'FATURA PAGA'
    row2[30] = 3

    // Row 3: Envia Fatura with quantity 2 in column AE
    const row3 = Array(35).fill('')
    row3[0] = 'LOJA CENTRO'
    row3[1] = 'ENVIA FATURA'
    row3[30] = 2

    // Row 4: Sem Contato with quantity 5 in column AE
    const row4 = Array(35).fill('')
    row4[0] = 'LOJA CENTRO'
    row4[1] = 'SEM CONTATO'
    row4[30] = 5

    // Row 5: Promessa Pagto with quantity missing (fallback 1)
    const row5 = Array(35).fill('')
    row5[0] = 'LOJA CENTRO'
    row5[1] = 'PROMESSA DE PAGTO'
    // no index 30 set

    const ws = XLSX.utils.aoa_to_sheet([headerRow, row1, row2, row3, row4, row5])
    const counts = parseWorksheet(ws, 'Móvel', 'movel')

    expect(counts.envio_fatura).toBe(4)
    expect(counts.fatura_paga).toBe(3)
    expect(counts.envia_fatura).toBe(2)
    expect(counts.sem_contato).toBe(5)
    expect(counts.promessa_pagto).toBe(1)
    expect(counts.totalRows).toBe(15) // 4 + 3 + 2 + 5 + 1
    expect(counts.totalLinesCount).toBe(5)
  })

  it('should sum quantities from column AW for Residencial worksheet', () => {
    // Build rows for Residencial:
    // Header row:
    const headerRow = Array(55).fill('')
    headerRow[0] = 'LOJA'
    headerRow[1] = 'STATUS'
    headerRow[48] = 'QTD_RESIDENCIAL' // AW

    // Row 1: Enviado Fatura with quantity 10 in column AW (index 48)
    const row1 = Array(55).fill('')
    row1[0] = 'LOJA NORTE'
    row1[1] = 'FATURA ENVIADA'
    row1[48] = 10

    // Row 2: Cancelados with quantity 7 in column AW
    const row2 = Array(55).fill('')
    row2[0] = 'LOJA NORTE'
    row2[1] = 'PEDIDO CANCELADO'
    row2[48] = '7'

    // Row 3: Contato Realizado with quantity 8 in column AW
    const row3 = Array(55).fill('')
    row3[0] = 'LOJA NORTE'
    row3[1] = 'CONTATO REALIZADO'
    row3[48] = 8

    const ws = XLSX.utils.aoa_to_sheet([headerRow, row1, row2, row3])
    const counts = parseWorksheet(ws, 'Residencial', 'residencial')

    expect(counts.envio_fatura).toBe(10)
    expect(counts.cancelados).toBe(7)
    expect(counts.contato_realizado).toBe(8)
    expect(counts.totalRows).toBe(25) // 10 + 7 + 8
    expect(counts.totalLinesCount).toBe(3)
  })
})
