migrate(
  (app) => {
    // 1. Remove duplicates from collection 'movel' (keeping only the earliest record for each combination of arquivo + linha)
    if (app.hasTable('movel')) {
      app
        .db()
        .newQuery(`
        DELETE FROM movel WHERE id NOT IN (
          SELECT MIN(id) FROM movel GROUP BY arquivo, linha
        )
      `)
        .execute()

      // Add unique index on (arquivo, linha) to collection 'movel'
      const colMovel = app.findCollectionByNameOrId('movel')
      colMovel.addIndex('idx_movel_arquivo_linha_unique', true, 'arquivo, linha', '')
      app.save(colMovel)
    }

    // 2. Remove duplicates from collection 'residencial' if any exist
    if (app.hasTable('residencial')) {
      app
        .db()
        .newQuery(`
        DELETE FROM residencial WHERE id NOT IN (
          SELECT MIN(id) FROM residencial GROUP BY arquivo, linha
        )
      `)
        .execute()

      // Add unique index on (arquivo, linha) to collection 'residencial'
      const colResidencial = app.findCollectionByNameOrId('residencial')
      colResidencial.addIndex('idx_residencial_arquivo_linha_unique', true, 'arquivo, linha', '')
      app.save(colResidencial)
    }
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      colMovel.removeIndex('idx_movel_arquivo_linha_unique')
      app.save(colMovel)
    } catch (_) {}

    try {
      const colResidencial = app.findCollectionByNameOrId('residencial')
      colResidencial.removeIndex('idx_residencial_arquivo_linha_unique')
      app.save(colResidencial)
    } catch (_) {}
  },
)
