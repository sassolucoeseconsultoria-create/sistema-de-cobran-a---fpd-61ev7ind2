migrate(
  (app) => {
    // Definir ativo = 1 (true) para todos os usuários atuais da base
    app.db().newQuery('UPDATE users SET ativo = 1').execute()
  },
  (app) => {
    // no-op
  },
)
