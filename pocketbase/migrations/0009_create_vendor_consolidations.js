migrate(
  (app) => {
    const collection = new Collection({
      name: 'vendor_consolidations',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'vendedor', type: 'text', required: true },
        { name: 'loja', type: 'text' },
        { name: 'supervisao', type: 'text' },
        { name: 'data_referencia', type: 'text' },
        { name: 'total_linhas', type: 'number' },
        { name: 'fatura_paga', type: 'number' },
        { name: 'envio_fatura', type: 'number' },
        { name: 'promessa_pagto', type: 'number' },
        { name: 'sem_contato', type: 'number' },
        { name: 'cancelados', type: 'number' },
        { name: 'pendente', type: 'number' },
        { name: 'contato_realizado', type: 'number' },
        { name: 'outros', type: 'number' },
        { name: 'nao_tratados', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_vendor_consolidations_vendedor ON vendor_consolidations (vendedor)',
        'CREATE INDEX idx_vendor_consolidations_loja ON vendor_consolidations (loja)',
        'CREATE INDEX idx_vendor_consolidations_data_ref ON vendor_consolidations (data_referencia)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('vendor_consolidations')
      app.delete(collection)
    } catch (_) {}
  },
)
