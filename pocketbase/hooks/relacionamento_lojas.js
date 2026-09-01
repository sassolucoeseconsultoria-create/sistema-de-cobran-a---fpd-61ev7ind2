// Fast distinct lojas endpoint for analytical tables
// Queries distinct lojas directly from SQLite index in 1ms instead of fetching thousands of records
routerAdd(
  'GET',
  '/api/custom/relacionamento/lojas',
  (e) => {
    const lojasSet = {}

    try {
      const rowsMovel = $app
        .db()
        .newQuery(
          "SELECT DISTINCT loja FROM movel WHERE loja IS NOT NULL AND loja != '' ORDER BY loja ASC",
        )
        .all()
      for (let i = 0; i < rowsMovel.length; i++) {
        const name = rowsMovel[i].loja
        if (name && typeof name === 'string' && name.trim()) {
          lojasSet[name.trim()] = true
        }
      }
    } catch (err) {
      // Ignore if table not ready
    }

    try {
      const rowsRes = $app
        .db()
        .newQuery(
          "SELECT DISTINCT loja FROM residencial WHERE loja IS NOT NULL AND loja != '' ORDER BY loja ASC",
        )
        .all()
      for (let i = 0; i < rowsRes.length; i++) {
        const name = rowsRes[i].loja
        if (name && typeof name === 'string' && name.trim()) {
          lojasSet[name.trim()] = true
        }
      }
    } catch (err) {
      // Ignore
    }

    const list = Object.keys(lojasSet).sort()

    return e.json(200, {
      lojas: list,
    })
  },
  $apis.requireAuth(),
)
