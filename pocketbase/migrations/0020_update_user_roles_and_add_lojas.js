migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const stores = app.findCollectionByNameOrId('stores')

    // 1. Update existing role values in SQLite database before changing the SelectField values:
    // 'GESTOR' -> 'Coordenador'
    // 'ANALISTA' -> 'Supervisor'
    app.db().newQuery("UPDATE users SET role = 'Coordenador' WHERE role = 'GESTOR'").execute()
    app.db().newQuery("UPDATE users SET role = 'Supervisor' WHERE role = 'ANALISTA'").execute()

    // 2. Update role field values to ['ADM', 'Coordenador', 'Supervisor', 'Gerente']
    const roleField = users.fields.getByName('role')
    if (roleField) {
      roleField.values = ['ADM', 'Coordenador', 'Supervisor', 'Gerente']
      roleField.maxSelect = 1
    } else {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['ADM', 'Coordenador', 'Supervisor', 'Gerente'],
          maxSelect: 1,
        }),
      )
    }

    // 3. Add 'lojas' relation field to users collection (stores relation, multiple)
    if (!users.fields.getByName('lojas')) {
      users.fields.add(
        new RelationField({
          name: 'lojas',
          collectionId: stores.id,
          cascadeDelete: false,
          required: false,
          maxSelect: 999,
        }),
      )
    }

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Revert role values
    app.db().newQuery("UPDATE users SET role = 'GESTOR' WHERE role = 'Coordenador'").execute()
    app
      .db()
      .newQuery("UPDATE users SET role = 'ANALISTA' WHERE role = 'Supervisor' OR role = 'Gerente'")
      .execute()

    const roleField = users.fields.getByName('role')
    if (roleField) {
      roleField.values = ['ADM', 'GESTOR', 'ANALISTA']
      roleField.maxSelect = 1
    }

    const lojasField = users.fields.getByName('lojas')
    if (lojasField) {
      users.fields.removeByName('lojas')
    }

    app.save(users)
  },
)
