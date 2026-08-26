migrate(
  (app) => {
    const storesCol = app.findCollectionByNameOrId('stores')

    const collection = new Collection({
      name: 'imported_files',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'store',
          type: 'relation',
          required: false,
          collectionId: storesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'store_name',
          type: 'text',
          required: false,
        },
        {
          name: 'file_name',
          type: 'text',
          required: true,
        },
        {
          name: 'reference_date',
          type: 'text',
          required: false,
        },
        {
          name: 'total_linhas',
          type: 'number',
          required: false,
        },
        {
          name: 'envio_fatura',
          type: 'number',
          required: false,
        },
        {
          name: 'enviado_faturas',
          type: 'number',
          required: false,
        },
        {
          name: 'pendente',
          type: 'number',
          required: false,
        },
        {
          name: 'fatura_paga',
          type: 'number',
          required: false,
        },
        {
          name: 'envia_fatura',
          type: 'number',
          required: false,
        },
        {
          name: 'sem_contato',
          type: 'number',
          required: false,
        },
        {
          name: 'promessa_pagto',
          type: 'number',
          required: false,
        },
        {
          name: 'cancelados',
          type: 'number',
          required: false,
        },
        {
          name: 'nao_tratados',
          type: 'number',
          required: false,
        },
        {
          name: 'contato_realizado',
          type: 'number',
          required: false,
        },
        {
          name: 'outros',
          type: 'number',
          required: false,
        },
        {
          name: 'imported_at',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_imported_files_store ON imported_files (store)',
        'CREATE INDEX idx_imported_files_created ON imported_files (created DESC)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('imported_files')
      app.delete(collection)
    } catch (_) {}
  },
)
