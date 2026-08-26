migrate(
  (app) => {
    try {
      const fpdCol = app.findCollectionByNameOrId('fpd_records')
      if (fpdCol.fields.getByName('envia_fatura')) {
        fpdCol.fields.removeByName('envia_fatura')
        app.save(fpdCol)
      }
    } catch (_) {}

    try {
      const importedCol = app.findCollectionByNameOrId('imported_files')
      if (importedCol.fields.getByName('envia_fatura')) {
        importedCol.fields.removeByName('envia_fatura')
        app.save(importedCol)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const fpdCol = app.findCollectionByNameOrId('fpd_records')
      if (!fpdCol.fields.getByName('envia_fatura')) {
        fpdCol.fields.add(new NumberField({ name: 'envia_fatura', min: 0, onlyInt: true }))
        app.save(fpdCol)
      }
    } catch (_) {}

    try {
      const importedCol = app.findCollectionByNameOrId('imported_files')
      if (!importedCol.fields.getByName('envia_fatura')) {
        importedCol.fields.add(new NumberField({ name: 'envia_fatura', min: 0, onlyInt: true }))
        app.save(importedCol)
      }
    } catch (_) {}
  },
)
