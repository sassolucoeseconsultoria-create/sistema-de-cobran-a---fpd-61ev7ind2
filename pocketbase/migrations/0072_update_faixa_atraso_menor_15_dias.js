migrate(
  (app) => {
    // 1. Atualizar registros existentes onde faixa_atraso = '>15 dias' para '< 15 dias'
    // Preserva texto, ordem, created e updated
    app
      .db()
      .newQuery("UPDATE mensagens SET faixa_atraso = '< 15 dias' WHERE faixa_atraso = '>15 dias'")
      .execute()

    // 2. Atualizar a definição do campo faixa_atraso na coleção mensagens
    const collection = app.findCollectionByNameOrId('mensagens')
    const faixaField = collection.fields.getByName('faixa_atraso')
    if (faixaField) {
      faixaField.values = ['< 15 dias', '16 a 30 dias', '>30 dias']
      app.save(collection)
    }
  },
  (app) => {
    // Reverter valores dos registros
    app
      .db()
      .newQuery("UPDATE mensagens SET faixa_atraso = '>15 dias' WHERE faixa_atraso = '< 15 dias'")
      .execute()

    const collection = app.findCollectionByNameOrId('mensagens')
    const faixaField = collection.fields.getByName('faixa_atraso')
    if (faixaField) {
      faixaField.values = ['>15 dias', '16 a 30 dias', '>30 dias']
      app.save(collection)
    }
  },
)
