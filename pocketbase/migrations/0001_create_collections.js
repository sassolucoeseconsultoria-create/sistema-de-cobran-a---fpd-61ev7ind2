migrate(
  (app) => {
    // 1. Collection 'stores'
    const stores = new Collection({
      name: 'stores',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'coordenacao', type: 'text' },
        { name: 'supervisao', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_stores_name ON stores (name)',
        'CREATE INDEX idx_stores_coordenacao ON stores (coordenacao)',
        'CREATE INDEX idx_stores_supervisao ON stores (supervisao)',
      ],
    })
    app.save(stores)

    // 2. Collection 'fpd_records'
    const storesCol = app.findCollectionByNameOrId('stores')
    const fpdRecords = new Collection({
      name: 'fpd_records',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'store',
          type: 'relation',
          required: true,
          collectionId: storesCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'referente', type: 'text' },
        { name: 'total_linhas', type: 'number', min: 0, onlyInt: true },
        { name: 'fatura_paga', type: 'number', min: 0, onlyInt: true },
        { name: 'envio_fatura', type: 'number', min: 0, onlyInt: true },
        { name: 'contato_realizado', type: 'number', min: 0, onlyInt: true },
        { name: 'promessa_pagto', type: 'number', min: 0, onlyInt: true },
        { name: 'sem_contato', type: 'number', min: 0, onlyInt: true },
        { name: 'cancelados', type: 'number', min: 0, onlyInt: true },
        { name: 'nao_tratados', type: 'number', min: 0, onlyInt: true },
        { name: 'outros', type: 'number', min: 0, onlyInt: true },
        { name: 'importado_em', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_fpd_records_store ON fpd_records (store)',
        'CREATE INDEX idx_fpd_records_importado ON fpd_records (importado_em DESC)',
      ],
    })
    app.save(fpdRecords)
  },
  (app) => {
    try {
      const fpdRecords = app.findCollectionByNameOrId('fpd_records')
      app.delete(fpdRecords)
    } catch (_) {}

    try {
      const stores = app.findCollectionByNameOrId('stores')
      app.delete(stores)
    } catch (_) {}
  },
)
