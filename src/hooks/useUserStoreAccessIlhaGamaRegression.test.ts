import { describe, it, expect } from 'vitest'
import type { StoreRecord, VendorConsolidationRecord } from '@/types/fpd'
import { matchStore } from '@/services/fpdService'

describe('Vínculos de Lojas Ilha Residencial e Gama DF (Karen e Lucas Diniz)', () => {
  const mockStores: StoreRecord[] = [
    {
      id: '9bg4enlqaqqw3z8',
      name: 'CELNET ILHA RESIDENCIAL GAMA DF',
      coordenacao: 'Karen',
      supervisao: 'Karen',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '2026-09-02',
      updated: '2026-09-21',
    },
    {
      id: '7h4cx9x5t35v6l2',
      name: 'CELNET ILHA RESIDENCIAL',
      coordenacao: 'Lucas Diniz',
      supervisao: 'Lucas Diniz',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '2026-09-02',
      updated: '2026-09-21',
    },
  ]

  it('deve mapear corretamente coordenação e supervisão para CELNET ILHA RESIDENCIAL GAMA DF', () => {
    const matched = matchStore('CELNET ILHA RESIDENCIAL GAMA DF', mockStores)
    expect(matched).toBeDefined()
    expect(matched?.id).toBe('9bg4enlqaqqw3z8')
    expect(matched?.supervisao).toBe('Karen')
    expect(matched?.coordenacao).toBe('Karen')
  })

  it('deve mapear corretamente coordenação e supervisão para CELNET ILHA RESIDENCIAL', () => {
    const matched = matchStore('CELNET ILHA RESIDENCIAL', mockStores)
    expect(matched).toBeDefined()
    expect(matched?.id).toBe('7h4cx9x5t35v6l2')
    expect(matched?.supervisao).toBe('Lucas Diniz')
    expect(matched?.coordenacao).toBe('Lucas Diniz')
  })

  it('deve manter supervisão preenchida a partir da loja em vendor_consolidations quando ausente no registro', () => {
    const vendorRecords: VendorConsolidationRecord[] = [
      {
        id: 'rec_1',
        vendedor: 'MARIA DE FATIMA SOUSA MOREIRA',
        loja: 'CELNET ILHA RESIDENCIAL GAMA DF',
        supervisao: '',
        data_referencia: '08/09/2026',
        total_linhas: 3,
        fatura_paga: 0,
        envio_fatura: 0,
        promessa_pagto: 0,
        sem_contato: 0,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        outros: 0,
        nao_tratados: 3,
        collectionId: 'vendor_consolidations',
        collectionName: 'vendor_consolidations',
        created: '2026-09-21',
        updated: '2026-09-21',
      },
      {
        id: 'rec_2',
        vendedor: 'WANDERSON LOPES CONDE',
        loja: 'CELNET ILHA RESIDENCIAL',
        supervisao: 'Lucas Diniz',
        data_referencia: '08/09/2026',
        total_linhas: 2,
        fatura_paga: 0,
        envio_fatura: 0,
        promessa_pagto: 0,
        sem_contato: 0,
        cancelados: 0,
        pendente: 0,
        contato_realizado: 0,
        outros: 0,
        nao_tratados: 2,
        collectionId: 'vendor_consolidations',
        collectionName: 'vendor_consolidations',
        created: '2026-09-21',
        updated: '2026-09-21',
      },
    ]

    const processed = vendorRecords.map((r) => {
      let sup = r.supervisao || ''
      if (!sup && r.loja) {
        const matched = matchStore(r.loja, mockStores)
        if (matched?.supervisao) sup = matched.supervisao
      }
      return { ...r, resolvedSupervisao: sup }
    })

    expect(processed[0].resolvedSupervisao).toBe('Karen')
    expect(processed[1].resolvedSupervisao).toBe('Lucas Diniz')
  })
})
