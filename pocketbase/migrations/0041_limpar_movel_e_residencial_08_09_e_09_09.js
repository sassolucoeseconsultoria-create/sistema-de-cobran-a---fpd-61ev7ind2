/// <reference types="pocketbase" />

/**
 * Migration 0041: Limpar importação do Móvel e Residencial dos dias Referência 08/09/2026 e 09/09/2026.
 *
 * Escopo estrito do pedido do usuário:
 * - DELETE apenas dos registros com data_referencia igual a 08/09/2026 OU 09/09/2026 (ou formato ISO 2026-09-08 / 2026-09-09)
 *   nas coleções de clientes: `movel` e `residencial`.
 * - Preservar integralmente:
 *   - Registros de outras referências (ex.: 26/08/2026)
 *   - users, stores, imported_files, fpd_records, vendor_consolidations
 */
migrate(
  (app) => {
    let deletedMovel = 0
    let deletedResidencial = 0

    // 1. Limpeza na tabela movel
    if (app.hasTable('movel')) {
      const resMovel = app
        .db()
        .newQuery(
          "DELETE FROM movel WHERE data_referencia IN ('08/09/2026', '09/09/2026', '08/09/26', '09/09/26', '2026-09-08', '2026-09-09')",
        )
        .execute()

      if (resMovel && typeof resMovel.rowsAffected === 'function') {
        deletedMovel = resMovel.rowsAffected()
      }
      console.log(
        `[0041_limpar_movel_e_residencial_08_09_e_09_09] Tabela movel: ${deletedMovel} registros apagados para referências 08/09/2026 e 09/09/2026.`,
      )
    }

    // 2. Limpeza na tabela residencial
    if (app.hasTable('residencial')) {
      const resResidencial = app
        .db()
        .newQuery(
          "DELETE FROM residencial WHERE data_referencia IN ('08/09/2026', '09/09/2026', '08/09/26', '09/09/26', '2026-09-08', '2026-09-09')",
        )
        .execute()

      if (resResidencial && typeof resResidencial.rowsAffected === 'function') {
        deletedResidencial = resResidencial.rowsAffected()
      }
      console.log(
        `[0041_limpar_movel_e_residencial_08_09_e_09_09] Tabela residencial: ${deletedResidencial} registros apagados para referências 08/09/2026 e 09/09/2026.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
