migrate(
  (app) => {
    // 0039: Limpar TODOS os registros da coleção vendor_consolidations
    // Alimenta o Ranking por Vendedor (/vendedores) e Principais Ofensores (/top-ofensores)
    // Preservar integralmente: users, stores, fpd_records, imported_files, movel, residencial

    let countVendorConsolidations = 0

    if (app.hasTable('vendor_consolidations')) {
      try {
        countVendorConsolidations = app.countRecords('vendor_consolidations')
      } catch (_) {
        countVendorConsolidations = 0
      }

      const res = app.db().newQuery('DELETE FROM vendor_consolidations').execute()
      let rowsAffected = 0
      if (res && typeof res.rowsAffected === 'function') {
        rowsAffected = res.rowsAffected()
      }

      console.log(
        `[0039_limpar_ranking_vendedores_e_ofensores] Tabela vendor_consolidations: ${countVendorConsolidations} registros existentes contados, ${rowsAffected} registros apagados.`,
      )
    } else {
      console.log(
        `[0039_limpar_ranking_vendedores_e_ofensores] Tabela vendor_consolidations não encontrada.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
