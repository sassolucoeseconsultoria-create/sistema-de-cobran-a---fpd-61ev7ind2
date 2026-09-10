import { describe, it, expect } from 'vitest'
import {
  getStoreVariants,
  buildStoreFilterClause,
  isSameStore,
  removeAccentsAndLower,
} from './storeMatchingUtils'

describe('storeMatchingUtils', () => {
  it('removeAccentsAndLower normalizes strings', () => {
    expect(removeAccentsAndLower('CELNET ÁGUAS CLARAS')).toBe('celnet aguas claras')
    expect(removeAccentsAndLower('CELNET PLANALTINA DF')).toBe('celnet planaltina df')
  })

  it('getStoreVariants produces exact variants for CELNET AGUAS CLARAS without mixing other stores', () => {
    const variants = getStoreVariants('CELNET AGUAS CLARAS')
    expect(variants).toContain('CELNET AGUAS CLARAS')
    expect(variants).toContain('CELNET AGUAS CLARA')
    // Should never contain Planaltina
    expect(variants.some((v) => v.toLowerCase().includes('planaltina'))).toBe(false)
  })

  it('getStoreVariants produces exact variants for CELNET PLANALTINA DF without mixing CELNET PLANALTINA GO or AGUAS CLARAS', () => {
    const variants = getStoreVariants('CELNET PLANALTINA DF')
    expect(variants).toContain('CELNET PLANALTINA DF')
    expect(variants).toContain('CELNET MATRIZ PLANALTINA DF')
    expect(variants.some((v) => v.toLowerCase().includes('aguas'))).toBe(false)
    expect(variants.some((v) => v.toLowerCase().includes('go'))).toBe(false)
  })

  it('buildStoreFilterClause creates strict OR equality clauses and never ~ substring operator', () => {
    const clause = buildStoreFilterClause('CELNET AGUAS CLARAS')
    expect(clause).toContain('loja = ')
    expect(clause).not.toContain('~')
    expect(clause).toContain('"CELNET AGUAS CLARAS"')
    expect(clause).toContain('"CELNET AGUAS CLARA"')
  })

  it('isSameStore correctly matches variations of the same store and distinguishes distinct stores', () => {
    // True cases
    expect(isSameStore('CELNET AGUAS CLARAS', 'CELNET AGUAS CLARA')).toBe(true)
    expect(isSameStore('CELNET ÁGUAS CLARAS', 'CELNET AGUAS CLARA')).toBe(true)
    expect(isSameStore('CELNET PLANALTINA DF', 'CELNET MATRIZ PLANALTINA DF')).toBe(true)
    expect(isSameStore('CELNET MATRIZ PLANALTINA DF', 'CELNET PLANALTINA DF')).toBe(true)

    // False cases (Must NOT confuse Aguas Claras with Planaltina)
    expect(isSameStore('CELNET AGUAS CLARAS', 'CELNET PLANALTINA DF')).toBe(false)
    expect(isSameStore('CELNET AGUAS CLARAS', 'CELNET MATRIZ PLANALTINA DF')).toBe(false)
    expect(isSameStore('CELNET AGUAS CLARA', 'CELNET MATRIZ PLANALTINA DF')).toBe(false)
    expect(isSameStore('CELNET PLANALTINA DF', 'CELNET PLANALTINA GO')).toBe(false)
  })

  it('Lojas CALL / ILHA nunca casam com lojas físicas correspondentes', () => {
    expect(isSameStore('CELNET CALL NOVA SUIÇA', 'CELNET NOVA SUIÇA')).toBe(false)
    expect(isSameStore('CELNET NOVA SUIÇA', 'CELNET CALL NOVA SUIÇA')).toBe(false)
    expect(isSameStore('CELNET CALL JK', 'CELNET JK SHOPPING')).toBe(false)
    expect(isSameStore('CELNET CALL JK', 'CELNET SHOPPING JK')).toBe(false)
    expect(isSameStore('CELNET ILHA RESIDENCIAL GAMA DF', 'CELNET GAMA SHOPPING')).toBe(false)
  })

  it('buildStoreFilterClause for CELNET AGUAS CLARA does NOT match CELNET MATRIZ PLANALTINA DF and vice-versa', () => {
    const clauseAguas = buildStoreFilterClause('CELNET AGUAS CLARA')
    expect(clauseAguas).toContain('"CELNET AGUAS CLARA"')
    expect(clauseAguas).not.toContain('PLANALTINA')

    const clausePlanaltina = buildStoreFilterClause('CELNET MATRIZ PLANALTINA DF')
    expect(clausePlanaltina).toContain('"CELNET MATRIZ PLANALTINA DF"')
    expect(clausePlanaltina).toContain('"CELNET PLANALTINA DF"')
    expect(clausePlanaltina).not.toContain('AGUAS')
    expect(clausePlanaltina).not.toContain('PLANALTINA GO')
  })
})
