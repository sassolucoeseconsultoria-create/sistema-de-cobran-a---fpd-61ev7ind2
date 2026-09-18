migrate(
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'mind3adm@gmail.com')
      record.setPassword('Tpv@02042552')
      app.save(record)
    } catch (_) {
      // Idempotente: se o usuário não existir, não faz nada e não falha
    }
  },
  (app) => {
    // Reversão opcional (não reverte para senha anterior específica se desconhecida)
  },
)
