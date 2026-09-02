migrate(
  (app) => {
    // Garante emailVisibility = 1 (true) para todos os usuários existentes
    app
      .db()
      .newQuery(
        'UPDATE users SET emailVisibility = 1 WHERE emailVisibility = 0 OR emailVisibility IS NULL',
      )
      .execute()
  },
  (app) => {
    // Revert opcional (mantém como estava)
  },
)
