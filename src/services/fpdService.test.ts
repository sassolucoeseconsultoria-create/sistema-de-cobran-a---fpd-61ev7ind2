import { describe, it, expect } from 'vitest'
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

  it('Case 6: Planilha: "CELNET CALL NOVA SUIÇA" -> Cadastro: "CELNET NOVA SUIÇA" (supervisor: Karen)', () => {
    const match = matchStore('CELNET CALL NOVA SUIÇA', registeredStores)
    expect(match).not.toBeNull()
    expect(match?.name).toBe('CELNET NOVA SUIÇA')
    expect(match?.supervisao).toBe('Karen')
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
})
