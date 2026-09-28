migrate(
  (app) => {
    // 1. Add data_envio_fatura to movel collection if not present
    const colMovel = app.findCollectionByNameOrId('movel')
    if (!colMovel.fields.getByName('data_envio_fatura')) {
      colMovel.fields.add(new TextField({ name: 'data_envio_fatura' }))
      app.save(colMovel)
    }

    // 2. Add data_envio_fatura to residencial collection if not present
    const colResidencial = app.findCollectionByNameOrId('residencial')
    if (!colResidencial.fields.getByName('data_envio_fatura')) {
      colResidencial.fields.add(new TextField({ name: 'data_envio_fatura' }))
      app.save(colResidencial)
    }
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      const f1 = colMovel.fields.getByName('data_envio_fatura')
      if (f1) {
        colMovel.fields.remove(f1)
        app.save(colMovel)
      }
    } catch (_) {}

    try {
      const colResidencial = app.findCollectionByNameOrId('residencial')
      const f2 = colResidencial.fields.getByName('data_envio_fatura')
      if (f2) {
        colResidencial.fields.remove(f2)
        app.save(colResidencial)
      }
    } catch (_) {}
  },
)
