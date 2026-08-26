migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fpd_records')

    if (!col.fields.getByName('contato_realizado')) {
      col.fields.add(new NumberField({ name: 'contato_realizado', min: 0, onlyInt: true }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fpd_records')
      col.fields.removeByName('contato_realizado')
      app.save(col)
    } catch (_) {}
  },
)
