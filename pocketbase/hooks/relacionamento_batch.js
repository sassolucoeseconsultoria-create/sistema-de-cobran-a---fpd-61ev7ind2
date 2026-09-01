// Batch insert endpoint for 'movel' and 'residencial' collections
// Avoids hundreds of individual HTTP POSTs and bypasses PocketBase rate limiter
routerAdd(
  'POST',
  '/api/custom/relacionamento/batch',
  (e) => {
    const body = e.requestInfo().body || {}
    const target = body.collection // 'movel' or 'residencial'
    const rows = body.rows || []

    if (!target || (target !== 'movel' && target !== 'residencial')) {
      return e.json(400, {
        error: "Parâmetro 'collection' inválido. Use 'movel' ou 'residencial'.",
      })
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return e.json(200, { inserted: 0, message: 'Nenhuma linha fornecida.' })
    }

    const collection = $app.findCollectionByNameOrId(target)
    let insertedCount = 0

    // Execute all inserts inside a database transaction for maximum performance and atomic operation
    $app.runInTransaction((txApp) => {
      for (let i = 0; i < rows.length; i++) {
        const item = rows[i]
        const record = new Record(collection)

        record.set('arquivo', item.arquivo ? String(item.arquivo).trim() : '')
        if (item.linha !== undefined && item.linha !== null) {
          record.set('linha', Number(item.linha))
        }
        record.set('loja', item.loja ? String(item.loja).trim() : '')
        record.set('vendedor', item.vendedor ? String(item.vendedor).trim() : '')
        record.set('cliente', item.cliente ? String(item.cliente).trim() : '')
        record.set('dados', item.dados || {})

        if (target === 'residencial' && item.typedFields && typeof item.typedFields === 'object') {
          const keys = Object.keys(item.typedFields)
          for (let k = 0; k < keys.length; k++) {
            const fieldKey = keys[k]
            record.set(fieldKey, item.typedFields[fieldKey])
          }
        }

        txApp.save(record)
        insertedCount++
      }
    })

    return e.json(200, {
      success: true,
      collection: target,
      inserted: insertedCount,
    })
  },
  $apis.requireAuth(),
)
