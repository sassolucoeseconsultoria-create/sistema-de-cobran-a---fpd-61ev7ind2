import { describe, it, expect } from 'vitest'
import {
  isFaturaPagaOcorrencia,
  compareClientesByOcorrencia,
  sortClientesByOcorrencia,
} from './ocorrenciasSorting'

describe('ocorrenciasSorting', () => {
  describe('isFaturaPagaOcorrencia', () => {
    it('reconhece "Fatura(s) Paga(s)" exato e variações canônicas', () => {
      expect(isFaturaPagaOcorrencia('Fatura(s) Paga(s)')).toBe(true)
      expect(isFaturaPagaOcorrencia('fatura paga')).toBe(true)
      expect(isFaturaPagaOcorrencia('FATURA PAGA')).toBe(true)
      expect(isFaturaPagaOcorrencia('Faturas pagas')).toBe(true)
      expect(isFaturaPagaOcorrencia('pago')).toBe(true)
      expect(isFaturaPagaOcorrencia('quitado')).toBe(true)
      expect(isFaturaPagaOcorrencia('liquidado')).toBe(true)
    })

    it('retorna false para ocorrências não pagas', () => {
      expect(isFaturaPagaOcorrencia('Não Tratados')).toBe(false)
      expect(isFaturaPagaOcorrencia('Enviado Fatura(s)')).toBe(false)
      expect(isFaturaPagaOcorrencia('Sem Contato')).toBe(false)
      expect(isFaturaPagaOcorrencia('Promessa de Pagto.')).toBe(false)
      expect(isFaturaPagaOcorrencia('Cancelados')).toBe(false)
      expect(isFaturaPagaOcorrencia('Contato Realizado')).toBe(false)
      expect(isFaturaPagaOcorrencia('Pendente')).toBe(false)
      expect(isFaturaPagaOcorrencia('')).toBe(false)
      expect(isFaturaPagaOcorrencia(null)).toBe(false)
      expect(isFaturaPagaOcorrencia(undefined)).toBe(false)
    })
  })

  describe('sortClientesByOcorrencia', () => {
    it('move itens com "Fatura(s) Paga(s)" para o final da lista', () => {
      const items = [
        { id: '1', ocorrencias: 'Fatura(s) Paga(s)', linha: 2 },
        { id: '2', ocorrencias: 'Não Tratados', linha: 3 },
        { id: '3', ocorrencias: 'Enviado Fatura(s)', linha: 4 },
        { id: '4', ocorrencias: 'fatura paga', linha: 5 },
        { id: '5', ocorrencias: 'Sem Contato', linha: 6 },
      ]

      const sorted = sortClientesByOcorrencia(items)
      const ids = sorted.map((x) => x.id)

      // Itens não pagos devem vir primeiro (2, 3, 5), seguidos pelos pagos (1, 4)
      expect(ids).toEqual(['2', '3', '5', '1', '4'])
    })

    it('desempata por linha de importação (ASC)', () => {
      const items = [
        { id: 'p2', ocorrencias: 'Fatura(s) Paga(s)', linha: 10 },
        { id: 'p1', ocorrencias: 'Fatura(s) Paga(s)', linha: 5 },
        { id: 'np2', ocorrencias: 'Sem Contato', linha: 8 },
        { id: 'np1', ocorrencias: 'Não Tratados', linha: 2 },
      ]

      const sorted = sortClientesByOcorrencia(items)
      expect(sorted.map((x) => x.id)).toEqual(['np1', 'np2', 'p1', 'p2'])
    })

    it('desempata por created (DESC) quando linha não está presente', () => {
      const items = [
        { id: 'np_old', ocorrencias: 'Não Tratados', created: '2026-01-01T10:00:00Z' },
        { id: 'p_new', ocorrencias: 'Fatura(s) Paga(s)', created: '2026-02-01T10:00:00Z' },
        { id: 'np_new', ocorrencias: 'Sem Contato', created: '2026-02-01T10:00:00Z' },
        { id: 'p_old', ocorrencias: 'Fatura(s) Paga(s)', created: '2026-01-01T10:00:00Z' },
      ]

      const sorted = sortClientesByOcorrencia(items)
      expect(sorted.map((x) => x.id)).toEqual(['np_new', 'np_old', 'p_new', 'p_old'])
    })

    it('considera o mapa de edições locais opcionais (edits)', () => {
      const items = [
        { id: '1', ocorrencias: 'Não Tratados', linha: 2 },
        { id: '2', ocorrencias: 'Sem Contato', linha: 3 },
      ]

      // Editando item 1 para Fatura(s) Paga(s)
      const edits = {
        '1': { ocorrencias: 'Fatura(s) Paga(s)' },
      }

      const sorted = sortClientesByOcorrencia(items, edits)
      expect(sorted.map((x) => x.id)).toEqual(['2', '1'])
    })

    it('quando revertido DE Fatura Paga para Não Tratados, item volta ao início', () => {
      const items = [
        { id: '1', ocorrencias: 'Fatura(s) Paga(s)', linha: 2 },
        { id: '2', ocorrencias: 'Sem Contato', linha: 5 },
      ]

      // Revertendo item 1
      const edits = {
        '1': { ocorrencias: 'Não Tratados' },
      }

      const sorted = sortClientesByOcorrencia(items, edits)
      expect(sorted.map((x) => x.id)).toEqual(['1', '2'])
    })
  })
})
