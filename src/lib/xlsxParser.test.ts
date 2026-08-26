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
    expect(classifyRow('fatura pg')).toBe('fatura_paga')
    expect(classifyRow('pagamento efetuado')).toBe('fatura_paga')
    expect(classifyRow('cliente já quitou / quitado')).toBe('fatura_paga')
    expect(classifyRow('liquidado')).toBe('fatura_paga')
    expect(classifyRow('debito pago')).toBe('fatura_paga')
    expect(classifyRow('ja pago')).toBe('fatura_paga')

    // Standalone 'pg', 'pga', 'pgo' should NOT match fatura_paga (falls into outros)
    expect(classifyRow('pg')).toBe('outros')
    expect(classifyRow('codigo pg 123')).toBe('outros')
    expect(classifyRow('pga')).toBe('outros')
    expect(classifyRow('pgo')).toBe('outros')

    // Regression tests: "comprovante" alone should NOT classify as fatura_paga
    expect(classifyRow('solicitou comprovante de residencia')).not.toBe('fatura_paga')
    expect(classifyRow('aguardando comprovante')).not.toBe('fatura_paga')
    expect(classifyRow('enviar comprovante de endereco')).not.toBe('fatura_paga')
    expect(classifyRow('comprovante de renda')).not.toBe('fatura_paga')

    // Regression tests: Negated payment words should NOT classify as fatura_paga
    expect(classifyRow('nao liquidado')).not.toBe('fatura_paga')
    expect(classifyRow('nao liquidada')).not.toBe('fatura_paga')
    expect(classifyRow('nao quitado')).not.toBe('fatura_paga')
    expect(classifyRow('nao quitada')).not.toBe('fatura_paga')
    expect(classifyRow('nao pago')).not.toBe('fatura_paga')
    expect(classifyRow('nao paga')).not.toBe('fatura_paga')
    expect(classifyRow('nunca pago')).not.toBe('fatura_paga')
    expect(classifyRow('jamais quitou')).not.toBe('fatura_paga')
    expect(classifyRow('sem pago')).not.toBe('fatura_paga')
    expect(classifyRow('nao foi liquidado')).not.toBe('fatura_paga')
  })

  it('should classify "Enviado Fatura(s)" (envio_fatura) and treat unmatched sending requests as "Outros Motivos" (outros)', () => {
    expect(classifyRow('enviado fatura')).toBe('envio_fatura')
    expect(classifyRow('fatura enviada')).toBe('envio_fatura')
    expect(classifyRow('enviada 2 via')).toBe('envio_fatura')

    // Phrases that used to be envia_fatura now fall into outros if not matching other rules
    expect(classifyRow('enviar fatura')).toBe('outros')
    expect(classifyRow('precisa enviar')).toBe('outros')
    expect(classifyRow('a enviar')).toBe('outros')
    expect(classifyRow('mandar fatura')).toBe('outros')
    expect(classifyRow('enviar boleto')).toBe('outros')
  })

  it('should classify "Sem Contato" (sem_contato)', () => {
    expect(classifyRow('sem contato')).toBe('sem_contato')
    expect(classifyRow('caixa postal')).toBe('sem_contato')
    expect(classifyRow('nao atende')).toBe('sem_contato')
    expect(classifyRow('numero ocupado')).toBe('sem_contato')
    expect(classifyRow('telefone incorreto')).toBe('sem_contato')
    expect(classifyRow('numero invalido')).toBe('sem_contato')
    expect(classifyRow('desligado')).toBe('sem_contato')

    // Bugs 2 & 3: 'chamou' and 'recado' should NOT classify as sem_contato
    expect(classifyRow('chamou')).not.toBe('sem_contato')
    expect(classifyRow('chamou e desligou')).not.toBe('sem_contato')
    expect(classifyRow('recado')).not.toBe('sem_contato')
    expect(classifyRow('deixou recado')).not.toBe('sem_contato')
    expect(classifyRow('deixou recado com a mae')).not.toBe('sem_contato')
  })

  it('should classify "Promessa de Pagto." (promessa_pagto) strictly and avoid over-matching', () => {
    // Exact matches allowed via normalizedCells
    expect(classifyRow('promessa de pagamento', ['promessa de pagamento'])).toBe('promessa_pagto')
    expect(classifyRow('promessa de pagto', ['promessa de pagto'])).toBe('promessa_pagto')
    expect(classifyRow('promessa de pagto.', ['promessa de pagto.'])).toBe('promessa_pagto')
    expect(classifyRow('promessa pagto', ['promessa pagto'])).toBe('promessa_pagto')
    expect(classifyRow('promessa pagto.', ['promessa pagto.'])).toBe('promessa_pagto')
    expect(classifyRow('promessa pagamento', ['promessa pagamento'])).toBe('promessa_pagto')
    expect(
      classifyRow(normalizeText('Promessa de Pagto.'), [normalizeText('Promessa de Pagto.')]),
    ).toBe('promessa_pagto')
    expect(
      classifyRow(normalizeText('PROMESSA DE PAGAMENTO'), [normalizeText('PROMESSA DE PAGAMENTO')]),
    ).toBe('promessa_pagto')
    expect(
      classifyRow(normalizeText('Promessa de Pagto'), [normalizeText('Promessa de Pagto')]),
    ).toBe('promessa_pagto')

    // Partial sentences, loose phrases or observations must NOT be classified as promessa_pagto (fall into outros)
    expect(classifyRow('prometeu pagar amanha', ['prometeu pagar amanha'])).toBe('outros')
    expect(classifyRow('promete pagar', ['promete pagar'])).toBe('outros')
    expect(classifyRow('vai pagar', ['vai pagar'])).toBe('outros')
    expect(classifyRow('vai pagar amanha', ['vai pagar amanha'])).toBe('outros')
    expect(classifyRow('ira pagar na sexta', ['ira pagar na sexta'])).toBe('outros')
    expect(classifyRow('combinou pagamento', ['combinou pagamento'])).toBe('outros')
    expect(classifyRow('combinou pagto', ['combinou pagto'])).toBe('outros')
    expect(classifyRow('nao vai pagar', ['nao vai pagar'])).toBe('outros')
    expect(classifyRow('nao ira pagar', ['nao ira pagar'])).toBe('outros')
    expect(classifyRow('nunca vai pagar', ['nunca vai pagar'])).toBe('outros')
    expect(classifyRow('disse que nao vai pagar', ['disse que nao vai pagar'])).toBe('outros')
    expect(classifyRow(normalizeText('não vai pagar'), [normalizeText('não vai pagar')])).toBe(
      'outros',
    )

    // 'pp' isolated should NOT be classified as promessa_pagto (falls into outros)
    expect(classifyRow('pp', ['pp'])).toBe('outros')

    // Words that should NOT trigger promessa_pagto:
    expect(classifyRow('pagamento efetuado')).toBe('fatura_paga')
    expect(classifyRow('pagamento realizado')).toBe('fatura_paga')
    expect(classifyRow('solicitou informacao de pagamento')).toBe('outros')
    expect(classifyRow('aguardando analise de pagamento')).toBe('pendente')
  })

  it('should accurately classify rows with normalizedCells array for Promessa de Pagto. and prevent false positives on observation cells', () => {
    // Real-world row format: customer data + status in an individual cell
    const cells1 = ['joao silva', '11999999999', 'promessa de pagto.', 'obs do cliente']
    const rowText1 = cells1.join(' ')
    expect(classifyRow(rowText1, cells1)).toBe('promessa_pagto')

    const cells2 = ['maria santos', '61988887777', 'promessa de pagamento', 'retornar dia 10']
    const rowText2 = cells2.join(' ')
    expect(classifyRow(rowText2, cells2)).toBe('promessa_pagto')

    const cells3 = ['celnet alexania', 'promessa de pagto', '123456']
    const rowText3 = cells3.join(' ')
    expect(classifyRow(rowText3, cells3)).toBe('promessa_pagto')

    const cells4 = ['cliente x', 'promessa pagto.', 'sem observacoes']
    const rowText4 = cells4.join(' ')
    expect(classifyRow(rowText4, cells4)).toBe('promessa_pagto')

    // Regression test: cells with extra text (not exact match) should NOT match promessa_pagto
    const cells5 = ['cliente y', '999999999', 'status promessa de pagto cliente', '']
    const rowText5 = cells5.join(' ')
    expect(classifyRow(rowText5, cells5)).toBe('outros')

    // Regression test: a cell with "fatura paga - promessa de pagto quitada" should NOT be classified as promessa_pagto
    const cellsRegression = ['loja teste', 'cliente a', 'fatura paga - promessa de pagto quitada']
    const rowTextRegression = cellsRegression.join(' ')
    expect(classifyRow(rowTextRegression, cellsRegression)).toBe('fatura_paga')

    // False positive prevention: "promessa de pagto" inside observation cell when status is "fatura paga"
    const cellsFaturaPaga = [
      'loja centro',
      'cliente z',
      'fatura paga',
      'cliente tinha promessa de pagto anterior mas ja pagou via pix',
    ]
    const rowTextFaturaPaga = cellsFaturaPaga.join(' ')
    expect(classifyRow(rowTextFaturaPaga, cellsFaturaPaga)).toBe('fatura_paga')
  })
  it('should classify "Cancelados" (cancelados)', () => {
    expect(classifyRow('pedido cancelado')).toBe('cancelados')
    expect(classifyRow('cancelamento')).toBe('cancelados')
    expect(classifyRow('fraude confirmada')).toBe('cancelados')
    expect(classifyRow('desistencia do cliente')).toBe('cancelados')
    expect(classifyRow('devolucao')).toBe('cancelados')
    expect(classifyRow(normalizeText('Devolução do aparelho'))).toBe('cancelados')
    expect(classifyRow('aparelho devolvido')).toBe('cancelados')
    expect(classifyRow('mercadoria devolvida')).toBe('cancelados')
    expect(classifyRow('portabilidade')).toBe('cancelados')

    // Bug 5: 'devolveu ligacao/chamada/ligou/retornou' should NOT classify as cancelados
    expect(classifyRow('devolveu ligacao')).not.toBe('cancelados')
    expect(classifyRow('devolveu chamada')).not.toBe('cancelados')
    expect(classifyRow('devolveu a ligacao')).not.toBe('cancelados')
    expect(classifyRow('cliente devolveu ligou')).not.toBe('cancelados')
    expect(classifyRow('devolveu retornou')).not.toBe('cancelados')
  })

  it('should classify "Contato Realizado" (contato_realizado)', () => {
    expect(classifyRow('contato realizado')).toBe('contato_realizado')
    expect(classifyRow('contato efetuado')).toBe('contato_realizado')
    expect(classifyRow('fez contato')).toBe('contato_realizado')
    expect(classifyRow('contactado')).toBe('contato_realizado')
    expect(classifyRow('contatado')).toBe('contato_realizado')
    expect(classifyRow('cliente atendido')).toBe('contato_realizado')
    expect(classifyRow('atendido')).toBe('contato_realizado')
    expect(classifyRow('atendida pelo consultor')).toBe('contato_realizado')
    expect(classifyRow('falou com cliente')).toBe('contato_realizado')
    expect(classifyRow('contato ok')).toBe('contato_realizado')

    // Bug 4: Negated "atendido" should NOT classify as contato_realizado
    expect(classifyRow('nao atendido')).not.toBe('contato_realizado')
    expect(classifyRow(normalizeText('não atendido'))).not.toBe('contato_realizado')
    expect(classifyRow('nunca atendido')).not.toBe('contato_realizado')
    expect(classifyRow('jamais atendido')).not.toBe('contato_realizado')
    expect(classifyRow('mal atendido')).not.toBe('contato_realizado')
    expect(classifyRow('pessimo atendido')).not.toBe('contato_realizado')
    expect(classifyRow(normalizeText('péssimo atendido'))).not.toBe('contato_realizado')
    expect(classifyRow('nao foi atendido')).not.toBe('contato_realizado')
    expect(classifyRow(normalizeText('não foi atendido'))).not.toBe('contato_realizado')
  })

  it('should classify "Não Tratados" (nao_tratados) only for explicit untargeted markers', () => {
    expect(classifyRow('nao tratado')).toBe('nao_tratados')
    expect(classifyRow('naotratado')).toBe('nao_tratados')
    expect(classifyRow('nao trabalhad')).toBe('nao_tratados')
    expect(classifyRow('a tratar')).toBe('nao_tratados')
    expect(classifyRow('aguardando')).toBe('nao_tratados')
    expect(classifyRow('sem status')).toBe('nao_tratados')
    expect(classifyRow('sem tratamento')).toBe('nao_tratados')
    expect(classifyRow('em branco')).toBe('nao_tratados')
  })

  it('should classify genuinely unclassified/other statuses as "Outros Motivos" (outros)', () => {
    expect(classifyRow('algum texto desconhecido')).toBe('outros')
    expect(classifyRow('reclamacao anatel')).toBe('outros')
    expect(classifyRow('contestacao de valores')).toBe('outros')
    expect(classifyRow('duvida de cobertura')).toBe('outros')
    expect(classifyRow('cliente em viagem')).toBe('outros')
    expect(classifyRow('solicitou estorno parcial')).toBe('cancelados') // estorno goes to cancelados
    expect(classifyRow('negociacao com a gerencia')).toBe('outros')
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

    // Data row with customer and status "PENDENTE DE ENVIO"
    expect(
      isHeaderOrTotalRow([
        'LOJA SUL',
        'ANA SOUZA',
        'PENDENTE DE ENVIO',
        'OBS GERAL',
        '61977777777',
      ]),
    ).toBe(false)

    // Single total row
    expect(isHeaderOrTotalRow(['Total Geral', 50])).toBe(true)
    expect(isHeaderOrTotalRow(['Total', 19])).toBe(true)

    // Rows with 'contato', 'tratad', 'atendido' must NOT be discarded as header/total
    expect(
      isHeaderOrTotalRow([
        'LOJA SUL',
        'CLIENTE TESTE',
        'CONTATO REALIZADO',
        'STATUS OK',
        'MOTIVO OK',
      ]),
    ).toBe(false)
    expect(
      isHeaderOrTotalRow([
        'LOJA SUL',
        'CLIENTE TESTE',
        'NAO TRATADOS',
        'STATUS PENDENTE',
        'MOTIVO X',
      ]),
    ).toBe(false)
    expect(isHeaderOrTotalRow(['LOJA CENTRO', 'CLIENTE ATENDIDO', 'STATUS', 'MOTIVO'])).toBe(false)
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

    // Row 3: Outros Motivos with quantity 2 in column AE
    const row3 = Array(35).fill('')
    row3[0] = 'LOJA CENTRO'
    row3[1] = 'OUTRO MOTIVO QUALQUER'
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
    expect(counts.outros).toBe(2)
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
