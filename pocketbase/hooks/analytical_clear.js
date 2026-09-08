routerAdd(
  'POST',
  '/backend/v1/custom/analytical/clear',
  (e) => {
    let rawBody
    try {
      rawBody = e.requestInfo().body || {}
    } catch (err) {
      rawBody = {}
    }

    const targetAba = rawBody.targetAba || 'TODAS'
    const loja = rawBody.loja || ''
    const lojas = Array.isArray(rawBody.lojas) ? rawBody.lojas : []
    let movelCount = 0
    let residencialCount = 0
    let relacionamentoCount = 0

    $app.runInTransaction((txApp) => {
      // Se lojas específicas foram fornecidas para exclusão
      if (lojas.length > 0 || (loja && loja !== 'TODAS')) {
        const storeList = lojas.length > 0 ? lojas : [loja]
        const conditions = []
        const params = {}

        storeList.forEach((storeName, index) => {
          const pName = 's' + index
          params[pName] = storeName
          conditions.push(`loja = {:${pName}}`)
          if (storeName.toUpperCase().includes('AGUAS CLARA')) {
            conditions.push(`loja = 'CELNET AGUAS CLARAS'`)
            conditions.push(`loja = 'CELNET AGUAS CLARA'`)
            conditions.push(`loja = 'CELNET ÁGUAS CLARAS'`)
            conditions.push(`loja = 'CELNET ÁGUAS CLARA'`)
            conditions.push(`arquivo = 'CELNET AGUAS CLARAS.xlsx'`)
          }
          if (
            storeName.toUpperCase().includes('PLANALTINA DF') ||
            storeName.toUpperCase().includes('MATRIZ PLANALTINA')
          ) {
            conditions.push(
              `(loja = 'CELNET PLANALTINA DF' OR loja = 'CELNET MATRIZ PLANALTINA DF' OR loja = 'CELNET PLANALTINA' OR loja = 'MATRIZ PLANALTINA DF') AND loja NOT LIKE '%PLANALTINA%GO%'`,
            )
            conditions.push(`arquivo = 'CELNET PLANALTINA DF.xlsx'`)
          }
        })
        const whereSql = `WHERE (${conditions.join(' OR ')})`

        if (targetAba === 'TODAS' || targetAba === 'Móvel') {
          const q = txApp.db().newQuery(`DELETE FROM movel ${whereSql}`)
          Object.keys(params).forEach((k) => q.bind({ [k]: params[k] }))
          const movelRes = q.execute()
          if (movelRes && typeof movelRes.rowsAffected === 'function') {
            movelCount = movelRes.rowsAffected()
          }
        }

        if (targetAba === 'TODAS' || targetAba === 'Residencial') {
          const q = txApp.db().newQuery(`DELETE FROM residencial ${whereSql}`)
          Object.keys(params).forEach((k) => q.bind({ [k]: params[k] }))
          const resRes = q.execute()
          if (resRes && typeof resRes.rowsAffected === 'function') {
            residencialCount = resRes.rowsAffected()
          }
        }

        if (txApp.hasTable('relacionamento')) {
          const q = txApp.db().newQuery(`DELETE FROM relacionamento ${whereSql}`)
          Object.keys(params).forEach((k) => q.bind({ [k]: params[k] }))
          const relRes = q.execute()
          if (relRes && typeof relRes.rowsAffected === 'function') {
            relacionamentoCount = relRes.rowsAffected()
          }
        }
      } else {
        // Exclusão total
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

        if (txApp.hasTable('relacionamento')) {
          const relRes = txApp.db().newQuery('DELETE FROM relacionamento').execute()
          if (relRes && typeof relRes.rowsAffected === 'function') {
            relacionamentoCount = relRes.rowsAffected()
          }
        }
      }
    })

    return e.json(200, {
      success: true,
      movelCount: movelCount,
      residencialCount: residencialCount,
      relacionamentoCount: relacionamentoCount,
    })
  },
  $apis.requireAuth(),
)
