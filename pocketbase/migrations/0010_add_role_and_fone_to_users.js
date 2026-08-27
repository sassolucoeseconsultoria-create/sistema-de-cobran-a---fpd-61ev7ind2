migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Add role field (enum: ADM, GESTOR, ANALISTA, default ANALISTA)
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['ADM', 'GESTOR', 'ANALISTA'],
          maxSelect: 1,
        }),
      )
    }

    // Add fone field (text)
    if (!users.fields.getByName('fone')) {
      users.fields.add(
        new TextField({
          name: 'fone',
          required: false,
        }),
      )
    }

    app.save(users)

    // Update default role to 'ANALISTA' for existing users that don't have a role set
    app
      .db()
      .newQuery("UPDATE users SET role = 'ANALISTA' WHERE role IS NULL OR role = ''")
      .execute()

    // Update mind3adm@gmail.com to ADM
    try {
      const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'mind3adm@gmail.com')
      adminUser.set('role', 'ADM')
      app.save(adminUser)
    } catch (_) {
      // If user not found, try by username/data query
      try {
        const adminUser2 = app.findFirstRecordByData(
          '_pb_users_auth_',
          'email',
          'mind3adm@gmail.com',
        )
        adminUser2.set('role', 'ADM')
        app.save(adminUser2)
      } catch (err) {
        console.log('Admin user update note:', err)
      }
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = users.fields.getByName('role')
    if (roleField) {
      users.fields.removeByName('role')
    }
    const foneField = users.fields.getByName('fone')
    if (foneField) {
      users.fields.removeByName('fone')
    }
    app.save(users)
  },
)
