import { describe, it, expect } from 'vitest'
import { matchStore } from '@/services/fpdService'
import type { StoreRecord } from '@/types/fpd'
import { parseBatchXlsxFile } from '@/services/batchImportService'
import * as XLSX from 'xlsx'

describe('Store Matching Canônico e Fallback de Lojas', () => {
  const registeredStores: StoreRecord[] = [
    {
      id: 'store_aguas',
      name: 'CELNET AGUAS CLARAS',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_call_jk',
      name: 'CELNET CALL JK',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_ilha_jk',
      name: 'CELNET ILHA JK',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_taguatinga_shopping',
      name: 'CELNET TAGUATINGA SHOPPING',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_taguatinga_centro',
      name: 'CELNET TAGUATINGA CENTRO',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_planaltina_df',
      name: 'CELNET PLANALTINA DF',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
    {
      id: 'store_planaltina_go',
      name: 'CELNET PLANALTINA GO',
      collectionId: 'stores_col',
      collectionName: 'stores',
      created: '',
      updated: '',
    },
  ]

  it('exigência QA (a): "AGUAS CLARAS" casa com "CELNET AGUAS CLARAS"', () => {
    const matched = matchStore('AGUAS CLARAS', registeredStores)
    expect(matched).not.toBeNull()
    expect(matched?.id).toBe('store_aguas')
    expect(matched?.name).toBe('CELNET AGUAS CLARAS')

    // Variação inversa e com acento
    const matchedComAcento = matchStore('Águas Claras', registeredStores)
    expect(matchedComAcento?.id).toBe('store_aguas')
  })

  it('exigência QA (b): "CALL JK" NÃO casa com "ILHA JK"', () => {
    const matchedCall = matchStore('CALL JK', registeredStores)
    expect(matchedCall?.id).toBe('store_call_jk')
    expect(matchedCall?.name).toBe('CELNET CALL JK')

    const matchedIlha = matchStore('ILHA JK', registeredStores)
    expect(matchedIlha?.id).toBe('store_ilha_jk')
    expect(matchedIlha?.name).toBe('CELNET ILHA JK')

    // Testar com lista contendo apenas a outra classe: não pode casar
    const storesApenasIlha: StoreRecord[] = [
      {
        id: 'store_ilha_jk',
        name: 'CELNET ILHA JK',
        collectionId: 'stores_col',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ]
    expect(matchStore('CALL JK', storesApenasIlha)).toBeNull()
    expect(matchStore('CELNET CALL JK', storesApenasIlha)).toBeNull()
  })

  it('preservação estrita entre estados DF e GO', () => {
    const matchedDf = matchStore('PLANALTINA DF', registeredStores)
    expect(matchedDf?.id).toBe('store_planaltina_df')

    const matchedGo = matchStore('PLANALTINA GO', registeredStores)
    expect(matchedGo?.id).toBe('store_planaltina_go')

    const storesApenasGo: StoreRecord[] = [
      {
        id: 'store_planaltina_go',
        name: 'CELNET PLANALTINA GO',
        collectionId: 'stores_col',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ]
    expect(matchStore('PLANALTINA DF', storesApenasGo)).toBeNull()
  })

  it('exigência QA (d): dois candidatos possíveis não casa nenhum (sem chute)', () => {
    // "TAGUATINGA" é ambíguo entre "CELNET TAGUATINGA SHOPPING" e "CELNET TAGUATINGA CENTRO"
    const matchedAmbiguo = matchStore('TAGUATINGA', registeredStores)
    expect(matchedAmbiguo).toBeNull()

    // Outro caso: "PLANALTINA" sem DF/GO é ambíguo entre DF e GO
    const matchedPlanaltina = matchStore('PLANALTINA', registeredStores)
    expect(matchedPlanaltina).toBeNull()
  })

  it('exigência QA (c): célula vazia não gera agregado por loja nem cria loja espúria', async () => {
    // Montar uma planilha XLSX em memória com:
    // Linha 1: Cabeçalho
    // Linha 2: Loja 'AGUAS CLARAS', Vendedor 'VEND 1', Status 'Fatura Paga'
    // Linha 3: Loja vazia (''), Vendedor 'VEND 2', Status 'Fatura Paga'
    // Linha 4: Loja 'LOJA DESCONHECIDA XYZ', Vendedor 'VEND 3', Status 'Fatura Paga'
    const wb = XLSX.utils.book_new()
    const wsData = [
      ['Cliente', 'Contrato', 'Status', 'Vendedor', 'Loja'],
      ['Cliente A', 'CTR001', 'Fatura Paga', 'VEND 1', 'AGUAS CLARAS'],
      ['Cliente B', 'CTR002', 'Fatura Paga', 'VEND 2', ''],
      ['Cliente C', 'CTR003', 'Fatura Paga', 'VEND 3', 'LOJA DESCONHECIDA XYZ'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, 'Móvel')

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const file = new File([buf], 'teste_lote.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const parsed = await parseBatchXlsxFile(file, 'movel', registeredStores)

    // Apenas AGUAS CLARAS deve estar no resumo de lojas agregadas
    expect(parsed.storeSummaries.length).toBe(1)
    expect(parsed.storeSummaries[0].canonicalStoreName).toBe('CELNET AGUAS CLARAS')
    expect(parsed.storeSummaries[0].totalLinhas).toBe(1)

    // Nenhuma loja espúria "LOJA NÃO IDENTIFICADA" deve ser criada ou agrupada
    const hasSpurious = parsed.storeSummaries.some((s) =>
      s.canonicalStoreName.toUpperCase().includes('IDENTIFICADA'),
    )
    expect(hasSpurious).toBe(false)

    // O contador de linhas sem loja identificada deve acusar 2 ocorrências
    expect(parsed.totalLinhasSemLojaIdentificada).toBe(2)

    // Todas as linhas originais continuam preservadas na base analítica (não se apaga linha)
    expect(parsed.analyticalRows.length).toBe(3)
  })
})
