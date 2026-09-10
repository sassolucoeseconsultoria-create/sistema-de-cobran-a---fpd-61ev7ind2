/// <reference types="pocketbase" />

/**
 * Migration 0040: Reclassificar ocorrências e recalcular totais para importação
 * em Lote Residencial de 08/09/2026 ("Preventiva FPD Safra de Maio-Julho-26 - base 08-09-26.xlsx [LOTE RESIDENCIAL]").
 *
 * Trata o campo 'dados' em formato string JSON, raw bytes array (goja slice) ou objeto.
 * Se houver indicador de pagamento ou qualquer outra ocorrência canônica identificada nas chaves
 * ou valores de 'dados' (ex: "fatura", "pago", "indicador", "preventiva fpd", "dsc_status_contrato"),
 * reclassifica 'ocorrencias' com fidelidade.
 * Recalcula totais por loja (total_linhas, fatura_paga, envio_fatura, promessa_pagto,
 * sem_contato, cancelados, pendente, contato_realizado, nao_tratados) e sincroniza
 * imported_files e fpd_records.
 */
migrate(
  (app) => {
    function normalizeText(str) {
      if (!str) return ''
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\r\n\t_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function parseDadosValue(raw) {
      if (!raw) return {}
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw
      }
      var str = ''
      if (Array.isArray(raw)) {
        for (var i = 0; i < raw.length; i++) {
          str += String.fromCharCode(raw[i])
        }
      } else if (typeof raw === 'string') {
        str = raw
      } else {
        str = String(raw)
      }

      try {
        var parsed = JSON.parse(str)
        if (parsed && typeof parsed === 'object') {
          return parsed
        }
      } catch (_) {}

      return { __raw_string__: str }
    }

    function classifyValue(rawVal) {
      if (rawVal === null || rawVal === undefined) return null
      var norm = normalizeText(rawVal)
      if (!norm) return null

      // 1. Enviado fatura
      if (
        norm.includes('enviad') ||
        norm.includes('envio') ||
        norm.includes('2 via') ||
        norm.includes('2a via')
      ) {
        return 'Enviado Fatura(s)'
      }

      // 2. Promessa de Pagto.
      if (norm.includes('promessa')) {
        return 'Promessa de Pagto.'
      }

      // 3. Fatura(s) Paga(s)
      if (
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad')
      ) {
        return 'Fatura(s) Paga(s)'
      }

      // 4. Sem Contato
      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('caixa postal') ||
        norm.includes('recusad') ||
        norm.includes('desligad')
      ) {
        return 'Sem Contato'
      }

      // 5. Cancelados
      if (
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv')
      ) {
        return 'Cancelados'
      }

      // 6. Pendente
      if (
        norm.includes('pendente') ||
        norm.includes('em analise') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando')
      ) {
        return 'Pendente'
      }

      // 7. Contato Realizado
      if (
        norm.includes('contato') ||
        norm.includes('atendid') ||
        norm.includes('falou') ||
        norm.includes('recado')
      ) {
        return 'Contato Realizado'
      }

      // 8. Não Tratados
      if (
        norm.includes('nao tratado') ||
        norm.includes('nao tratada') ||
        norm.includes('naotratado') ||
        norm.includes('nao trabalh') ||
        norm.includes('a tratar') ||
        norm.includes('sem tratamento')
      ) {
        return 'Não Tratados'
      }

      return null
    }

    if (!app.hasTable('residencial')) {
      return
    }

    // Buscar registros da base de 08/09/2026 em residencial
    var records = []
    try {
      records = app.findRecordsByFilter(
        'residencial',
        "data_referencia = '08/09/2026'",
        'linha',
        10000,
        0,
      )
    } catch (errFind) {
      console.log(
        '0040: Nenhum registro residencial com data_referencia = 08/09/2026 encontrado:',
        errFind,
      )
      return
    }

    if (!records || records.length === 0) {
      return
    }

    console.log('0040: Processando ' + records.length + ' registros residencial de 08/09/2026...')

    // Reclassificar ocorrências registro a registro
    for (var i = 0; i < records.length; i++) {
      var record = records[i]
      var currentOcorrencia = record.getString('ocorrencias')
      var dadosObj = parseDadosValue(record.get('dados'))
      var keys = Object.keys(dadosObj)

      var newOcorrencia = null

      // Prioridade 1: se as colunas específicas de status indicam algo
      // (fatura, pago, indicador, preventiva_fpd, dsc_status_contrato)
      var faturaVal = record.getString('fatura') || dadosObj['FATURA'] || dadosObj['fatura']
      var pagoVal =
        record.get('pago') !== undefined
          ? record.get('pago')
          : dadosObj['PAGO'] !== undefined
            ? dadosObj['PAGO']
            : dadosObj['pago']
      var vlrPagoVal =
        record.get('vlr_pago') !== undefined
          ? record.get('vlr_pago')
          : dadosObj['VLR PAGO'] || dadosObj['VLR_PAGO']
      var indicadorVal =
        record.getString('indicador') || dadosObj['INDICADOR'] || dadosObj['indicador']
      var dscStatusVal =
        record.getString('dsc_status_contrato') ||
        dadosObj['DSC_STATUS_CONTRATO'] ||
        dadosObj['dsc_status_contrato']

      if (
        (faturaVal && classifyValue(faturaVal) === 'Fatura(s) Paga(s)') ||
        (pagoVal !== null &&
          pagoVal !== undefined &&
          (pagoVal === 1 || pagoVal === '1' || pagoVal === true)) ||
        (vlrPagoVal && Number(vlrPagoVal) > 0)
      ) {
        newOcorrencia = 'Fatura(s) Paga(s)'
      }

      // Prioridade 2: Procurar chaves que contenham 'ocorren' no JSON
      if (!newOcorrencia) {
        for (var kIdx = 0; kIdx < keys.length; kIdx++) {
          var k = keys[kIdx]
          var normKey = normalizeText(k)
          if (normKey.includes('ocorren')) {
            var classified = classifyValue(dadosObj[k])
            if (classified) {
              newOcorrencia = classified
              break
            } else if (dadosObj[k] && String(dadosObj[k]).trim() !== '') {
              newOcorrencia = String(dadosObj[k]).trim()
              break
            }
          }
        }
      }

      // Prioridade 3: Procurar chaves de status / indicador / preventiva fpd
      if (!newOcorrencia) {
        var candidateTerms = [
          'indicador',
          'preventiva fpd',
          'dsc status contrato',
          'status contrato',
          'status cobranca',
          'substatus',
          'situacao',
          'status',
          'motivo',
        ]
        for (var tIdx = 0; tIdx < candidateTerms.length; tIdx++) {
          var term = candidateTerms[tIdx]
          for (var kIdx2 = 0; kIdx2 < keys.length; kIdx2++) {
            var k2 = keys[kIdx2]
            var normKey2 = normalizeText(k2)
            if (normKey2 === term || normKey2.includes(term)) {
              var classified2 = classifyValue(dadosObj[k2])
              if (classified2) {
                newOcorrencia = classified2
                break
              }
            }
          }
          if (newOcorrencia) break
        }
      }

      // Prioridade 4: Checar dscStatusVal ou indicadorVal
      if (!newOcorrencia && dscStatusVal) {
        var classifiedStatus = classifyValue(dscStatusVal)
        if (classifiedStatus) newOcorrencia = classifiedStatus
      }
      if (!newOcorrencia && indicadorVal) {
        var classifiedIndicador = classifyValue(indicadorVal)
        if (classifiedIndicador) newOcorrencia = classifiedIndicador
      }

      // Se encontrou nova ocorrência e difere da atual, persistir
      if (newOcorrencia && newOcorrencia !== currentOcorrencia) {
        record.set('ocorrencias', newOcorrencia)
        app.save(record)
      }
    }

    // Recalcular totais por loja em residencial para data_referencia = '08/09/2026'
    // E atualizar imported_files e fpd_records de forma consistente
    var refreshedRecords = app.findRecordsByFilter(
      'residencial',
      "data_referencia = '08/09/2026'",
      'linha',
      10000,
      0,
    )

    // Agrupar contagens por loja
    var storeTotals = {}
    for (var rIdx = 0; rIdx < refreshedRecords.length; rIdx++) {
      var r = refreshedRecords[rIdx]
      var lojaName = (r.getString('loja') || '').trim().toUpperCase()
      if (!lojaName) lojaName = 'LOJA NÃO IDENTIFICADA'

      if (!storeTotals[lojaName]) {
        storeTotals[lojaName] = {
          total_linhas: 0,
          fatura_paga: 0,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 0,
          contato_realizado: 0,
          nao_tratados: 0,
        }
      }

      var oc = r.getString('ocorrencias') || ''
      storeTotals[lojaName].total_linhas++

      if (oc === 'Fatura(s) Paga(s)') storeTotals[lojaName].fatura_paga++
      else if (oc === 'Enviado Fatura(s)') storeTotals[lojaName].envio_fatura++
      else if (oc === 'Promessa de Pagto.') storeTotals[lojaName].promessa_pagto++
      else if (oc === 'Sem Contato') storeTotals[lojaName].sem_contato++
      else if (oc === 'Cancelados') storeTotals[lojaName].cancelados++
      else if (oc === 'Pendente') storeTotals[lojaName].pendente++
      else if (oc === 'Contato Realizado') storeTotals[lojaName].contato_realizado++
      else storeTotals[lojaName].nao_tratados++
    }

    // Atualizar imported_files
    if (app.hasTable('imported_files')) {
      try {
        var importedFiles = app.findRecordsByFilter(
          'imported_files',
          "reference_date = '08/09/2026' && file_name ~ 'RESIDENCIAL'",
          'created',
          500,
          0,
        )

        for (var ifIdx = 0; ifIdx < importedFiles.length; ifIdx++) {
          var ifRec = importedFiles[ifIdx]
          var ifStoreName = (ifRec.getString('store_name') || '').trim().toUpperCase()
          var totals = storeTotals[ifStoreName]
          if (totals) {
            ifRec.set('total_linhas', totals.total_linhas)
            ifRec.set('fatura_paga', totals.fatura_paga)
            ifRec.set('envio_fatura', totals.envio_fatura)
            ifRec.set('enviado_faturas', totals.envio_fatura)
            ifRec.set('promessa_pagto', totals.promessa_pagto)
            ifRec.set('sem_contato', totals.sem_contato)
            ifRec.set('cancelados', totals.cancelados)
            ifRec.set('pendente', totals.pendente)
            ifRec.set('contato_realizado', totals.contato_realizado)
            ifRec.set('nao_tratados', totals.nao_tratados)
            app.save(ifRec)
          }
        }
      } catch (errIF) {
        console.log('0040: Erro ao atualizar imported_files:', errIF)
      }
    }

    // Atualizar fpd_records
    if (app.hasTable('fpd_records') && app.hasTable('stores')) {
      try {
        var storeKeys = Object.keys(storeTotals)
        for (var sIdx = 0; sIdx < storeKeys.length; sIdx++) {
          var sName = storeKeys[sIdx]
          var sTotals = storeTotals[sName]
          try {
            var storeRec = app.findFirstRecordByData('stores', 'name', sName)
            if (storeRec) {
              var fpdRec = null
              try {
                var found = app.findRecordsByFilter(
                  'fpd_records',
                  "referente = '08/09/2026' && store = '" + storeRec.id + "'",
                  'created',
                  1,
                  0,
                )
                if (found && found.length > 0) {
                  fpdRec = found[0]
                }
              } catch (_) {}

              if (fpdRec) {
                fpdRec.set('total_linhas', sTotals.total_linhas)
                fpdRec.set('fatura_paga', sTotals.fatura_paga)
                fpdRec.set('envio_fatura', sTotals.envio_fatura)
                fpdRec.set('promessa_pagto', sTotals.promessa_pagto)
                fpdRec.set('sem_contato', sTotals.sem_contato)
                fpdRec.set('cancelados', sTotals.cancelados)
                fpdRec.set('pendente', sTotals.pendente)
                fpdRec.set('contato_realizado', sTotals.contato_realizado)
                fpdRec.set('nao_tratados', sTotals.nao_tratados)
                app.save(fpdRec)
              }
            }
          } catch (_) {}
        }
      } catch (errFPD) {
        console.log('0040: Erro ao atualizar fpd_records:', errFPD)
      }
    }

    console.log('0040: Concluído com sucesso.')
  },
  (_app) => {},
)
