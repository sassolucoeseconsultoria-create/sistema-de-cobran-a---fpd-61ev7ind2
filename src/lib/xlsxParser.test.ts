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
  it('should classify various representations of Fatura Paga', () => {
    expect(classifyRow('fatura paga')).toBe('fatura_paga')
    expect(classifyRow('pago')).toBe('fatura_paga')
    expect(classifyRow('fatura paga pelo cliente')).toBe('fatura_paga')
    expect(classifyRow('boleto pago')).toBe('fatura_paga')
    expect(classifyRow('pg')).toBe('fatura_paga')
    expect(classifyRow('fatura pg')).toBe('fatura_paga')
    expect(classifyRow('pagamento efetuado')).toBe('fatura_paga')
    expect(classifyRow('cliente já quitou / quitado')).toBe('fatura_paga')
    expect(classifyRow('liquidado')).toBe('fatura_paga')
    expect(classifyRow('pagto realizado')).toBe('fatura_paga')
  })

  it('should distinguish promessa de pagamento from paid invoice', () => {
    expect(classifyRow('promessa de pagamento')).toBe('promessa_pagto')
    expect(classifyRow('promessa de pagto para 25/08')).toBe('promessa_pagto')
    expect(classifyRow('pp')).toBe('promessa_pagto')
    expect(classifyRow('acordo')).toBe('promessa_pagto')
  })

  it('should classify envio de fatura', () => {
    expect(classifyRow('envio de fatura por whatsapp')).toBe('envio_fatura')
    expect(classifyRow('enviado boleto')).toBe('envio_fatura')
    expect(classifyRow('reencaminhado')).toBe('envio_fatura')
    expect(classifyRow('2 via enviada')).toBe('envio_fatura')
  })

  it('should classify contato realizado vs sem contato', () => {
    expect(classifyRow('contato realizado com sucesso')).toBe('contato_realizado')
    expect(classifyRow('atendido pelo titular')).toBe('contato_realizado')
    expect(classifyRow('falou com o cliente')).toBe('contato_realizado')
    expect(classifyRow('sem contato')).toBe('sem_contato')
    expect(classifyRow('caixa postal')).toBe('sem_contato')
    expect(classifyRow('nao atende')).toBe('sem_contato')
    expect(classifyRow('numero ocupado')).toBe('sem_contato')
  })

  it('should classify cancelados and nao tratados', () => {
    expect(classifyRow('pedido cancelado')).toBe('cancelados')
    expect(classifyRow('fraude confirmada')).toBe('cancelados')
    expect(classifyRow('nao tratado')).toBe('nao_tratados')
    expect(classifyRow('naotratado')).toBe('nao_tratados')
    expect(classifyRow('a tratar')).toBe('nao_tratados')
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

    // Single total row
    expect(isHeaderOrTotalRow(['Total Geral', 50])).toBe(true)
    expect(isHeaderOrTotalRow(['Total', 19])).toBe(true)
  })
})
