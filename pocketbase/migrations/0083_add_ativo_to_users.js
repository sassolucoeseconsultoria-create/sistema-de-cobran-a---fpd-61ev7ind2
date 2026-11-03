migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Adiciona campo 'ativo' caso não exista ainda
    if (!users.fields.getByName('ativo')) {
      users.fields.add(
        new BoolField({
          name: 'ativo',
          required: false,
        }),
      )
    }

    app.save(users)

    // Inicializa todos os usuários existentes como ativos (ativo = 1)
    app.db().newQuery('UPDATE users SET ativo = 1 WHERE ativo IS NULL').execute()
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const ativoField = users.fields.getByName('ativo')
    if (ativoField) {
      users.fields.removeByName('ativo')
    }
    app.save(users)
  },
)
