migrate(
  (app) => {
    // 1. Add data_referencia to movel collection
    const colMovel = app.findCollectionByNameOrId('movel')
    if (colMovel) {
      if (!colMovel.fields.getByName('data_referencia')) {
        colMovel.fields.add(new TextField({ name: 'data_referencia' }))
      }
      colMovel.addIndex('idx_movel_data_referencia', false, 'data_referencia', '')
      app.save(colMovel)
    }

    // 2. Add data_referencia to residencial collection
    const colResidencial = app.findCollectionByNameOrId('residencial')
    if (colResidencial) {
      if (!colResidencial.fields.getByName('data_referencia')) {
        colResidencial.fields.add(new TextField({ name: 'data_referencia' }))
      }
      colResidencial.addIndex('idx_residencial_data_referencia', false, 'data_referencia', '')
      app.save(colResidencial)
    }
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      if (colMovel) {
        colMovel.removeIndex('idx_movel_data_referencia')
        colMovel.fields.removeByName('data_referencia')
        app.save(colMovel)
      }
    } catch (_) {}

    try {
      const colResidencial = app.findCollectionByNameOrId('residencial')
      if (colResidencial) {
        colResidencial.removeIndex('idx_residencial_data_referencia')
        colResidencial.fields.removeByName('data_referencia')
        app.save(colResidencial)
      }
    } catch (_) {}
  },
)
