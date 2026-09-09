migrate(
  (app) => {
    // 0038: Limpar TODOS os registros das coleções Móvel e Residencial
    // Independentemente de loja, arquivo ou Data de Referência
    // Preservar integralmente: users, stores, fpd_records, imported_files, vendor_consolidations

    if (app.hasTable('movel')) {
      const resMovel = app.db().newQuery('DELETE FROM movel').execute()
      let countMovel = 0
      if (resMovel && typeof resMovel.rowsAffected === 'function') {
        countMovel = resMovel.rowsAffected()
      }
      console.log(
        `[0038_limpar_movel_e_residencial] Tabela movel: ${countMovel} registros apagados.`,
      )
    }

    if (app.hasTable('residencial')) {
      const resResidencial = app.db().newQuery('DELETE FROM residencial').execute()
      let countResidencial = 0
      if (resResidencial && typeof resResidencial.rowsAffected === 'function') {
        countResidencial = resResidencial.rowsAffected()
      }
      console.log(
        `[0038_limpar_movel_e_residencial] Tabela residencial: ${countResidencial} registros apagados.`,
      )
    }
  },
  (_app) => {
    // A limpeza de dados é irreversível via safeDown
  },
)
