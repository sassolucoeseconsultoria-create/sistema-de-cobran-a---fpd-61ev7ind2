import { describe, it, expect } from 'vitest'
import { FAIXAS_ATRASO_MENSAGEM, type FaixaAtrasoMensagem } from '@/types/fpd'

describe('Migração de Faixas de Atraso das Mensagens', () => {
  it('contém exatamente as 3 novas faixas solicitadas', () => {
    expect(FAIXAS_ATRASO_MENSAGEM).toHaveLength(3)
    expect(FAIXAS_ATRASO_MENSAGEM[0]).toBe('>15 dias')
    expect(FAIXAS_ATRASO_MENSAGEM[1]).toBe('16 a 30 dias')
    expect(FAIXAS_ATRASO_MENSAGEM[2]).toBe('>30 dias')
  })

  it('mapeia corretamente as faixas antigas para os novos rótulos', () => {
    const migrationMap: Record<string, FaixaAtrasoMensagem> = {
      'Menos de 30 dias': '>15 dias',
      '31 a 60 dias': '16 a 30 dias',
      'Maior que 90 dias': '>30 dias',
    }

    expect(migrationMap['Menos de 30 dias']).toBe('>15 dias')
    expect(migrationMap['31 a 60 dias']).toBe('16 a 30 dias')
    expect(migrationMap['Maior que 90 dias']).toBe('>30 dias')
  })
})
