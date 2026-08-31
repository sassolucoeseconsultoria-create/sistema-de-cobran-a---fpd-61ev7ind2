migrate(
  (app) => {
    const relacionamento = new Collection({
      name: 'relacionamento',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'aba',
          type: 'select',
          required: true,
          values: ['Móvel', 'Residencial'],
          maxSelect: 1,
        },
        {
          name: 'loja',
          type: 'text',
        },
        {
          name: 'arquivo',
          type: 'text',
        },
        {
          name: 'linha',
          type: 'number',
          onlyInt: true,
        },
        {
          name: 'dados',
          type: 'json',
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
        'CREATE INDEX idx_relacionamento_aba ON relacionamento (aba)',
        'CREATE INDEX idx_relacionamento_loja ON relacionamento (loja)',
        'CREATE INDEX idx_relacionamento_arquivo ON relacionamento (arquivo)',
        'CREATE INDEX idx_relacionamento_linha ON relacionamento (linha)',
      ],
    })

    app.save(relacionamento)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('relacionamento')
      app.delete(collection)
    } catch (_) {}
  },
)
