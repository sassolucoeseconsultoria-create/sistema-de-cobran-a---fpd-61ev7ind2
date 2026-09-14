/// <reference types="pocketbase" />

/**
 * Migration 0051: Limpar todos os dados de todas as referências importadas referente Móvel e Residencial.
 *
 * Solicitação do usuário:
 * "Limpar todos os dados de todas as referências importadas referente Móvel e Residencial."
 *
 * Coleções a apagar integralmente (DELETE em todos os registros de todas as referências):
 * 1. `movel` (clientes Móvel — alimenta Inadimplência aba Móvel)
 * 2. `residencial` (clientes Residencial — alimenta Inadimplência aba Residencial)
 * 3. `fpd_records` (consolidado — alimenta Painel de Lojas /arquivos)
 * 4. `vendor_consolidations` (consolidação por vendedor — alimenta Ranking por Vendedor /vendedores e Principais Ofensores /top-ofensores)
 *
 * Coleções a preservar integralmente:
 * - `users` (todos os usuários, perfis e vínculos com lojas)
 * - `stores` (cadastro de lojas, supervisões, coordenações)
 * - `imported_files` (histórico de arquivos importados mantido intacto, seguindo padrão da v0.0.130 / Migration 0046)
 */
migrate(
  (app) => {
    // 1. Limpeza total de movel
    if (app.hasTable('movel')) {
      var countBeforeMovel = 0
      try {
        countBeforeMovel = app.countRecords('movel')
      } catch (_) {
        countBeforeMovel = 0
      }

      var resMovel = app.db().newQuery('DELETE FROM movel').execute()
      var rowsMovel = 0
      if (resMovel && typeof resMovel.rowsAffected === 'function') {
        rowsMovel = resMovel.rowsAffected()
      }

      console.log(
        '[Migration 0051] movel: ' +
          countBeforeMovel +
          ' registros antes, ' +
          rowsMovel +
          ' apagados.',
      )
    }

    // 2. Limpeza total de residencial
    if (app.hasTable('residencial')) {
      var countBeforeResidencial = 0
      try {
        countBeforeResidencial = app.countRecords('residencial')
      } catch (_) {
        countBeforeResidencial = 0
      }

      var resResidencial = app.db().newQuery('DELETE FROM residencial').execute()
      var rowsResidencial = 0
      if (resResidencial && typeof resResidencial.rowsAffected === 'function') {
        rowsResidencial = resResidencial.rowsAffected()
      }

      console.log(
        '[Migration 0051] residencial: ' +
          countBeforeResidencial +
          ' registros antes, ' +
          rowsResidencial +
          ' apagados.',
      )
    }

    // 3. Limpeza total de fpd_records (Painel de Lojas /arquivos)
    if (app.hasTable('fpd_records')) {
      var countBeforeFpd = 0
      try {
        countBeforeFpd = app.countRecords('fpd_records')
      } catch (_) {
        countBeforeFpd = 0
      }

      var resFpd = app.db().newQuery('DELETE FROM fpd_records').execute()
      var rowsFpd = 0
      if (resFpd && typeof resFpd.rowsAffected === 'function') {
        rowsFpd = resFpd.rowsAffected()
      }

      console.log(
        '[Migration 0051] fpd_records: ' +
          countBeforeFpd +
          ' registros antes, ' +
          rowsFpd +
          ' apagados.',
      )
    }

    // 4. Limpeza total de vendor_consolidations (Ranking por Vendedor / Principais Ofensores)
    if (app.hasTable('vendor_consolidations')) {
      var countBeforeVendors = 0
      try {
        countBeforeVendors = app.countRecords('vendor_consolidations')
      } catch (_) {
        countBeforeVendors = 0
      }

      var resVendors = app.db().newQuery('DELETE FROM vendor_consolidations').execute()
      var rowsVendors = 0
      if (resVendors && typeof resVendors.rowsAffected === 'function') {
        rowsVendors = resVendors.rowsAffected()
      }

      console.log(
        '[Migration 0051] vendor_consolidations: ' +
          countBeforeVendors +
          ' registros antes, ' +
          rowsVendors +
          ' apagados.',
      )
    }

    console.log(
      '[Migration 0051] Limpeza de todas as referências para as 4 coleções concluída com sucesso.',
    )
  },
  (_app) => {
    // Operação de limpeza irreversível no safeDown
  },
)
