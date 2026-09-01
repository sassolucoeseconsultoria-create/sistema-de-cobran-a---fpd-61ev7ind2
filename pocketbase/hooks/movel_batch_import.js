routerAdd(
  'POST',
  '/api/custom/movel/batch',
  (e) => {
    let rawBody
    try {
      rawBody = e.requestInfo().body
    } catch (err) {
      return e.json(400, { error: 'Corpo da requisição inválido' })
    }

    const items = rawBody && Array.isArray(rawBody.items) ? rawBody.items : []
    if (items.length === 0) {
      return e.json(200, { inserted: 0, errors: [] })
    }

    let colMovel
    try {
      colMovel = $app.findCollectionByNameOrId('movel')
    } catch (err) {
      return e.json(500, { error: 'Collection movel não encontrada' })
    }

    let inserted = 0
    const errors = []

    $app.runInTransaction((txApp) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {}
        try {
          const record = new Record(colMovel)
          record.set('arquivo', item.arquivo ? String(item.arquivo).trim() : '')
          if (item.linha !== undefined && item.linha !== null) {
            record.set('linha', Number(item.linha) || 0)
          }
          record.set('loja', item.loja ? String(item.loja).trim() : '')
          record.set('vendedor', item.vendedor ? String(item.vendedor).trim() : '')
          record.set('cliente', item.cliente ? String(item.cliente).trim() : '')
          record.set('dados', item.dados && typeof item.dados === 'object' ? item.dados : {})
          record.set(
            'ocorrencias',
            item.ocorrencias ? String(item.ocorrencias).trim() : 'Não Tratados',
          )
          if (item.data_promessa_de_pagto) {
            record.set('data_promessa_de_pagto', String(item.data_promessa_de_pagto).trim())
          }
          if (item.comentarios) {
            record.set('comentarios', String(item.comentarios).trim())
          }

          txApp.save(record)
          inserted++
        } catch (saveErr) {
          const errMsg = saveErr && saveErr.message ? saveErr.message : String(saveErr)
          const fileInfo = item.arquivo ? "arquivo '" + item.arquivo + "'" : 'arquivo desconhecido'
          const lineInfo =
            item.linha !== undefined && item.linha !== null ? ', linha ' + item.linha : ''
          errors.push('[Móvel] ' + fileInfo + lineInfo + ': ' + errMsg)
          throw saveErr
        }
      }
    })

    return e.json(200, { inserted: inserted, errors: errors })
  },
  $apis.requireAuth(),
)
