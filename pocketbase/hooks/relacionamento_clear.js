// Clear / Truncate endpoint for 'movel' and 'residencial' collections
// Fast SQLite truncate/delete in a single transaction instead of loop of DELETE requests
routerAdd(
  'POST',
  '/api/custom/relacionamento/clear',
  (e) => {
    let body = {}
    try {
      const rawBody = e.requestInfo().body
      if (rawBody) {
        if (typeof rawBody === 'string') {
          body = JSON.parse(rawBody)
        } else if (typeof rawBody === 'object') {
          body = rawBody
        }
      }
    } catch (parseErr) {
      console.error('[relacionamento_clear] Erro ao parsear JSON do corpo da requisição:', parseErr)
    }

    if (!body || Object.keys(body).length === 0) {
      try {
        const bound = {}
        e.bindBody(bound)
        if (bound && Object.keys(bound).length > 0) {
          body = bound
        }
      } catch (_) {}
    }

    const target = body.target // 'movel', 'residencial', or 'TODAS'
    console.log('[relacionamento_clear] Recebida solicitação para limpar:', { target: target })

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

    console.log('[relacionamento_clear] Limpeza finalizada:', {
      movelCount: movelCount,
      residencialCount: residencialCount,
    })

    return e.json(200, {
      success: true,
      movelCount: movelCount,
      residencialCount: residencialCount,
    })
  },
  $apis.requireAuth(),
)
