migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fpd_records')

    if (!col.fields.getByName('pendente')) {
      col.fields.add(new NumberField({ name: 'pendente', min: 0, onlyInt: true }))
    }

    if (!col.fields.getByName('envia_fatura')) {
      col.fields.add(new NumberField({ name: 'envia_fatura', min: 0, onlyInt: true }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fpd_records')
      col.fields.removeByName('pendente')
      col.fields.removeByName('envia_fatura')
      app.save(col)
    } catch (_) {}
  },
)
