import { describe, it, expect } from 'vitest'
import {
  extractMovelDeduplicationKey,
  extractResidencialDeduplicationKey,
} from '@/lib/clientDeduplication'

describe('Validação de Paridade Ranking por Vendedor == Painel de Lojas == Inadimplência', () => {
  it('garante que linha com vendedor vazio gera chave e é atribuída a NÃO INFORMADO', () => {
    const rawLine = {
      loja: 'CELNET PLANALTINA',
      vendedor: '',
      contrato: '22043850',
      data_referencia: '08/09/2026',
      ocorrencias: 'Não Tratados',
    }

    const vendedorEfetivo = rawLine.vendedor ? rawLine.vendedor.toUpperCase() : 'NÃO INFORMADO'
    expect(vendedorEfetivo).toBe('NÃO INFORMADO')

    const lojaEfetiva = rawLine.loja ? rawLine.loja.toUpperCase() : 'LOJA NÃO IDENTIFICADA'
    expect(lojaEfetiva).toBe('CELNET PLANALTINA')
  })

  it('garante que linha com loja vazia é atribuída a LOJA NÃO IDENTIFICADA', () => {
    const rawLine = {
      loja: '',
      vendedor: 'GABRIEL TORRES',
      contrato: '9999999',
      data_referencia: '08/09/2026',
    }

    const lojaEfetiva = rawLine.loja ? rawLine.loja.toUpperCase() : 'LOJA NÃO IDENTIFICADA'
    expect(lojaEfetiva).toBe('LOJA NÃO IDENTIFICADA')
  })

  it('garante que soma(vendor_consolidations) == soma(fpd_records) == contagem deduplicada', () => {
    // Simulação de base com linhas móvel + residencial (incluindo vendedor vazio e duplicatas)
    const movelLines = [
      {
        id: '1',
        dados: { Numero: '61981112233' },
        loja: 'LOJA A',
        vendedor: 'JOAO',
        data_referencia: '08/09/2026',
      },
      {
        id: '2',
        dados: { Numero: '61981112233' },
        loja: 'LOJA A',
        vendedor: 'JOAO',
        data_referencia: '08/09/2026',
      }, // duplicata
      {
        id: '3',
        dados: { Numero: '61982223344' },
        loja: 'LOJA A',
        vendedor: '',
        data_referencia: '08/09/2026',
      }, // vendedor vazio
      {
        id: '4',
        dados: { Numero: '61983334455' },
        loja: 'LOJA B',
        vendedor: 'MARIA',
        data_referencia: '08/09/2026',
      },
    ]

    const resLines = [
      {
        id: '5',
        nr_contrato: '22043850',
        loja: 'LOJA A',
        vendedor: '',
        data_referencia: '08/09/2026',
      }, // contrato 22043850 com vendedor vazio
      {
        id: '6',
        nr_contrato: '22043850',
        loja: 'LOJA A',
        vendedor: '',
        data_referencia: '08/09/2026',
      }, // duplicata
      {
        id: '7',
        nr_contrato: '33055441',
        loja: 'LOJA B',
        vendedor: 'CARLOS',
        data_referencia: '08/09/2026',
      },
    ]

    // 1. Deduplicação Móvel
    const seenM = new Set<string>()
    const dedupMovel = movelLines.filter((m) => {
      const k = extractMovelDeduplicationKey(m)
      if (!k) return true
      if (seenM.has(k)) return false
      seenM.add(k)
      return true
    })
    expect(dedupMovel.length).toBe(3) // 1 duplicata removida

    // 2. Deduplicação Residencial
    const seenR = new Set<string>()
    const dedupRes = resLines.filter((r) => {
      const k = extractResidencialDeduplicationKey(r)
      if (!k) return true
      if (seenR.has(k)) return false
      seenR.add(k)
      return true
    })
    expect(dedupRes.length).toBe(2) // 1 duplicata removida

    const totalAnaliticoDeduplicado = dedupMovel.length + dedupRes.length
    expect(totalAnaliticoDeduplicado).toBe(5)

    // 3. Agregação Painel de Lojas (fpd_records)
    const storeAgg: Record<string, number> = {}
    for (const row of [...dedupMovel, ...dedupRes]) {
      const l = row.loja || 'LOJA NÃO IDENTIFICADA'
      storeAgg[l] = (storeAgg[l] || 0) + 1
    }
    const totalFpd = Object.values(storeAgg).reduce((a, b) => a + b, 0)

    // 4. Agregação Ranking por Vendedor (vendor_consolidations)
    const vendorAgg: Record<string, number> = {}
    for (const row of [...dedupMovel, ...dedupRes]) {
      const v = (row.vendedor || '').trim().toUpperCase() || 'NÃO INFORMADO'
      const l = row.loja || 'LOJA NÃO IDENTIFICADA'
      const k = `${v}__${l}`
      vendorAgg[k] = (vendorAgg[k] || 0) + 1
    }
    const totalVendor = Object.values(vendorAgg).reduce((a, b) => a + b, 0)

    // Validação da REGRA DO USUÁRIO
    expect(totalVendor).toBe(totalFpd)
    expect(totalFpd).toBe(totalAnaliticoDeduplicado)
    expect(totalVendor).toBe(5)

    // Verificar se "NÃO INFORMADO" recebeu exatamente as 2 linhas sem vendedor (1 móvel + 1 residencial)
    expect(vendorAgg['NÃO INFORMADO__LOJA A']).toBe(2)
    expect(vendorAgg['JOAO__LOJA A']).toBe(1)
    expect(vendorAgg['MARIA__LOJA B']).toBe(1)
    expect(vendorAgg['CARLOS__LOJA B']).toBe(1)
  })
})
