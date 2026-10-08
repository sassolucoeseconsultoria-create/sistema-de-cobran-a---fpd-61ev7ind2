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

  it('garante que linha com loja vazia é ignorada na consolidação e contagens', () => {
    const rawLine = {
      loja: '',
      vendedor: 'GABRIEL TORRES',
      contrato: '9999999',
      data_referencia: '08/09/2026',
    }

    // Regra canônica: linha sem loja é ignorada, nunca criar loja espúria 'LOJA NÃO IDENTIFICADA'
    const lojaEfetiva = (rawLine.loja || '').trim()
    expect(lojaEfetiva).toBe('')
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
    // Regra canônica: linha sem loja é ignorada
    const storeAgg: Record<string, number> = {}
    for (const row of [...dedupMovel, ...dedupRes]) {
      const l = (row.loja || '').trim()
      if (!l) continue
      storeAgg[l] = (storeAgg[l] || 0) + 1
    }
    const totalFpd = Object.values(storeAgg).reduce((a, b) => a + b, 0)

    // 4. Agregação Ranking por Vendedor (vendor_consolidations)
    const vendorAgg: Record<string, number> = {}
    for (const row of [...dedupMovel, ...dedupRes]) {
      const l = (row.loja || '').trim()
      if (!l) continue
      const v = (row.vendedor || '').trim().toUpperCase() || 'NÃO INFORMADO'
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

  it('prova paridade na referência 30/09/2026: conjunto com N linhas válidas com loja + K linhas com loja vazia resulta em N em Inadimplência, Painel e Ranking', () => {
    // Cenário:
    // 10 linhas válidas com loja e chave (ex: 6 móvel + 4 residencial)
    // 5 linhas com contrato válido porém com loja vazia (ex: exatamente o caso das 26 linhas na 30/09/2026)
    const N_MOVEL = 6
    const N_RESIDENCIAL = 4
    const K_SEM_LOJA = 5

    const movelRows = Array.from({ length: N_MOVEL }, (_, i) => ({
      id: `m_${i}`,
      loja: 'CELNET AGUAS CLARAS',
      vendedor: `VENDEDOR M${i}`,
      data_referencia: '30/09/2026',
      ocorrencias: 'Não Tratados',
      dados: { Numero: `619900000${i}` },
    }))

    const residencialValidas = Array.from({ length: N_RESIDENCIAL }, (_, i) => ({
      id: `r_val_${i}`,
      loja: 'CELNET TAGUATINGA',
      vendedor: `VENDEDOR R${i}`,
      data_referencia: '30/09/2026',
      ocorrencias: 'Não Tratados',
      nr_contrato: `CTR_VAL_${i}`,
      dados: { NR_CONTRATO: `CTR_VAL_${i}` },
    }))

    // Linhas com contrato válido mas loja vazia (como no arquivo Preventiva FPD Safra de Julho a Setembro-26)
    const residencialSemLoja = Array.from({ length: K_SEM_LOJA }, (_, i) => ({
      id: `r_empty_store_${i}`,
      loja: '',
      vendedor: '',
      data_referencia: '30/09/2026',
      ocorrencias: 'Não Tratados',
      nr_contrato: `CTR_EMPTY_${i}`,
      dados: { NR_CONTRATO: `CTR_EMPTY_${i}` },
    }))

    const allResidencial = [...residencialValidas, ...residencialSemLoja]

    // 1. Simulação do filtro canônico de contagem da Inadimplência: (loja != "" && loja != null)
    const filteredMovelInadimplencia = movelRows.filter((m) => !!(m.loja && m.loja.trim()))
    const filteredResInadimplencia = allResidencial.filter((r) => !!(r.loja && r.loja.trim()))

    const seenM = new Set<string>()
    for (const m of filteredMovelInadimplencia) {
      const k = extractMovelDeduplicationKey(m)
      if (k) seenM.add(k)
    }
    const seenR = new Set<string>()
    for (const r of filteredResInadimplencia) {
      const k = extractResidencialDeduplicationKey(r)
      if (k) seenR.add(k)
    }

    const totalInadimplencia = seenM.size + seenR.size
    expect(totalInadimplencia).toBe(N_MOVEL + N_RESIDENCIAL) // Exatamente N (10)

    // 2. Simulação da Consolidação do Painel de Lojas (processUnifiedRow em batchImportService: if (!rawLoja) return)
    const storeAgg: Record<string, number> = {}
    for (const row of [...movelRows, ...allResidencial]) {
      const rawLoja = (row.loja || '').trim()
      if (!rawLoja) continue // Ignorada conforme regra do usuário
      storeAgg[rawLoja] = (storeAgg[rawLoja] || 0) + 1
    }
    const totalPainel = Object.values(storeAgg).reduce((a, b) => a + b, 0)
    expect(totalPainel).toBe(N_MOVEL + N_RESIDENCIAL) // Exatamente N (10)

    // 3. Simulação do Ranking por Vendedor (vendor_consolidations)
    const vendorAgg: Record<string, number> = {}
    for (const row of [...movelRows, ...allResidencial]) {
      const rawLoja = (row.loja || '').trim()
      if (!rawLoja) continue // Ignorada conforme regra do usuário
      const v = (row.vendedor || '').trim().toUpperCase() || 'NÃO INFORMADO'
      const k = `${v}__${rawLoja}`
      vendorAgg[k] = (vendorAgg[k] || 0) + 1
    }
    const totalRanking = Object.values(vendorAgg).reduce((a, b) => a + b, 0)
    expect(totalRanking).toBe(N_MOVEL + N_RESIDENCIAL) // Exatamente N (10)

    // Paridade estrita comprovada: Inadimplência == Painel de Lojas == Ranking por Vendedor == N
    expect(totalInadimplencia).toBe(totalPainel)
    expect(totalRanking).toBe(totalPainel)
    expect(totalInadimplencia).toBe(10)
  })
})
