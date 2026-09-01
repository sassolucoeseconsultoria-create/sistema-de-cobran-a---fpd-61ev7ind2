// Clear / Truncate endpoint for 'movel' and 'residencial' collections
// Fast SQLite truncate/delete in a single transaction instead of loop of DELETE requests
routerAdd(
  'POST',
  '/api/custom/relacionamento/clear',
  (e) => {
    const body = e.requestInfo().body || {}
    const target = body.target // 'movel', 'residencial', or 'TODAS'

    let movelCount = 0
    let residencialCount = 0

    if (!target || target === 'TODAS' || target === 'Móvel' || target === 'movel') {
      try {
        const colMovel = $app.findCollectionByNameOrId('movel')
        movelCount = $app.countRecords('movel')
        $app.truncateCollection(colMovel)
      } catch (err) {
        // Fallback to SQL delete
        $app.db().newQuery('DELETE FROM movel').execute()
      }
    }

    if (!target || target === 'TODAS' || target === 'Residencial' || target === 'residencial') {
      try {
        const colRes = $app.findCollectionByNameOrId('residencial')
        residencialCount = $app.countRecords('residencial')
        $app.truncateCollection(colRes)
      } catch (err) {
        // Fallback to SQL delete
        $app.db().newQuery('DELETE FROM residencial').execute()
      }
    }

    return e.json(200, {
      success: true,
      movelCount: movelCount,
      residencialCount: residencialCount,
    })
  },
  $apis.requireAuth(),
)
