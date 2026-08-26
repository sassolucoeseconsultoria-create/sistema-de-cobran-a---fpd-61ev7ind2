migrate(
  (app) => {
    try {
      const storesCol = app.findCollectionByNameOrId('stores')
      if (storesCol.fields.getByName('observacao')) {
        storesCol.fields.removeByName('observacao')
        app.save(storesCol)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const storesCol = app.findCollectionByNameOrId('stores')
      if (!storesCol.fields.getByName('observacao')) {
        storesCol.fields.add(new TextField({ name: 'observacao' }))
        app.save(storesCol)
      }
    } catch (_) {}
  },
)
