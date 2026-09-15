migrate(
  (app) => {
    const collection = new Collection({
      name: 'reference_date_permissions',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'referente', type: 'text', required: true },
        { name: 'gerente', type: 'bool' },
        { name: 'supervisor', type: 'bool' },
        { name: 'coordenador', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_ref_date_permissions_referente ON reference_date_permissions (referente)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('reference_date_permissions')
      app.delete(collection)
    } catch (_) {}
  },
)
