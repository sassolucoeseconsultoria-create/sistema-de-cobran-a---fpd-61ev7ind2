routerAdd(
  'POST',
  '/api/custom/residencial/batch',
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

    let colResidencial
    try {
      colResidencial = $app.findCollectionByNameOrId('residencial')
    } catch (err) {
      return e.json(500, { error: 'Collection residencial não encontrada' })
    }

    let inserted = 0
    const errors = []

    const KNOWN_RESIDENCIAL_KEYS = [
      'nr_ano_mes',
      'data_instalacao',
      'nm_mercado',
      'nm_marca',
      'cod_municipio',
      'canal',
      'produto_atual',
      'nm_indicador_negocio',
      'nm_tipo_ass_domicilio',
      'uf',
      'nm_visao_analise',
      'nm_linha_negocio',
      'nm_cidade',
      'nm_bairro',
      'parceiro_resumido',
      'cod_amx',
      'coordenador',
      'executivo',
      'nr_contrato',
      'dsc_status_contrato',
      'dat_vencimento',
      'dat_pagamento',
      'vlr_total',
      'vlr_pago',
      'vlr_aberto',
      'nm_forma_pagamento',
      'nr_cep',
      'qtde_instalada',
      'fatura',
      'devendo',
      'data_relatorio',
      'qtd_dias_pag_x_venc',
      'indicador',
      'pago',
      'preventiva_fpd',
      'virou_fpd',
      'nao_vencidas',
      'indefinido',
      'desprezar',
      'qtd_dias_venc_x_data_atual',
      'canal_2',
      'bcc_tipo_rede',
      'coordenador_2',
      'cpf',
      'fone',
      'ocorrencias',
      'data_promessa_de_pagto',
      'comentarios',
      'data_referencia',
    ]

    $app.runInTransaction((txApp) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {}
        try {
          const record = new Record(colResidencial)
          record.set('arquivo', item.arquivo ? String(item.arquivo).trim() : '')
          if (item.linha !== undefined && item.linha !== null) {
            record.set('linha', Number(item.linha) || 0)
          }
          record.set('loja', item.loja ? String(item.loja).trim() : '')
          record.set('vendedor', item.vendedor ? String(item.vendedor).trim() : '')
          record.set('cliente', item.cliente ? String(item.cliente).trim() : '')
          record.set('dados', item.dados && typeof item.dados === 'object' ? item.dados : {})
          if (item.data_referencia) {
            record.set('data_referencia', String(item.data_referencia).trim())
          }

          // Set typed fields if provided
          if (item.typedFields && typeof item.typedFields === 'object') {
            for (let k = 0; k < KNOWN_RESIDENCIAL_KEYS.length; k++) {
              const key = KNOWN_RESIDENCIAL_KEYS[k]
              if (item.typedFields[key] !== undefined && item.typedFields[key] !== null) {
                record.set(key, String(item.typedFields[key]).trim())
              }
            }
          }

          // Ensure default ocorrencias is 'Não Tratados' if empty
          const currentOcorr = record.getString('ocorrencias')
          if (!currentOcorr || currentOcorr.trim() === '' || currentOcorr === 'Pendente') {
            record.set('ocorrencias', 'Não Tratados')
          }

          txApp.save(record)
          inserted++
        } catch (saveErr) {
          const errMsg = saveErr && saveErr.message ? saveErr.message : String(saveErr)
          const fileInfo = item.arquivo ? "arquivo '" + item.arquivo + "'" : 'arquivo desconhecido'
          const lineInfo =
            item.linha !== undefined && item.linha !== null ? ', linha ' + item.linha : ''
          errors.push('[Residencial] ' + fileInfo + lineInfo + ': ' + errMsg)
          throw saveErr
        }
      }
    })

    return e.json(200, { inserted: inserted, errors: errors })
  },
  $apis.requireAuth(),
)
