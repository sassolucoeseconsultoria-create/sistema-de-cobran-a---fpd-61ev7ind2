// Clear / Truncate endpoint for 'movel' and 'residencial' collections
// Fast SQLite truncate/delete in a single transaction instead of loop of DELETE requests
routerAdd(
  'POST',
  '/api/custom/relacionamento/clear',
  (e) => {
    let body = {}
    try {
      const info = e.requestInfo()
      if (info && info.body) {
        const raw = info.body
        if (typeof raw === 'string') {
          try {
            body = JSON.parse(raw)
          } catch (_) {}
        } else if (typeof raw === 'object' && raw !== null) {
          body = raw
        }
      }
    } catch (_) {}

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      try {
        const bound = {}
        e.bindBody(bound)
        if (bound && typeof bound === 'object' && Object.keys(bound).length > 0) {
          body = bound
        }
      } catch (_) {}
    }

    // Also check query param fallback e.g. ?target=movel
    if (!body || !body.target) {
      try {
        const queryTarget = e.requestInfo().query ? e.requestInfo().query.target : ''
        if (queryTarget) {
          if (!body) body = {}
          body.target = queryTarget
        }
      } catch (_) {}
    }

    const target = body.target // 'movel', 'residencial', or 'TODAS'
    console.log('[relacionamento_clear] Recebida solicitação para limpar:', { target: target })

    let movelCount = 0
    let residencialCount = 0

    if (
      !target ||
      target === 'TODAS' ||
      target === 'Móvel' ||
      target === 'movel' ||
      target === 'MOVEL'
    ) {
      try {
        movelCount = $app.countRecords('movel')
      } catch (_) {
        movelCount = 0
      }
      try {
        const colMovel = $app.findCollectionByNameOrId('movel')
        $app.truncateCollection(colMovel)
      } catch (err) {
        // Fallback to direct SQL delete
        try {
          $app.db().newQuery('DELETE FROM movel').execute()
        } catch (sqlErr) {
          console.error('[relacionamento_clear] Erro ao deletar movel via SQL:', sqlErr)
        }
      }
    }

    if (
      !target ||
      target === 'TODAS' ||
      target === 'Residencial' ||
      target === 'residencial' ||
      target === 'RESIDENCIAL'
    ) {
      try {
        residencialCount = $app.countRecords('residencial')
      } catch (_) {
        residencialCount = 0
      }
      try {
        const colRes = $app.findCollectionByNameOrId('residencial')
        $app.truncateCollection(colRes)
      } catch (err) {
        // Fallback to direct SQL delete
        try {
          $app.db().newQuery('DELETE FROM residencial').execute()
        } catch (sqlErr) {
          console.error('[relacionamento_clear] Erro ao deletar residencial via SQL:', sqlErr)
        }
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
