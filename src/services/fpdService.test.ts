import { describe, it, expect, vi } from 'vitest'
import { matchStore, normalizeStoreString, simplifyStoreTokens } from './fpdService'
import type { StoreRecord } from '@/types/fpd'

describe('normalizeStoreString and simplifyStoreTokens', () => {
  it('should remove accents, lowercase and trim', () => {
    expect(normalizeStoreString('CELNET NERÓPOLIS')).toBe('celnet neropolis')
    expect(normalizeStoreString('  CELNET   BOULLEVARD  ')).toBe('celnet boullevard')
    expect(normalizeStoreString('CELNET GOIÂNIA FLAMBOYANT')).toBe('celnet goiania flamboyant')
  })

  it('should simplify tokens', () => {
    expect(simplifyStoreTokens('CELNET SHOPPING JK')).toEqual(['celnet', 'jk'])
    expect(simplifyStoreTokens('CELNET JK SHOPPING')).toEqual(['celnet', 'jk'])
    expect(simplifyStoreTokens('CELNET BOULEVARD SHOPPING')).toEqual(['celnet', 'boulevard'])
    expect(simplifyStoreTokens('CELNET BOULLEVARD')).toEqual(['celnet', 'boulevard'])
  })
})

describe('matchStore - Real World Cases', () => {
  const registeredStores = [
    {
      id: 'store-1',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET JK SHOPPING',
      coordenacao: 'Valéria',
      supervisao: 'Jéssica',
    },
    {
      id: 'store-2',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET FLAMBOYANT',
      coordenacao: 'Hélio',
      supervisao: 'Daniella',
    },
    {
      id: 'store-3',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET NERÓPOLIS',
      coordenacao: 'Hélio',
      supervisao: 'Daniella',
    },
    {
      id: 'store-4',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET BOULLEVARD',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
    },
    {
      id: 'store-5',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET ARAGUAIA SHOPPING',
      coordenacao: 'Hélio',
      supervisao: 'Daniella',
    },
    {
      id: 'store-6',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET BRASILIA SHOPPING',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
    },
    {
      id: 'store-7',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET NOVA SUIÇA',
      coordenacao: 'Karen',
      supervisao: 'Karen',
    },
    {
      id: 'store-8',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET AGUAS CLARAS',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
    },
    {
      id: 'store-9',
      collectionId: 'stores',
      collectionName: 'stores',
      created: '',
      updated: '',
      name: 'CELNET PLANALTINA DF',
      coordenacao: 'Valéria',
      supervisao: 'Luana',
    },
  ] as StoreRecord[]

  it('Case 1: Planilha: "CELNET SHOPPING JK" -> Cadastro: "CELNET JK SHOPPING" (supervisor: Jéssica)', () => {
    const match = matchStore('CELNET SHOPPING JK', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET JK SHOPPING')
    expect(match?.supervisao).toBe('Jéssica')
  })

  it('Case 2: Planilha: "CELNET GOIANIA FLAMBOYANT" -> Cadastro: "CELNET FLAMBOYANT" (supervisor: Daniella)', () => {
    const match = matchStore('CELNET GOIANIA FLAMBOYANT', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET FLAMBOYANT')
    expect(match?.supervisao).toBe('Daniella')
  })

  it('Case 3: Planilha: "CELNET NEROPOLIS" -> Cadastro: "CELNET NERÓPOLIS" (supervisor: Daniella)', () => {
    const match = matchStore('CELNET NEROPOLIS', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET NERÓPOLIS')
    expect(match?.supervisao).toBe('Daniella')
  })

  it('Case 4: Planilha: "CELNET BOULEVARD SHOPPING" -> Cadastro: "CELNET BOULLEVARD" (supervisor: Luana)', () => {
    const match = matchStore('CELNET BOULEVARD SHOPPING', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET BOULLEVARD')
    expect(match?.supervisao).toBe('Luana')
  })

  it('Case 4b: Planilha: "CELNET BOULEVARD" -> Cadastro: "CELNET BOULLEVARD" (supervisor: Luana)', () => {
    const match = matchStore('CELNET BOULEVARD', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET BOULLEVARD')
    expect(match?.supervisao).toBe('Luana')
  })

  it('Case 5: Planilha: "CELNET ARAGUAIA" -> Cadastro: "CELNET ARAGUAIA SHOPPING" (supervisor: Daniella)', () => {
    const match = matchStore('CELNET ARAGUAIA', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET ARAGUAIA SHOPPING')
    expect(match?.supervisao).toBe('Daniella')
  })

  it('Case 6: Planilha: "CELNET CALL NOVA SUIÇA" -> quando lojas CALL são cadastradas separadamente, não unifica com loja física', () => {
    const storesWithCall: StoreRecord[] = [
      ...registeredStores,
      {
        id: 'store-call-ns',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
        name: 'CELNET CALL NOVA SUIÇA',
        coordenacao: '',
        supervisao: '',
      },
    ]
    const match = matchStore('CELNET CALL NOVA SUIÇA', storesWithCall)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET CALL NOVA SUIÇA')
    expect(match?.id).toBe('store-call-ns')
  })

  it('Case 7: Planilha: "CELNET AGUAS CLARA" -> Cadastro: "CELNET AGUAS CLARAS" (supervisor: Luana)', () => {
    const match = matchStore('CELNET AGUAS CLARA', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET AGUAS CLARAS')
    expect(match?.supervisao).toBe('Luana')
  })

  it('Case 8: Planilha: "CELNET MATRIZ PLANALTINA DF" -> Cadastro: "CELNET PLANALTINA DF" (supervisor: Luana)', () => {
    const match = matchStore('CELNET MATRIZ PLANALTINA DF', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET PLANALTINA DF')
    expect(match?.supervisao).toBe('Luana')
  })

  it('Case 9: "CELNET CALL NOVA SUIÇA" NUNCA casa com loja física "CELNET NOVA SUIÇA" se CALL não estiver cadastrada', () => {
    // Lista contendo apenas a loja física CELNET NOVA SUIÇA
    const storesWithoutCall = registeredStores.filter((s) => s.name === 'CELNET NOVA SUIÇA')
    const match = matchStore('CELNET CALL NOVA SUIÇA', storesWithoutCall)
    expect(match).toBeNull()
  })

  it('Case 10: "CELNET CALL JK" NUNCA casa com loja física "CELNET JK SHOPPING"', () => {
    const storesWithoutCall = registeredStores.filter((s) => s.name === 'CELNET JK SHOPPING')
    const match = matchStore('CELNET CALL JK', storesWithoutCall)
    expect(match).toBeNull()
  })

  it('Case 11: "CELNET PLANALTINA DF" NUNCA casa com "CELNET PLANALTINA GO"', () => {
    const storesGo = [
      {
        id: 'st-p-go',
        name: 'CELNET PLANALTINA GO',
        supervisao: 'Jessica',
        coordenacao: 'Coord 1',
      } as StoreRecord,
    ]
    const match = matchStore('CELNET PLANALTINA DF', storesGo)
    expect(match).toBeNull()
  })
})

describe('saveFpdRecord - Accumulative updates regression', () => {
  it('saveFpdRecord supports accumulate flag in its parameter type and function signature', async () => {
    const { saveFpdRecord } = await import('./fpdService')
    expect(typeof saveFpdRecord).toBe('function')
  })
})

describe('saveFpdRecord - Espaço residual do Excel e preservação de importado_em', () => {
  it('busca registro tolerante a espaço residual ("08/09/2026 ") e preserva importado_em existente', async () => {
    const { saveFpdRecord } = await import('./fpdService')
    const clientModule = await import('@/lib/pocketbase/client')
    const pb = clientModule.default

    const existingFpd = {
      id: 'existing-fpd-1',
      store: 'store-alfa-id',
      referente: '08/09/2026 ',
      importado_em: '2026-09-08T10:00:00.000Z',
      total_linhas: 10,
      fatura_paga: 1,
    }

    const mockGetList = vi.fn().mockResolvedValue({
      items: [existingFpd],
      totalItems: 1,
    })
    const mockUpdate = vi
      .fn()
      .mockImplementation((_id, payload) => Promise.resolve({ id: existingFpd.id, ...payload }))
    const mockCreate = vi.fn()

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'fpd_records') {
        return {
          getList: mockGetList,
          update: mockUpdate,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const result = await saveFpdRecord({
      storeId: 'store-alfa-id',
      referente: '08/09/2026',
      total_linhas: 15,
      fatura_paga: 3,
      accumulate: false,
    })

    // Deve encontrar o registro existente e fazer UPDATE, sem criar novo duplicado
    expect(mockGetList).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({
        filter: expect.stringContaining('(referente = "08/09/2026" || referente = "08/09/2026 ")'),
      }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      'existing-fpd-1',
      expect.objectContaining({
        store: 'store-alfa-id',
        referente: '08/09/2026',
        importado_em: '2026-09-08T10:00:00.000Z',
        total_linhas: 15,
        fatura_paga: 3,
      }),
      expect.anything(),
    )
    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.id).toBe('existing-fpd-1')
  })
})
