migrate(
  (app) => {
    // Delete all records from movel and residencial collections via SQL
    if (app.hasTable('movel')) {
      app.db().newQuery('DELETE FROM movel').execute()
    }
    if (app.hasTable('residencial')) {
      app.db().newQuery('DELETE FROM residencial').execute()
    }
  },
  (_app) => {
    // Data deletion cannot be automatically reverted
  },
)
