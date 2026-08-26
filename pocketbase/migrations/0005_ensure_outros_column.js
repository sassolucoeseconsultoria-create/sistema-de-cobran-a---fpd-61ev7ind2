migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fpd_records')

    if (!col.fields.getByName('outros')) {
      col.fields.add(new NumberField({ name: 'outros', min: 0, onlyInt: true }))
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fpd_records')
      col.fields.removeByName('outros')
      app.save(col)
    } catch (_) {}
  },
)
