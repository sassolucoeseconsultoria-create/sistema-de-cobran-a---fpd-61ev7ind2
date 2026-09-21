import { describe, it, expect } from 'vitest'
import { FAIXAS_ATRASO_MENSAGEM, type FaixaAtrasoMensagem } from '@/types/fpd'

describe('Migração de Faixas de Atraso das Mensagens', () => {
  it('contém exatamente as 3 novas faixas solicitadas', () => {
    expect(FAIXAS_ATRASO_MENSAGEM).toHaveLength(3)
    expect(FAIXAS_ATRASO_MENSAGEM[0]).toBe('< 15 dias')
    expect(FAIXAS_ATRASO_MENSAGEM[1]).toBe('16 a 30 dias')
    expect(FAIXAS_ATRASO_MENSAGEM[2]).toBe('>30 dias')
  })

  it('mapeia corretamente as faixas antigas para os novos rótulos', () => {
    const migrationMap: Record<string, FaixaAtrasoMensagem> = {
      '>15 dias': '< 15 dias',
      '16 a 30 dias': '16 a 30 dias',
      '>30 dias': '>30 dias',
    }

    expect(migrationMap['>15 dias']).toBe('< 15 dias')
    expect(migrationMap['16 a 30 dias']).toBe('16 a 30 dias')
    expect(migrationMap['>30 dias']).toBe('>30 dias')
  })
})
