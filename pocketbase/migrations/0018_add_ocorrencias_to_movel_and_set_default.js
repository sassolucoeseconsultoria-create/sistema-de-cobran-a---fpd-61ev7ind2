migrate(
  (app) => {
    // 1. Add 'ocorrencias' field to collection 'movel' if not already present
    const colMovel = app.findCollectionByNameOrId('movel')
    if (!colMovel.fields.getByName('ocorrencias')) {
      colMovel.fields.add(new TextField({ name: 'ocorrencias' }))
      app.save(colMovel)
    }

    // 2. Set default value 'Não Tratados' for all existing records in 'movel' where ocorrencias is empty or null
    app
      .db()
      .newQuery(`
      UPDATE movel
      SET ocorrencias = 'Não Tratados'
      WHERE ocorrencias IS NULL OR TRIM(ocorrencias) = ''
    `)
      .execute()

    // 3. Set default value 'Não Tratados' for all existing records in 'residencial' where ocorrencias is empty or null or 'Pendente'
    app
      .db()
      .newQuery(`
      UPDATE residencial
      SET ocorrencias = 'Não Tratados'
      WHERE ocorrencias IS NULL OR TRIM(ocorrencias) = '' OR ocorrencias = 'Pendente'
    `)
      .execute()
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      const f = colMovel.fields.getByName('ocorrencias')
      if (f) {
        colMovel.fields.remove(f)
        app.save(colMovel)
      }
    } catch (_) {}
  },
)
