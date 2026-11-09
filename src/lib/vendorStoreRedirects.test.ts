import { describe, expect, it } from 'vitest'
import { VENDOR_STORE_REDIRECTS, applyVendorStoreRedirects } from '@/lib/vendorStoreRedirects'

/**
 * Regressão da regra de exceção vendedor→loja introduzida para validar a
 * transferência do vendedor LOHRAN RODOVALHO MARTINS da loja CELNET CALL JK
 * para a loja CELNET NOVA SUIÇA (migração 0086), também em FUTURAS importações.
 *
 * ATENÇÃO: "CELNET CALL NOVA SUIÇA" é OUTRA loja — não deve ser tocada pela regra.
 */
describe('applyVendorStoreRedirects (LOHRAN: CALL JK → CELNET NOVA SUIÇA)', () => {
  it('linha do LOHRAN na CELNET CALL JK é redirecionada para CELNET NOVA SUIÇA (nome canônico exato)', () => {
    const result = applyVendorStoreRedirects('LOHRAN RODOVALHO MARTINS', 'CELNET CALL JK')
    expect(result).toBe('CELNET NOVA SUIÇA')
  })

  it('linha de OUTRO vendedor na CELNET CALL JK permanece na CALL JK', () => {
    const result = applyVendorStoreRedirects('JOAO DA SILVA', 'CELNET CALL JK')
    expect(result).toBe('CELNET CALL JK')
  })

  it('linha do LOHRAN em outra loja permanece nessa loja', () => {
    const result = applyVendorStoreRedirects('LOHRAN RODOVALHO MARTINS', 'CELNET GAMA DF')
    expect(result).toBe('CELNET GAMA DF')
  })

  it('compara de forma normalizada: acentos, caixa e espaços extras na planilha são tolerados', () => {
    expect(applyVendorStoreRedirects('  lohran   rodovalho  martins ', ' celnet call  jk ')).toBe(
      'CELNET NOVA SUIÇA',
    )
    expect(applyVendorStoreRedirects('Lohran Rodovalho Martins', 'CELNET CALL-JK')).toBe(
      'CELNET NOVA SUIÇA',
    )
  })

  it('"CELNET CALL NOVA SUIÇA" (outra loja) não é tocada pela regra', () => {
    const result = applyVendorStoreRedirects('LOHRAN RODOVALHO MARTINS', 'CELNET CALL NOVA SUIÇA')
    expect(result).toBe('CELNET CALL NOVA SUIÇA')
  })

  it('vendedor ou loja vazios retornam sem alteração', () => {
    expect(applyVendorStoreRedirects('', 'CELNET CALL JK')).toBe('CELNET CALL JK')
    expect(applyVendorStoreRedirects('LOHRAN RODOVALHO MARTINS', '')).toBe('')
    expect(applyVendorStoreRedirects(null, 'CELNET CALL JK')).toBe('CELNET CALL JK')
    expect(applyVendorStoreRedirects('LOHRAN RODOVALHO MARTINS', null)).toBe('')
  })

  it('mapa de redirecionamentos documentado: LOHRAN aponta de CALL JK para CELNET NOVA SUIÇA', () => {
    const redirects = VENDOR_STORE_REDIRECTS['lohran rodovalho martins']
    expect(redirects).toBeDefined()
    expect(redirects).toContainEqual(['celnet call jk', 'CELNET NOVA SUIÇA'])
    // Nunca apontar para "CELNET CALL NOVA SUIÇA" (loja distinta)
    expect(redirects).not.toContainEqual(['celnet call jk', 'CELNET CALL NOVA SUIÇA'])
  })
})
