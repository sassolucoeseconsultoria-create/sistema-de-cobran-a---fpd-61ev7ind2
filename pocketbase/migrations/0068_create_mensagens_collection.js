migrate(
  (app) => {
    // Idempotência: caso a coleção já exista
    try {
      app.findCollectionByNameOrId('mensagens')
      return
    } catch (_) {}

    const collection = new Collection({
      name: 'mensagens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADM'",
      updateRule: "@request.auth.role = 'ADM'",
      deleteRule: "@request.auth.role = 'ADM'",
      fields: [
        { name: 'ordem', type: 'number', required: true, onlyInt: true },
        { name: 'texto', type: 'text', required: true },
        {
          name: 'faixa_atraso',
          type: 'select',
          required: true,
          values: ['Menos de 30 dias', '31 a 60 dias', 'Maior que 90 dias'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mensagens_ordem ON mensagens (ordem)',
        'CREATE INDEX idx_mensagens_faixa ON mensagens (faixa_atraso)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('mensagens')
      app.delete(collection)
    } catch (_) {}
  },
)
