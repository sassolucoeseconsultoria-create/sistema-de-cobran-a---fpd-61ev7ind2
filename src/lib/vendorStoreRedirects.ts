/**
 * vendorStoreRedirects.ts
 *
 * Regras de REDIRECIONAMENTO vendedor → loja aplicadas no pipeline de importação
 * de planilhas (.xlsx, abas Móvel e Residencial), ANTES de gravar as linhas nas
 * coleções `movel` / `residencial` e nos consolidados (`vendor_consolidations`,
 * `fpd_records`, `imported_files`).
 *
 * Quando um vendedor aparece com uma loja de ORIGEM listada aqui, o nome da loja
 * é substituído pela loja de DESTINO (nome canônico gravado na coleção `stores`).
 *
 * Caso de origem: migração pocketbase/migrations/0086_transferir_linhas_lohran_
 * call_jk_nova_suica.js transferiu as linhas já existentes do vendedor
 * "LOHRAN RODOVALHO MARTINS" da loja "CELNET CALL JK" para a loja
 * "CELNET NOVA SUIÇA". Esta regra garante que FUTURAS importações sigam o
 * mesmo destino. ATENÇÃO: "CELNET CALL NOVA SUIÇA" é OUTRA loja, não confundir.
 *
 * A comparação é feita de forma NORMALIZADA (sem acentos, minúsculas,
 * pontuação/espaços colapsados) para tolerar variações de grafia na planilha
 * (ex.: "Lohran Rodovalho Martins", "LOHRAN  RODOVALHO MARTINS").
 * O nome gravado no campo `loja` é sempre o nome canônico EXATO do destino.
 *
 * Para adicionar uma nova exceção: inclua uma entrada em VENDOR_STORE_REDIRECTS.
 */

/**
 * Mapeamento de redirecionamentos: vendedor normalizado →
 * lista de pares [lojaDeOrigem normalizada, lojaDeDestino canônica].
 */
export const VENDOR_STORE_REDIRECTS: Record<string, Array<[string, string]>> = {
  // LOHRAN foi transferido da CALL JK para a NOVA SUIÇA (migração 0086);
  // toda importação futura deve gravá-lo direto na NOVA SUIÇA.
  'lohran rodovalho martins': [['celnet call jk', 'CELNET NOVA SUIÇA']],
}

/**
 * Aplica os redirecionamentos vendedor→loja sobre um nome de loja bruto vindo
 * da planilha, comparando vendedor e loja de forma normalizada (sem acentos,
 * minúsculas, espaços/pontuação colapsados).
 *
 * @param vendor Nome do vendedor da linha (bruto da planilha). Vazio/nulo → sem redirecionamento.
 * @param rawStoreName Nome da loja da linha (bruto da planilha). Vazio/nulo → sem redirecionamento.
 * @returns O nome canônico da loja de destino quando a regra casa; caso contrário,
 *          retorna `rawStoreName` inalterado.
 */
export function applyVendorStoreRedirects(
  vendor: string | null | undefined,
  rawStoreName: string | null | undefined,
): string {
  const store = (rawStoreName || '').trim()
  if (!store) return store

  const vendorNorm = normalizeForRedirect(vendor)
  if (!vendorNorm) return store

  const redirects = VENDOR_STORE_REDIRECTS[vendorNorm]
  if (!redirects) return store

  const storeNorm = normalizeForRedirect(store)
  for (const [fromNorm, toCanonical] of redirects) {
    if (storeNorm === fromNorm) {
      return toCanonical
    }
  }
  return store
}

/**
 * Normalização tolerante para comparação: minúsculas, sem acentos,
 * pontuação trocada por espaço e espaços colapsados.
 * (Mesmo critério de normalizeStoreString em services/fpdService.ts,
 * replicado aqui para manter este módulo sem dependências.)
 */
function normalizeForRedirect(str: string | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
