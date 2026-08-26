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
  it('should accurately classify all exact variations of 1. "Enviado Fatura(s)" (envio_fatura)', () => {
    const exactEnviadoFaturaVariations = [
      'enviado fatura',
      'enviado fatura(s)',
      'enviada fatura',
      'enviada(s) fatura(s)',
      'fatura enviada',
      'faturas enviadas',
      'fatura reenviada',
      'fatura reencaminhada',
      'envio de fatura',
      'envio da fatura',
      'envio fatura',
      'env fatura',
      'env. fatura',
      'env fat',
      'fatura env',
      'boleto enviado',
      'enviado boleto',
      'enviado 2 via',
      'enviada 2 via',
      'enviado 2a via',
      'enviada 2a via',
      '2 via enviada',
      '2a via enviada',
      'segunda via enviada',
      'enviado segunda via',
      'enviada segunda via',
      'segunda via',
      '2 via',
      '2a via',
      'reenvio',
      'reencaminhado',
      'reencaminhada',
      'reencaminhar',
      'ja enviado',
      'ja enviada',
      'foi enviado',
      'foi enviada',
      'enviado',
      'enviada',
      'envio',
    ]

    for (const variation of exactEnviadoFaturaVariations) {
      expect(classifyRow([variation])).toBe('envio_fatura')
      expect(classifyRow(['cliente x', variation, '123456'])).toBe('envio_fatura')
    }

    // Specific case from instructions
    expect(classifyRow(['enviado fatura(s)'])).toBe('envio_fatura')

    // Partial matches must NOT match envio_fatura (they fall back to outros)
    expect(classifyRow(['envio da fatura por whatsapp'])).toBe('outros')
    expect(classifyRow(['fatura enviada para o cliente'])).toBe('outros')
    expect(classifyRow(['enviar fatura'])).toBe('outros')
    expect(classifyRow(['precisa enviar'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 2. "Promessa de Pagto." (promessa_pagto)', () => {
    const exactPromessaVariations = [
      'promessa de pagto.',
      'promessa de pagto',
      'promessa de pagamento',
      'promessa pagto.',
      'promessa pagto',
      'promessa pagamento',
    ]

    for (const variation of exactPromessaVariations) {
      expect(classifyRow([variation])).toBe('promessa_pagto')
      expect(classifyRow(['joao silva', variation, 'obs do cliente'])).toBe('promessa_pagto')
    }

    // Specific case from instructions
    expect(classifyRow(['promessa de pagto.'])).toBe('promessa_pagto')
    expect(classifyRow([normalizeText('Promessa de Pagto.')])).toBe('promessa_pagto')
    expect(classifyRow([normalizeText('PROMESSA DE PAGAMENTO')])).toBe('promessa_pagto')

    // Partial matches and observation phrases must NOT classify as promessa_pagto
    expect(classifyRow(['promessa de pagto - cliente'])).toBe('outros')
    expect(classifyRow(['status promessa de pagto cliente'])).toBe('outros')
    expect(classifyRow(['prometeu pagar amanha'])).toBe('outros')
    expect(classifyRow(['promete pagar'])).toBe('outros')
    expect(classifyRow(['vai pagar'])).toBe('outros')
    expect(classifyRow(['combinou pagamento'])).toBe('outros')
    expect(classifyRow(['pp'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 3. "Fatura(s) Paga(s)" (fatura_paga)', () => {
    const exactFaturaPagaVariations = [
      'fatura paga',
      'faturas pagas',
      'fatura(s) paga(s)',
      'boleto pago',
      'boleta paga',
      'boleto quitado',
      'boleto liquidado',
      'fatura quitada',
      'fatura liquidada',
      'faturas quitadas',
      'faturas liquidadas',
      'fatura pg',
      'faturas pg',
      'pagamento efetuado',
      'pagamento realizado',
      'pagamento confirmado',
      'debito pago',
      'debito quitado',
      'pix pago',
      'pago pelo cliente',
      'pagamento ok',
      'pagamento identificado',
      'quitado',
      'liquidado',
      'pago',
      'paga',
      'ja pago',
      'ja paga',
      'ja quitado',
      'ja liquidado',
    ]

    for (const variation of exactFaturaPagaVariations) {
      expect(classifyRow([variation])).toBe('fatura_paga')
      expect(classifyRow(['loja x', variation, 'obs'])).toBe('fatura_paga')
    }

    // Specific case from instructions
    expect(classifyRow(['fatura paga'])).toBe('fatura_paga')
    expect(classifyRow([normalizeText('FATURA(S) PAGA(S)')])).toBe('fatura_paga')
    expect(classifyRow([normalizeText('BOLETO PAGO')])).toBe('fatura_paga')
    expect(classifyRow([normalizeText('Fatura Quitada')])).toBe('fatura_paga')

    // Extra / partial text must NOT match fatura_paga
    expect(classifyRow(['fatura paga - promessa de pagto quitada'])).toBe('outros')
    expect(classifyRow(['pg'])).toBe('outros')
    expect(classifyRow(['codigo pg 123'])).toBe('outros')
    expect(classifyRow(['solicitou comprovante de residencia'])).toBe('outros')
    expect(classifyRow(['aguardando comprovante'])).toBe('outros')
    expect(classifyRow(['cliente ja quitou / quitado'])).toBe('outros')
    expect(classifyRow(['nao liquidado'])).toBe('outros')
    expect(classifyRow(['nao pago'])).toBe('outros')
    expect(classifyRow(['nao paga'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 4. "Sem Contato" (sem_contato)', () => {
    const exactSemContatoVariations = [
      'sem contato',
      'nao atende',
      'nao atendeu',
      'caixa postal',
      'ocupado',
      'desligado',
      'fora de area',
      'fora de servico',
      'nao existe',
      'telefone incorreto',
      'numero incorreto',
      'numero errado',
      'telefone errado',
      'numero invalido',
      'telefone invalido',
      'invalido',
      'incorreto',
      'mudo',
      'mensagem gravada',
      'chamada recusada',
      'recusou chamada',
      'ligacao caiu',
      'impossibilitado de receber',
    ]

    for (const variation of exactSemContatoVariations) {
      expect(classifyRow([variation])).toBe('sem_contato')
      expect(classifyRow(['cliente 1', variation])).toBe('sem_contato')
    }

    // Partial/extra text should not match
    expect(classifyRow(['numero ocupado'])).toBe('outros')
    expect(classifyRow(['chamou e desligou'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 5. "Cancelados" (cancelados)', () => {
    const exactCanceladosVariations = [
      'cancelado',
      'cancelada',
      'cancelados',
      'canceladas',
      'cancel',
      'devolucao',
      'devolvido',
      'devolvida',
      'fraude',
      'inversao',
      'desistencia',
      'desistiu',
      'desistente',
      'estorno',
      'portabilidade',
      'obito',
      'falecido',
      'sinistro',
      'desativado',
      'desativada',
      'desabilitado',
      'desabilitada',
    ]

    for (const variation of exactCanceladosVariations) {
      expect(classifyRow([variation])).toBe('cancelados')
      expect(classifyRow(['cliente x', variation])).toBe('cancelados')
    }

    // Partial/extra text should not match
    expect(classifyRow(['pedido cancelado'])).toBe('outros')
    expect(classifyRow(['fraude confirmada'])).toBe('outros')
    expect(classifyRow(['desistencia do cliente'])).toBe('outros')
    expect(classifyRow(['devolucao do aparelho'])).toBe('outros')
    expect(classifyRow(['devolveu ligacao'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 6. "Pendente" (pendente)', () => {
    const exactPendenteVariations = [
      'pendente',
      'em analise',
      'em andamento',
      'em tratativa',
      'aguardando retorno',
      'aguardando resposta',
      'aguardando cliente',
      'retorno agendado',
      'retornar',
      'retorno',
    ]

    for (const variation of exactPendenteVariations) {
      expect(classifyRow([variation])).toBe('pendente')
      expect(classifyRow(['cliente 1', variation])).toBe('pendente')
    }

    // Partial/extra text should not match
    expect(classifyRow(['pendente de envio'])).toBe('outros')
    expect(classifyRow(['aguardando analise de pagamento'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 7. "Contato Realizado" (contato_realizado)', () => {
    const exactContatoRealizadoVariations = [
      'contato realizado',
      'contato efetuado',
      'contato feito',
      'fez contato',
      'contactado',
      'contactada',
      'contatado',
      'contatada',
      'cliente atendido',
      'cliente atendida',
      'atendido',
      'atendida',
      'atendidos',
      'atendidas',
      'atendimento realizado',
      'falou com cliente',
      'falou com o cliente',
      'falou com titular',
      'falou com terceiro',
      'falou com a mae',
      'falou com o pai',
      'falou com esposo',
      'falou com esposa',
      'contato com sucesso',
      'contato ok',
      'recado',
      'deixou recado',
    ]

    for (const variation of exactContatoRealizadoVariations) {
      expect(classifyRow([variation])).toBe('contato_realizado')
      expect(classifyRow(['cliente 1', variation])).toBe('contato_realizado')
    }

    // Partial / extra / negated phrases should NOT match
    expect(classifyRow(['atendida pelo consultor'])).toBe('outros')
    expect(classifyRow(['nao atendido'])).toBe('outros')
    expect(classifyRow(['deixou recado com a mae'])).toBe('outros')
  })

  it('should accurately classify all exact variations of 8. "Não Tratados" (nao_tratados)', () => {
    const exactNaoTratadosVariations = [
      'nao tratado',
      'nao tratada',
      'naotratado',
      'naotratada',
      'nao trabalhado',
      'nao trabalhada',
      'a tratar',
      'sem tratamento',
      'sem status',
      'em branco',
      'nao abordado',
      'novo',
      'virgem',
      'aguardando',
    ]

    for (const variation of exactNaoTratadosVariations) {
      expect(classifyRow([variation])).toBe('nao_tratados')
      expect(classifyRow(['cliente 1', variation])).toBe('nao_tratados')
    }

    // Partial matches
    expect(classifyRow(['nao trabalhad'])).toBe('outros')
  })

  it('should classify unclassified or unrecognized statuses as "Outros Motivos" (outros) as fallback (9)', () => {
    expect(classifyRow(['algum texto desconhecido'])).toBe('outros')
    expect(classifyRow(['reclamacao anatel'])).toBe('outros')
    expect(classifyRow(['contestacao de valores'])).toBe('outros')
    expect(classifyRow(['duvida de cobertura'])).toBe('outros')
    expect(classifyRow(['cliente em viagem'])).toBe('outros')
    expect(classifyRow(['solicitou estorno parcial'])).toBe('outros')
    expect(classifyRow(['negociacao com a gerencia'])).toBe('outros')
  })

  it('should respect exact priority order: 1. Enviado Fatura > 2. Promessa Pagto > 3. Fatura Paga > 4. Sem Contato > 5. Cancelados > 6. Pendente > 7. Contato Realizado > 8. Não Tratados', () => {
    // 1. Enviado Fatura vs 2. Promessa Pagto
    expect(classifyRow(['enviado fatura', 'promessa de pagto'])).toBe('envio_fatura')

    // 1. Enviado Fatura vs 3. Fatura Paga
    expect(classifyRow(['fatura enviada', 'fatura paga'])).toBe('envio_fatura')

    // 2. Promessa Pagto vs 3. Fatura Paga
    expect(classifyRow(['promessa de pagto.', 'fatura paga'])).toBe('promessa_pagto')

    // 3. Fatura Paga vs 4. Sem Contato
    expect(classifyRow(['fatura paga', 'sem contato'])).toBe('fatura_paga')

    // 4. Sem Contato vs 5. Cancelados
    expect(classifyRow(['sem contato', 'cancelado'])).toBe('sem_contato')

    // 5. Cancelados vs 6. Pendente
    expect(classifyRow(['cancelado', 'pendente'])).toBe('cancelados')

    // 6. Pendente vs 7. Contato Realizado
    expect(classifyRow(['pendente', 'contato realizado'])).toBe('pendente')

    // 7. Contato Realizado vs 8. Não Tratados
    expect(classifyRow(['contato realizado', 'nao tratado'])).toBe('contato_realizado')
  })

  it('regression tests: unified text containing a keyword when NO cell has exact value MUST NOT classify as that status', () => {
    // Row whose joined text contains "promessa de pagto" across split cells or within a sentence
    const rowSplit = ['loja x', 'status: promessa de pagto do cliente', 'obs adicional']
    expect(rowSplit.join(' ')).toContain('promessa de pagto')
    expect(classifyRow(rowSplit)).toBe('outros')

    // Row whose cell has extra text: "promessa de pagto - cliente"
    const rowExtraText = ['loja x', 'promessa de pagto - cliente']
    expect(classifyRow(rowExtraText)).toBe('outros')

    // Row with status "contato realizado" and an observation cell mentioning "disse que a fatura paga ja foi entregue"
    const rowObsWithFaturaPaga = [
      'loja y',
      'contato realizado',
      'disse que a fatura paga ja foi entregue',
    ]
    expect(classifyRow(rowObsWithFaturaPaga)).toBe('contato_realizado')

    // Row with observation mentioning "cliente enviou comprovante" (not exact "enviado")
    const rowObsEnvio = ['loja z', 'cliente enviou comprovante', 'outra info']
    expect(classifyRow(rowObsEnvio)).toBe('outros')
  })
})

describe('isHeaderOrTotalRow', () => {
  it('should identify header rows and total rows accurately', () => {
    // Header row with 2+ structural header keywords
    expect(isHeaderOrTotalRow(['LOJA', 'CLIENTE', 'STATUS', 'MOTIVO', 'TELEFONE', 'DATA'])).toBe(
      true,
    )
    expect(isHeaderOrTotalRow(['OPERADOR', 'SUPERVISAO', 'CONTRATO', 'CPF'])).toBe(true)

    // Data row with customer name and status
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

    // Single total row
    expect(isHeaderOrTotalRow(['Total Geral', 50])).toBe(true)
    expect(isHeaderOrTotalRow(['Total', 19])).toBe(true)
    expect(isHeaderOrTotalRow(['Resumo'])).toBe(true)
    expect(isHeaderOrTotalRow(['Totais'])).toBe(true)
  })

  it('should correctly sum occurrences across Móvel (19) and Residencial (1) for Enviado Fatura', () => {
    // Simulate rows from Móvel sheet: 19 rows with "Enviado Fatura(s)"
    const movelStatuses = Array(19).fill('ENVIADO FATURA(S)')
    const residencialStatuses = ['Enviado fatura']

    let movelCount = 0
    for (const text of movelStatuses) {
      if (classifyRow([normalizeText(text)]) === 'envio_fatura') {
        movelCount++
      }
    }

    let resCount = 0
    for (const text of residencialStatuses) {
      if (classifyRow([normalizeText(text)]) === 'envio_fatura') {
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

  it('should verify FPD_STATUSES order matches exact 9 status specification from E to M', async () => {
    const { FPD_STATUSES } = await import('@/types/fpd')
    const expectedKeys = [
      'fatura_paga',
      'envio_fatura',
      'promessa_pagto',
      'sem_contato',
      'cancelados',
      'pendente',
      'contato_realizado',
      'outros',
      'nao_tratados',
    ]

    const expectedLabels = [
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

    expect(FPD_STATUSES.map((s) => s.key)).toEqual(expectedKeys)
    expect(FPD_STATUSES.map((s) => s.label)).toEqual(expectedLabels)
    expect(FPD_STATUSES).toHaveLength(9)
  })
})
