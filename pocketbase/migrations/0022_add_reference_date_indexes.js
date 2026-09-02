migrate(
  (app) => {
    // 1. Ensure imported_files has index on reference_date
    const importedFiles = app.findCollectionByNameOrId('imported_files')
    if (importedFiles) {
      if (!importedFiles.fields.getByName('reference_date')) {
        importedFiles.fields.add(new TextField({ name: 'reference_date' }))
      }
      importedFiles.addIndex('idx_imported_files_ref_date', false, 'reference_date', '')
      app.save(importedFiles)
    }

    // 2. Ensure fpd_records has index on referente
    const fpdRecords = app.findCollectionByNameOrId('fpd_records')
    if (fpdRecords) {
      if (!fpdRecords.fields.getByName('referente')) {
        fpdRecords.fields.add(new TextField({ name: 'referente' }))
      }
      fpdRecords.addIndex('idx_fpd_records_referente', false, 'referente', '')
      app.save(fpdRecords)
    }

    // 3. Ensure vendor_consolidations has index on data_referencia
    const vendorConsolidations = app.findCollectionByNameOrId('vendor_consolidations')
    if (vendorConsolidations) {
      if (!vendorConsolidations.fields.getByName('data_referencia')) {
        vendorConsolidations.fields.add(new TextField({ name: 'data_referencia' }))
      }
      vendorConsolidations.addIndex(
        'idx_vendor_consolidations_data_ref',
        false,
        'data_referencia',
        '',
      )
      app.save(vendorConsolidations)
    }
  },
  (app) => {
    try {
      const importedFiles = app.findCollectionByNameOrId('imported_files')
      if (importedFiles) {
        importedFiles.removeIndex('idx_imported_files_ref_date')
        app.save(importedFiles)
      }
    } catch (_) {}

    try {
      const fpdRecords = app.findCollectionByNameOrId('fpd_records')
      if (fpdRecords) {
        fpdRecords.removeIndex('idx_fpd_records_referente')
        app.save(fpdRecords)
      }
    } catch (_) {}
  },
)
