migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    users.listRule = "@request.auth.role = 'ADM'"
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'ADM'"
    users.createRule = "@request.auth.role = 'ADM'"
    users.updateRule = "id = @request.auth.id || @request.auth.role = 'ADM'"
    users.deleteRule = "id = @request.auth.id || @request.auth.role = 'ADM'"

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'

    app.save(users)
  },
)
