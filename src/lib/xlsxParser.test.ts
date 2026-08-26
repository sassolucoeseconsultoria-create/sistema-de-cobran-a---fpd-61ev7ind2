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

  it('should classify "Promessa de Pagto." (promessa_pagto)', () => {
    expect(classifyRow('promessa de pagamento')).toBe('promessa_pagto')
    expect(classifyRow('promessa de pagto para 25/08')).toBe('promessa_pagto')
    expect(classifyRow('promessa pagto')).toBe('promessa_pagto')
    expect(classifyRow('pp')).toBe('promessa_pagto')
    expect(classifyRow('acordo')).toBe('promessa_pagto')
    expect(classifyRow('prometeu pagar amanha')).toBe('promessa_pagto')
    expect(classifyRow('vai pagar')).toBe('promessa_pagto')
  })

  it('should classify "Cancelados" (cancelados)', () => {
    expect(classifyRow('pedido cancelado')).toBe('cancelados')
    expect(classifyRow('cancelamento')).toBe('cancelados')
    expect(classifyRow('fraude confirmada')).toBe('cancelados')
    expect(classifyRow('desistencia do cliente')).toBe('cancelados')
    expect(classifyRow('devolucao')).toBe('cancelados')
    expect(classifyRow('portabilidade')).toBe('cancelados')
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
