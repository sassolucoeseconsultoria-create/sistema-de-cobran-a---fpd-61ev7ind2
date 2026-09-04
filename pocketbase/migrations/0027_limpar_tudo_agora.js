migrate(
  (app) => {
    // 0027: Limpeza total dos dados do sistema
    // Limpar todos os registros de tabelas de dados importados, consolidados, clientes e derivações
    // Preservar integralmente: users, stores e suas relações

    const tablesToClear = [
      'imported_files',
      'fpd_records',
      'vendor_consolidations',
      'movel',
      'residencial',
      'relacionamento',
      'analytic_rows',
    ]

    for (const tableName of tablesToClear) {
      if (app.hasTable(tableName)) {
        try {
          const res = app.db().newQuery(`DELETE FROM ${tableName}`).execute()
          let count = 0
          if (res && typeof res.rowsAffected === 'function') {
            count = res.rowsAffected()
          }
          console.log(`[0027_limpar_tudo_agora] Tabela ${tableName}: ${count} registros apagados.`)
        } catch (err) {
          console.error(`[0027_limpar_tudo_agora] Erro ao limpar tabela ${tableName}:`, err)
          throw err
        }
      }
    }
  },
  (_app) => {
    // Limpeza de dados em lote irreversível
  },
)
