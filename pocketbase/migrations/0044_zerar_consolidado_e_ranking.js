/// <reference types="pocketbase" />

/**
 * Migration 0044: Zerar Consolidado (fpd_records) e Ranking (vendor_consolidations)
 * Completando o recomeço 100% alinhado da base.
 *
 * O que fazer:
 * 1. Executar DELETE total em:
 *    - `fpd_records` (Consolidado / Painel de Lojas)
 *    - `vendor_consolidations` (Ranking por Vendedor / Principais Ofensores)
 *
 * Preservar integralmente:
 * - `users` (usuários do sistema)
 * - `stores` (lojas cadastradas)
 * - vínculos usuário↔loja
 * - `imported_files` (histórico de arquivos importados permanece)
 * - `movel` e `residencial` (já limpos)
 */
migrate(
  (app) => {
    // 1. Limpeza total de fpd_records (Consolidado / Painel de Lojas)
    if (app.hasTable('fpd_records')) {
      let countBeforeFpd = 0
      try {
        countBeforeFpd = app.countRecords('fpd_records')
      } catch (_) {
        countBeforeFpd = 0
      }

      const resFpd = app.db().newQuery('DELETE FROM fpd_records').execute()
      let rowsAffectedFpd = 0
      if (resFpd && typeof resFpd.rowsAffected === 'function') {
        rowsAffectedFpd = resFpd.rowsAffected()
      }

      console.log(
        `[0044_zerar_consolidado_e_ranking] Tabela fpd_records: ${countBeforeFpd} existentes, ${rowsAffectedFpd} apagados.`,
      )
    }

    // 2. Limpeza total de vendor_consolidations (Ranking por Vendedor / Principais Ofensores)
    if (app.hasTable('vendor_consolidations')) {
      let countBeforeVendors = 0
      try {
        countBeforeVendors = app.countRecords('vendor_consolidations')
      } catch (_) {
        countBeforeVendors = 0
      }

      const resVendors = app.db().newQuery('DELETE FROM vendor_consolidations').execute()
      let rowsAffectedVendors = 0
      if (resVendors && typeof resVendors.rowsAffected === 'function') {
        rowsAffectedVendors = resVendors.rowsAffected()
      }

      console.log(
        `[0044_zerar_consolidado_e_ranking] Tabela vendor_consolidations: ${countBeforeVendors} existentes, ${rowsAffectedVendors} apagados.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
