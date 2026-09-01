// Batch insert endpoint for 'movel' and 'residencial' collections
// Avoids hundreds of individual HTTP POSTs and bypasses PocketBase rate limiter
routerAdd(
  'POST',
  '/api/custom/relacionamento/batch',
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
      console.error('[relacionamento_batch] Erro ao parsear JSON do corpo da requisição:', parseErr)
      return e.json(400, {
        error: 'Corpo da requisição inválido (JSON esperado).',
      })
    }

    // Secondary fallback with bindBody if body is still empty
    if (!body || Object.keys(body).length === 0) {
      try {
        const bound = {}
        e.bindBody(bound)
        if (bound && Object.keys(bound).length > 0) {
          body = bound
        }
      } catch (_) {}
    }

    const target = body.collection // 'movel' or 'residencial'
    const rows = body.rows || []

    console.log('[relacionamento_batch] Recebida requisição:', {
      target: target,
      rowCount: Array.isArray(rows) ? rows.length : 0,
    })

    if (!target || (target !== 'movel' && target !== 'residencial')) {
      console.warn('[relacionamento_batch] Parâmetro target inválido:', target)
      return e.json(400, {
        error: "Parâmetro 'collection' inválido. Use 'movel' ou 'residencial'.",
      })
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return e.json(200, {
        success: true,
        collection: target,
        inserted: 0,
        message: 'Nenhuma linha fornecida.',
      })
    }

    let insertedCount = 0

    try {
      const collection = $app.findCollectionByNameOrId(target)

      // Execute all inserts inside a single database transaction for maximum performance and atomic operation
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

          if (
            target === 'residencial' &&
            item.typedFields &&
            typeof item.typedFields === 'object'
          ) {
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

      console.log('[relacionamento_batch] Inserção concluída com sucesso:', {
        target: target,
        inserted: insertedCount,
      })

      return e.json(200, {
        success: true,
        collection: target,
        inserted: insertedCount,
      })
    } catch (saveErr) {
      console.error('[relacionamento_batch] Erro durante transação de inserção:', saveErr)
      return e.json(500, {
        error: 'Erro interno ao gravar lote no banco de dados: ' + String(saveErr),
      })
    }
  },
  $apis.requireAuth(),
)
