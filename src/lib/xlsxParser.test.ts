import { describe, it, expect } from 'vitest'
import { classifyRow, isHeaderOrTotalRow, normalizeText } from './xlsxParser'

describe('normalizeText', () => {
  it('should remove accents and normalize spaces and lowercase', () => {
    expect(normalizeText('  FATURA  PAGA  ')).toBe('fatura paga')
    expect(normalizeText('NÃO TRATADO')).toBe('nao tratado')
    expect(normalizeText('Boleto_Pago\n')).toBe('boleto pago')
  })
})

describe('classifyRow', () => {
  it('should accurately classify variations of "Enviado Fatura(s)" (fatura_paga)', () => {
    expect(classifyRow('enviado fatura')).toBe('fatura_paga')
    expect(classifyRow('enviado fatura(s)')).toBe('fatura_paga')
    expect(classifyRow('envio fatura')).toBe('fatura_paga')
    expect(classifyRow('fatura enviada')).toBe('fatura_paga')
    expect(classifyRow('env fatura')).toBe('fatura_paga')
    expect(classifyRow('envio de fatura')).toBe('fatura_paga')
    expect(classifyRow('envio da fatura por whatsapp')).toBe('fatura_paga')
    expect(classifyRow('enviado')).toBe('fatura_paga')
    expect(classifyRow('enviada')).toBe('fatura_paga')
    expect(classifyRow('fatura reenviada')).toBe('fatura_paga')
    expect(classifyRow('reencaminhado')).toBe('fatura_paga')
    expect(classifyRow('2 via enviada')).toBe('fatura_paga')
    expect(classifyRow('enviado boleto')).toBe('fatura_paga')
    expect(classifyRow('boleto enviado')).toBe('fatura_paga')
  })

  it('should distinguish "Envia Fatura(s)" (promessa_pagto) from "Enviado Fatura(s)" without overlap', () => {
    expect(classifyRow('envia fatura')).toBe('promessa_pagto')
    expect(classifyRow('enviar fatura')).toBe('promessa_pagto')
    expect(classifyRow('enviar fatura(s)')).toBe('promessa_pagto')
    expect(classifyRow('a enviar fatura')).toBe('promessa_pagto')
    expect(classifyRow('reenviar fatura')).toBe('promessa_pagto')
    expect(classifyRow('mandar fatura')).toBe('promessa_pagto')
    expect(classifyRow('solicitou envio de fatura')).toBe('promessa_pagto')
    expect(classifyRow('enviar boleto')).toBe('promessa_pagto')
    expect(classifyRow('enviar codigo de barras')).toBe('promessa_pagto')
    expect(classifyRow('enviar pix')).toBe('promessa_pagto')

    // Contrast explicitly:
    expect(classifyRow('enviado fatura')).toBe('fatura_paga')
    expect(classifyRow('enviar fatura')).toBe('promessa_pagto')
    expect(classifyRow('fatura enviada')).toBe('fatura_paga')
    expect(classifyRow('envia fatura')).toBe('promessa_pagto')
  })

  it('should classify "Fatura(s) Paga(s)" (contato_realizado)', () => {
    expect(classifyRow('fatura paga')).toBe('contato_realizado')
    expect(classifyRow('faturas pagas')).toBe('contato_realizado')
    expect(classifyRow('pago')).toBe('contato_realizado')
    expect(classifyRow('fatura paga pelo cliente')).toBe('contato_realizado')
    expect(classifyRow('boleto pago')).toBe('contato_realizado')
    expect(classifyRow('pg')).toBe('contato_realizado')
    expect(classifyRow('fatura pg')).toBe('contato_realizado')
    expect(classifyRow('pagamento efetuado')).toBe('contato_realizado')
    expect(classifyRow('cliente já quitou / quitado')).toBe('contato_realizado')
    expect(classifyRow('liquidado')).toBe('contato_realizado')
    expect(classifyRow('debito pago')).toBe('contato_realizado')
    expect(classifyRow('ja pago')).toBe('contato_realizado')
  })

  it('should classify "Pendente" (envio_fatura)', () => {
    expect(classifyRow('pendente')).toBe('envio_fatura')
    expect(classifyRow('aguardando retorno')).toBe('envio_fatura')
    expect(classifyRow('em analise')).toBe('envio_fatura')
    expect(classifyRow('em tratativa')).toBe('envio_fatura')
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

  it('should classify "Promessa de Pagto." (cancelados)', () => {
    expect(classifyRow('promessa de pagamento')).toBe('cancelados')
    expect(classifyRow('promessa de pagto para 25/08')).toBe('cancelados')
    expect(classifyRow('pp')).toBe('cancelados')
    expect(classifyRow('acordo')).toBe('cancelados')
    expect(classifyRow('prometeu pagar amanha')).toBe('cancelados')
    expect(classifyRow('vai pagar')).toBe('cancelados')
  })

  it('should classify "Cancelados" (nao_tratados)', () => {
    expect(classifyRow('pedido cancelado')).toBe('nao_tratados')
    expect(classifyRow('fraude confirmada')).toBe('nao_tratados')
    expect(classifyRow('desistencia do cliente')).toBe('nao_tratados')
    expect(classifyRow('devolucao')).toBe('nao_tratados')
    expect(classifyRow('portabilidade')).toBe('nao_tratados')
  })

  it('should classify "Não Tratados" (outros)', () => {
    expect(classifyRow('nao tratado')).toBe('outros')
    expect(classifyRow('naotratado')).toBe('outros')
    expect(classifyRow('nao trabalhado')).toBe('outros')
    expect(classifyRow('a tratar')).toBe('outros')
    expect(classifyRow('sem status')).toBe('outros')
    expect(classifyRow('algum texto desconhecido')).toBe('outros')
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
      if (classifyRow(normalizeText(text)) === 'fatura_paga') {
        movelCount++
      }
    }

    let resCount = 0
    for (const text of residencialStatuses) {
      if (classifyRow(normalizeText(text)) === 'fatura_paga') {
        resCount++
      }
    }

    expect(movelCount).toBe(19)
    expect(resCount).toBe(1)
    expect(movelCount + resCount).toBe(20)
  })
})
