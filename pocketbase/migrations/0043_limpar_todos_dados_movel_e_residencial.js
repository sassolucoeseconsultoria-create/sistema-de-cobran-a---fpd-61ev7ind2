/// <reference types="pocketbase" />

/**
 * Migration 0043: Limpar todos os dados das coleções Móvel e Residencial.
 *
 * Solicitação do usuário: "Limpar todos os dados da importação Móvel e Residencial."
 * - Esvaziar completamente a coleção `movel` (clientes Móvel) — todas as referências.
 * - Esvaziar completamente a coleção `residencial` (clientes Residencial) — todas as referências.
 *
 * Preservar integralmente:
 * - `users`, lojas (`stores`) e vínculos usuário↔loja
 * - `imported_files` (histórico de arquivos)
 * - `fpd_records` (consolidado do Painel de Lojas)
 * - `vendor_consolidations` (Ranking por Vendedor / Principais Ofensores)
 */
migrate(
  (app) => {
    // 1. Limpeza total da tabela movel
    if (app.hasTable('movel')) {
      const resMovel = app.db().newQuery('DELETE FROM movel').execute()
      let countMovel = 0
      if (resMovel && typeof resMovel.rowsAffected === 'function') {
        countMovel = resMovel.rowsAffected()
      }
      console.log(
        `[0043_limpar_todos_dados_movel_e_residencial] Tabela movel: ${countMovel} registros apagados.`,
      )
    }

    // 2. Limpeza total da tabela residencial
    if (app.hasTable('residencial')) {
      const resResidencial = app.db().newQuery('DELETE FROM residencial').execute()
      let countResidencial = 0
      if (resResidencial && typeof resResidencial.rowsAffected === 'function') {
        countResidencial = resResidencial.rowsAffected()
      }
      console.log(
        `[0043_limpar_todos_dados_movel_e_residencial] Tabela residencial: ${countResidencial} registros apagados.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
