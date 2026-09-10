/// <reference types="pocketbase" />

/**
 * Migration 0042: Limpar fpd_records, imported_files e vendor_consolidations
 * das referências 08/09/2026 e 09/09/2026.
 *
 * Motivo:
 * Na migration 0041 limpamos as coleções de clientes `movel` e `residencial` dessas
 * referências, mas o Painel de Lojas (/arquivos) e Ranking por Vendedor continuaram
 * exibindo dados de 08/09/2026 e 09/09/2026 porque `fpd_records`, `imported_files`
 * e `vendor_consolidations` ainda mantinham registros dessas datas.
 *
 * Escopo:
 * 1. fpd_records: remover onde referente IN ('08/09/2026', '09/09/2026', '08/09/26', '09/09/26', '2026-09-08', '2026-09-09')
 * 2. imported_files: remover onde reference_date IN ('08/09/2026', '09/09/2026', '08/09/26', '09/09/26', '2026-09-08', '2026-09-09')
 * 3. vendor_consolidations: remover onde data_referencia IN ('08/09/2026', '09/09/2026', '08/09/26', '09/09/26', '2026-09-08', '2026-09-09')
 *
 * Preservação total:
 * - Registros de 26/08/2026 (ou qualquer outra referência que não 08/09 e 09/09)
 * - users, stores, relacionamento, layouts, analytic_rows, etc.
 */
migrate(
  (app) => {
    const TARGET_DATES = [
      '08/09/2026',
      '09/09/2026',
      '08/09/26',
      '09/09/26',
      '2026-09-08',
      '2026-09-09',
    ]
    const inClause = TARGET_DATES.map((d) => `'${d}'`).join(', ')

    let deletedFpd = 0
    let deletedImported = 0
    let deletedVendors = 0

    // 1. Limpeza em fpd_records (campo: referente)
    if (app.hasTable('fpd_records')) {
      const resFpd = app
        .db()
        .newQuery(`DELETE FROM fpd_records WHERE referente IN (${inClause})`)
        .execute()

      if (resFpd && typeof resFpd.rowsAffected === 'function') {
        deletedFpd = resFpd.rowsAffected()
      }
      console.log(
        `[0042_limpar_painel_lojas_e_arquivos_08_09_e_09_09] fpd_records: ${deletedFpd} registros removidos.`,
      )
    }

    // 2. Limpeza em imported_files (campo: reference_date)
    if (app.hasTable('imported_files')) {
      const resImported = app
        .db()
        .newQuery(`DELETE FROM imported_files WHERE reference_date IN (${inClause})`)
        .execute()

      if (resImported && typeof resImported.rowsAffected === 'function') {
        deletedImported = resImported.rowsAffected()
      }
      console.log(
        `[0042_limpar_painel_lojas_e_arquivos_08_09_e_09_09] imported_files: ${deletedImported} registros removidos.`,
      )
    }

    // 3. Limpeza em vendor_consolidations (campo: data_referencia)
    if (app.hasTable('vendor_consolidations')) {
      const resVendors = app
        .db()
        .newQuery(`DELETE FROM vendor_consolidations WHERE data_referencia IN (${inClause})`)
        .execute()

      if (resVendors && typeof resVendors.rowsAffected === 'function') {
        deletedVendors = resVendors.rowsAffected()
      }
      console.log(
        `[0042_limpar_painel_lojas_e_arquivos_08_09_e_09_09] vendor_consolidations: ${deletedVendors} registros removidos.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
