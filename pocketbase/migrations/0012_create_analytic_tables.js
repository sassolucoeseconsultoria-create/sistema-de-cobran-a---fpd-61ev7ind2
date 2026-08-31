migrate(
  (app) => {
    // 1. Collection 'analytic_layouts'
    const analyticLayouts = new Collection({
      name: 'analytic_layouts',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'colunas', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_analytic_layouts_nome ON analytic_layouts (nome)'],
    })
    app.save(analyticLayouts)

    // 2. Collection 'analytic_rows'
    const layoutsCol = app.findCollectionByNameOrId('analytic_layouts')
    const analyticRows = new Collection({
      name: 'analytic_rows',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'layout_id',
          type: 'relation',
          required: true,
          collectionId: layoutsCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'origem', type: 'text', required: true },
        { name: 'aba', type: 'text', required: true },
        { name: 'numero_linha', type: 'number', min: 1, onlyInt: true },
        { name: 'valores', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_analytic_rows_layout ON analytic_rows (layout_id)',
        'CREATE INDEX idx_analytic_rows_origem ON analytic_rows (origem)',
        'CREATE INDEX idx_analytic_rows_aba ON analytic_rows (aba)',
      ],
    })
    app.save(analyticRows)
  },
  (app) => {
    try {
      const rows = app.findCollectionByNameOrId('analytic_rows')
      app.delete(rows)
    } catch (_) {}

    try {
      const layouts = app.findCollectionByNameOrId('analytic_layouts')
      app.delete(layouts)
    } catch (_) {}
  },
)
