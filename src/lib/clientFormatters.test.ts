import { describe, it, expect } from 'vitest'
import {
  applyDateMask,
  formatExcelOrIsoDate,
  formatCpf,
  formatPhone,
  getDadosField,
} from './clientFormatters'

describe('clientFormatters', () => {
  describe('applyDateMask', () => {
    it('applies DD/MM/YYYY mask progressively', () => {
      expect(applyDateMask('')).toBe('')
      expect(applyDateMask('1')).toBe('1')
      expect(applyDateMask('15')).toBe('15')
      expect(applyDateMask('150')).toBe('15/0')
      expect(applyDateMask('1508')).toBe('15/08')
      expect(applyDateMask('15082')).toBe('15/08/2')
      expect(applyDateMask('15082026')).toBe('15/08/2026')
      expect(applyDateMask('15/08/2026')).toBe('15/08/2026')
      // Truncates excess
      expect(applyDateMask('15082026999')).toBe('15/08/2026')
    })
  })

  describe('formatExcelOrIsoDate', () => {
    it('returns empty string for null/undefined/empty', () => {
      expect(formatExcelOrIsoDate(null)).toBe('')
      expect(formatExcelOrIsoDate(undefined)).toBe('')
      expect(formatExcelOrIsoDate('')).toBe('')
    })

    it('preserves existing dd/mm/yyyy', () => {
      expect(formatExcelOrIsoDate('15/08/2026')).toBe('15/08/2026')
    })

    it('converts Excel serial numbers', () => {
      // 46188 is in June 2026
      const formatted = formatExcelOrIsoDate('46188')
      expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    })

    it('converts ISO date strings', () => {
      expect(formatExcelOrIsoDate('2026-08-15T00:00:00.000Z')).toBe('15/08/2026')
      expect(formatExcelOrIsoDate('2026-08-15')).toBe('15/08/2026')
    })
  })

  describe('formatCpf', () => {
    it('formats raw digits to CPF mask', () => {
      expect(formatCpf('51263513115')).toBe('512.635.131-15')
      expect(formatCpf(51263513115)).toBe('512.635.131-15')
      expect(formatCpf('')).toBe('')
    })

    it('pads short CPFs to 11 digits', () => {
      expect(formatCpf('7696556100')).toBe('076.965.561-00')
    })
  })

  describe('formatPhone', () => {
    it('formats 11 digit mobile numbers', () => {
      expect(formatPhone('61991483288')).toBe('(61) 99148-3288')
    })

    it('formats 10 digit landline numbers', () => {
      expect(formatPhone('6133445566')).toBe('(61) 3344-5566')
    })

    it('returns original if empty or unrecognized format', () => {
      expect(formatPhone('')).toBe('')
      expect(formatPhone('(61) 99148-3288')).toBe('(61) 99148-3288')
    })
  })

  describe('getDadosField', () => {
    it('extracts field matching exact key', () => {
      const dados = { 'Maior atraso': '45 dias', Vendedor: 'Carlos' }
      expect(getDadosField(dados, 'Maior atraso')).toBe('45 dias')
    })

    it('extracts field matching case-insensitive / accent-insensitive key', () => {
      const dados = { 'MAIOR ATRASO': '45 dias', Número: '6199999999' }
      expect(getDadosField(dados, 'Maior atraso')).toBe('45 dias')
      expect(getDadosField(dados, 'Numero')).toBe('6199999999')
    })

    it('supports fallback alias lookups', () => {
      const dados = { Contrato: '123456' }
      expect(getDadosField(dados, 'NR_CONTRATO', 'Contrato')).toBe('123456')
    })

    it('returns empty string if nothing matches', () => {
      expect(getDadosField({}, 'Inexistente')).toBe('')
      expect(getDadosField(undefined, 'Inexistente')).toBe('')
    })
  })
})
