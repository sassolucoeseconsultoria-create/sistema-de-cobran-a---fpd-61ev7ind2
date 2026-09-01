routerAdd(
  'POST',
  '/api/custom/analytical/clear',
  (e) => {
    let rawBody
    try {
      rawBody = e.requestInfo().body || {}
    } catch (err) {
      rawBody = {}
    }

    const targetAba = rawBody.targetAba || 'TODAS'
    let movelCount = 0
    let residencialCount = 0

    $app.runInTransaction((txApp) => {
      if (targetAba === 'TODAS' || targetAba === 'Móvel') {
        const movelRes = txApp.db().newQuery('DELETE FROM movel').execute()
        if (movelRes && typeof movelRes.rowsAffected === 'function') {
          movelCount = movelRes.rowsAffected()
        }
      }

      if (targetAba === 'TODAS' || targetAba === 'Residencial') {
        const resRes = txApp.db().newQuery('DELETE FROM residencial').execute()
        if (resRes && typeof resRes.rowsAffected === 'function') {
          residencialCount = resRes.rowsAffected()
        }
      }
    })

    return e.json(200, {
      success: true,
      movelCount: movelCount,
      residencialCount: residencialCount,
    })
  },
  $apis.requireAuth(),
)
