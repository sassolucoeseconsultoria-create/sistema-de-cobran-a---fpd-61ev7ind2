migrate(
  (app) => {
    // Corrigir registros existentes onde a loja foi gravada com o termo 'MATRIZ' vindo da planilha
    // ("CELNET MATRIZ PLANALTINA DF" -> "CELNET PLANALTINA DF")
    // Idempotente: roda apenas onde loja = 'CELNET MATRIZ PLANALTINA DF'
    app
      .db()
      .newQuery(`
    UPDATE movel
    SET loja = {:novoNome}
    WHERE loja = {:antigoNome}
  `)
      .bind({
        antigoNome: 'CELNET MATRIZ PLANALTINA DF',
        novoNome: 'CELNET PLANALTINA DF',
      })
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE residencial
    SET loja = {:novoNome}
    WHERE loja = {:antigoNome}
  `)
      .bind({
        antigoNome: 'CELNET MATRIZ PLANALTINA DF',
        novoNome: 'CELNET PLANALTINA DF',
      })
      .execute()

    // Também atualizar a tabela legada relacionamento se houver algum registro
    if (app.hasTable('relacionamento')) {
      app
        .db()
        .newQuery(`
      UPDATE relacionamento
      SET loja = {:novoNome}
      WHERE loja = {:antigoNome}
    `)
        .bind({
          antigoNome: 'CELNET MATRIZ PLANALTINA DF',
          novoNome: 'CELNET PLANALTINA DF',
        })
        .execute()
    }
  },
  (app) => {
    // Revert: restaurar o nome anterior se necessário
    app
      .db()
      .newQuery(`
    UPDATE movel
    SET loja = {:antigoNome}
    WHERE loja = {:novoNome} AND arquivo = {:arquivo}
  `)
      .bind({
        antigoNome: 'CELNET MATRIZ PLANALTINA DF',
        novoNome: 'CELNET PLANALTINA DF',
        arquivo: 'CELNET PLANALTINA DF.xlsx',
      })
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE residencial
    SET loja = {:antigoNome}
    WHERE loja = {:novoNome} AND arquivo = {:arquivo}
  `)
      .bind({
        antigoNome: 'CELNET MATRIZ PLANALTINA DF',
        novoNome: 'CELNET PLANALTINA DF',
        arquivo: 'CELNET PLANALTINA DF.xlsx',
      })
      .execute()
  },
)
