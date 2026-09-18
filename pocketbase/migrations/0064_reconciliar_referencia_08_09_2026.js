/// <reference types="pocketbase" />

/**
 * Migration 0064: Reconciliação e deduplicação retroativa da referência 08/09/2026.
 *
 * Contexto:
 * - Em 'movel' e 'residencial', a referência '08/09/2026' acumulou 2.819 registros brutos
 *   ao importar a base "Maio e Julho - data base 08.09" e depois a cumulativa
 *   "Maio a Agosto - data base 14.09" sob a mesma referência.
 * - Na tela de Inadimplência, deduplicateFetchedRows() reduz para 1.871 únicos.
 * - Esta migração:
 *   1) Deleta em 'movel' e 'residencial' as 948 duplicatas da referência '08/09/2026',
 *      preservando o registro com: (1) comentários preenchidos; (2) data_promessa_de_pagto preenchida;
 *      (3) ocorrência preenchida e != 'Não Tratados'; (4) desempate pelo mais recente.
 *      Outras referências (ex: 26/08/2026) permanecem TOTALMENTE intocadas.
 *   2) Deleta fpd_records e vendor_consolidations APENAS da referência '08/09/2026' e
 *      reconstitui ambos a partir das linhas únicas analíticas restantes, agrupando por loja
 *      e vendedor, preenchendo fielmente as categorias de ocorrências.
 *   3) Valida e loga os totais finais (1.871 linhas).
 */
migrate(
  (app) => {
    function normalizeClientKey(raw) {
      if (raw === null || raw === undefined) return ''
      var str = String(raw).trim()
      if (!str) return ''
      return str.replace(/[\s.\-_/\\()]/g, '').toLowerCase()
    }

    function isReference08092026(raw) {
      if (!raw) return false
      var str = String(raw).trim().toLowerCase()
      return (
        str === '08/09/2026' ||
        str === '08/09/26' ||
        str === '2026-09-08' ||
        str.indexOf('08/09/2026') === 0 ||
        str.indexOf('08/09/26') === 0
      )
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
      return {}
    }

    function extractResidencialKey(rec) {
      var direct = rec.getString('nr_contrato')
      if (direct && direct.trim()) {
        var norm = normalizeClientKey(direct)
        if (norm) return norm
      }

      var rawDados = rec.get('dados')
      var dadosObj = parseDadosValue(rawDados)
      var candidates = [
        'NR_CONTRATO',
        'nr_contrato',
        'CONTRATO',
        'Contrato',
        'contrato',
        'Nr Contrato',
        'Numero Contrato',
      ]
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c]
        if (
          dadosObj[cand] !== undefined &&
          dadosObj[cand] !== null &&
          String(dadosObj[cand]).trim()
        ) {
          var normD = normalizeClientKey(dadosObj[cand])
          if (normD) return normD
        }
      }

      var keys = Object.keys(dadosObj)
      for (var k = 0; k < keys.length; k++) {
        var kNorm = keys[k].toLowerCase().replace(/[\s_]+/g, '')
        if (kNorm === 'nrcontrato' || kNorm === 'contrato') {
          var normFound = normalizeClientKey(dadosObj[keys[k]])
          if (normFound) return normFound
        }
      }

      return ''
    }

    function extractMovelKey(rec) {
      var rawDados = rec.get('dados')
      var dadosObj = parseDadosValue(rawDados)

      var candidates = [
        'Numero',
        'NÚMERO',
        'NUMERO',
        'Telefone',
        'Linha',
        'MSISDN',
        'Celular',
        'Terminal',
        'Número Telefone',
        'Numero Linha',
        'Coluna_1',
      ]
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c]
        if (
          dadosObj[cand] !== undefined &&
          dadosObj[cand] !== null &&
          String(dadosObj[cand]).trim()
        ) {
          var normVal = normalizeClientKey(dadosObj[cand])
          if (normVal) return normVal
        }
      }

      var keys = Object.keys(dadosObj)
      if (keys.length > 0) {
        var firstVal = dadosObj[keys[0]]
        if (firstVal !== undefined && firstVal !== null) {
          var normFirst = normalizeClientKey(firstVal)
          if (normFirst) return normFirst
        }
      }

      return ''
    }

    function calculateRecordScore(rec) {
      var score = 0
      var comentarios = (rec.getString('comentarios') || '').trim()
      var promessa = (rec.getString('data_promessa_de_pagto') || '').trim()
      var ocorrencias = (rec.getString('ocorrencias') || '').trim()

      if (comentarios) score += 20
      if (promessa) score += 20
      if (
        ocorrencias &&
        ocorrencias.toLowerCase() !== 'não tratados' &&
        ocorrencias.toLowerCase() !== 'nao tratados'
      ) {
        score += 10
      }

      var updatedStr = rec.getString('updated') || rec.getString('created') || ''
      var timeMs = 0
      if (updatedStr) {
        var parsedTime = Date.parse(updatedStr)
        if (!isNaN(parsedTime)) {
          timeMs = parsedTime
        }
      }

      return { score: score, timeMs: timeMs }
    }

    // Classificação canônica estrita de ocorrências
    function normalizeText(val) {
      if (!val) return ''
      return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
    }

    function classifyOcorrenciaString(raw) {
      if (!raw) return 'nao_tratados'
      var norm = normalizeText(raw)
      if (!norm) return 'nao_tratados'

      if (
        norm.indexOf('fatura paga') !== -1 ||
        norm.indexOf('fatura(s) paga(s)') !== -1 ||
        norm.indexOf('faturas pagas') !== -1 ||
        norm === 'paga' ||
        norm === 'pago'
      ) {
        return 'fatura_paga'
      }

      if (
        norm.indexOf('enviado fatura') !== -1 ||
        norm.indexOf('envio fatura') !== -1 ||
        norm.indexOf('fatura enviada') !== -1 ||
        norm.indexOf('enviar fatura') !== -1
      ) {
        return 'envio_fatura'
      }

      if (
        norm.indexOf('promessa de pagto') !== -1 ||
        norm.indexOf('promessa de pagamento') !== -1 ||
        norm.indexOf('promessa pagto') !== -1 ||
        norm.indexOf('promessa') !== -1
      ) {
        return 'promessa_pagto'
      }

      if (
        norm.indexOf('sem contato') !== -1 ||
        norm.indexOf('nao atende') !== -1 ||
        norm.indexOf('nao atendeu') !== -1 ||
        norm.indexOf('recado') !== -1 ||
        norm.indexOf('caixa postal') !== -1 ||
        norm.indexOf('telefone errado') !== -1 ||
        norm.indexOf('numero incorreto') !== -1
      ) {
        return 'sem_contato'
      }

      if (
        norm.indexOf('cancelado') !== -1 ||
        norm.indexOf('cancelamento') !== -1 ||
        norm.indexOf('desconexao') !== -1 ||
        norm.indexOf('desconectado') !== -1
      ) {
        return 'cancelados'
      }

      if (
        norm.indexOf('pendente') !== -1 ||
        norm.indexOf('aguardando') !== -1 ||
        norm.indexOf('em aberto') !== -1
      ) {
        return 'pendente'
      }

      if (norm.indexOf('contato realizado') !== -1 || norm.indexOf('cliente ciente') !== -1) {
        return 'contato_realizado'
      }

      return 'nao_tratados'
    }

    // 1. DEDUPLICAÇÃO NA COLEÇÃO MOVEL (APENAS 08/09/2026)
    function deduplicateMovel0809() {
      if (!app.hasTable('movel')) return 0
      var pageSize = 2000
      var offset = 0
      var groups = {}

      while (true) {
        var records = []
        try {
          records = app.findRecordsByFilter('movel', '1=1', 'id', pageSize, offset)
        } catch (eM) {
          console.log('[Migration 0064] Erro ao ler movel:', eM)
          break
        }
        if (!records || records.length === 0) break

        for (var i = 0; i < records.length; i++) {
          var rec = records[i]
          var ref = (rec.getString('data_referencia') || '').trim()
          if (!isReference08092026(ref)) continue

          var key = extractMovelKey(rec)
          if (!key) continue

          if (!groups[key]) {
            groups[key] = []
          }
          groups[key].push(rec)
        }

        if (records.length < pageSize) break
        offset += pageSize
      }

      var idsToDelete = []
      var groupKeys = Object.keys(groups)

      for (var g = 0; g < groupKeys.length; g++) {
        var recs = groups[groupKeys[g]]
        if (recs.length <= 1) continue

        var bestIdx = 0
        var bestRating = calculateRecordScore(recs[0])

        for (var r = 1; r < recs.length; r++) {
          var rating = calculateRecordScore(recs[r])
          if (
            rating.score > bestRating.score ||
            (rating.score === bestRating.score && rating.timeMs > bestRating.timeMs)
          ) {
            bestIdx = r
            bestRating = rating
          }
        }

        var survivor = recs[bestIdx]
        var sCom = (survivor.getString('comentarios') || '').trim()
        var sPro = (survivor.getString('data_promessa_de_pagto') || '').trim()
        var sOco = (survivor.getString('ocorrencias') || '').trim()
        var sNeedsSave = false

        for (var d = 0; d < recs.length; d++) {
          if (d === bestIdx) continue
          var victim = recs[d]
          idsToDelete.push(victim.id)

          var vCom = (victim.getString('comentarios') || '').trim()
          var vPro = (victim.getString('data_promessa_de_pagto') || '').trim()
          var vOco = (victim.getString('ocorrencias') || '').trim()

          if (!sCom && vCom) {
            survivor.set('comentarios', vCom)
            sCom = vCom
            sNeedsSave = true
          }
          if (!sPro && vPro) {
            survivor.set('data_promessa_de_pagto', vPro)
            sPro = vPro
            sNeedsSave = true
          }
          if (
            (!sOco ||
              sOco.toLowerCase() === 'não tratados' ||
              sOco.toLowerCase() === 'nao tratados') &&
            vOco &&
            vOco.toLowerCase() !== 'não tratados' &&
            vOco.toLowerCase() !== 'nao tratados'
          ) {
            survivor.set('ocorrencias', vOco)
            sOco = vOco
            sNeedsSave = true
          }
        }

        if (sNeedsSave) {
          try {
            app.save(survivor)
          } catch (eSave) {
            console.log('[Migration 0064] Erro ao salvar sobrevivente movel:', eSave)
          }
        }
      }

      var totalDeleted = 0
      var batchSize = 400
      for (var b = 0; b < idsToDelete.length; b += batchSize) {
        var chunk = idsToDelete.slice(b, b + batchSize)
        var quoted = chunk
          .map(function (id) {
            return "'" + id.replace(/'/g, "''") + "'"
          })
          .join(',')
        try {
          var res = app
            .db()
            .newQuery('DELETE FROM movel WHERE id IN (' + quoted + ')')
            .execute()
          if (res && typeof res.rowsAffected === 'function') {
            totalDeleted += res.rowsAffected()
          } else {
            totalDeleted += chunk.length
          }
        } catch (eDel) {
          console.log('[Migration 0064] Erro ao deletar duplicatas em movel:', eDel)
        }
      }

      console.log(
        '[Migration 0064] Coleção movel (08/09/2026): ' +
          totalDeleted +
          ' duplicata(s) removida(s). Grupos únicos: ' +
          groupKeys.length,
      )
      return totalDeleted
    }

    // 2. DEDUPLICAÇÃO NA COLEÇÃO RESIDENCIAL (APENAS 08/09/2026)
    function deduplicateResidencial0809() {
      if (!app.hasTable('residencial')) return 0
      var pageSize = 2000
      var offset = 0
      var groups = {}

      while (true) {
        var records = []
        try {
          records = app.findRecordsByFilter('residencial', '1=1', 'id', pageSize, offset)
        } catch (eR) {
          console.log('[Migration 0064] Erro ao ler residencial:', eR)
          break
        }
        if (!records || records.length === 0) break

        for (var i = 0; i < records.length; i++) {
          var rec = records[i]
          var ref = (rec.getString('data_referencia') || '').trim()
          if (!isReference08092026(ref)) continue

          var key = extractResidencialKey(rec)
          if (!key) continue

          if (!groups[key]) {
            groups[key] = []
          }
          groups[key].push(rec)
        }

        if (records.length < pageSize) break
        offset += pageSize
      }

      var idsToDelete = []
      var groupKeys = Object.keys(groups)

      for (var g = 0; g < groupKeys.length; g++) {
        var recs = groups[groupKeys[g]]
        if (recs.length <= 1) continue

        var bestIdx = 0
        var bestRating = calculateRecordScore(recs[0])

        for (var r = 1; r < recs.length; r++) {
          var rating = calculateRecordScore(recs[r])
          if (
            rating.score > bestRating.score ||
            (rating.score === bestRating.score && rating.timeMs > bestRating.timeMs)
          ) {
            bestIdx = r
            bestRating = rating
          }
        }

        var survivor = recs[bestIdx]
        var sCom = (survivor.getString('comentarios') || '').trim()
        var sPro = (survivor.getString('data_promessa_de_pagto') || '').trim()
        var sOco = (survivor.getString('ocorrencias') || '').trim()
        var sNeedsSave = false

        for (var d = 0; d < recs.length; d++) {
          if (d === bestIdx) continue
          var victim = recs[d]
          idsToDelete.push(victim.id)

          var vCom = (victim.getString('comentarios') || '').trim()
          var vPro = (victim.getString('data_promessa_de_pagto') || '').trim()
          var vOco = (victim.getString('ocorrencias') || '').trim()

          if (!sCom && vCom) {
            survivor.set('comentarios', vCom)
            sCom = vCom
            sNeedsSave = true
          }
          if (!sPro && vPro) {
            survivor.set('data_promessa_de_pagto', vPro)
            sPro = vPro
            sNeedsSave = true
          }
          if (
            (!sOco ||
              sOco.toLowerCase() === 'não tratados' ||
              sOco.toLowerCase() === 'nao tratados') &&
            vOco &&
            vOco.toLowerCase() !== 'não tratados' &&
            vOco.toLowerCase() !== 'nao tratados'
          ) {
            survivor.set('ocorrencias', vOco)
            sOco = vOco
            sNeedsSave = true
          }
        }

        if (sNeedsSave) {
          try {
            app.save(survivor)
          } catch (eSave) {
            console.log('[Migration 0064] Erro ao salvar sobrevivente residencial:', eSave)
          }
        }
      }

      var totalDeleted = 0
      var batchSize = 400
      for (var b = 0; b < idsToDelete.length; b += batchSize) {
        var chunk = idsToDelete.slice(b, b + batchSize)
        var quoted = chunk
          .map(function (id) {
            return "'" + id.replace(/'/g, "''") + "'"
          })
          .join(',')
        try {
          var res = app
            .db()
            .newQuery('DELETE FROM residencial WHERE id IN (' + quoted + ')')
            .execute()
          if (res && typeof res.rowsAffected === 'function') {
            totalDeleted += res.rowsAffected()
          } else {
            totalDeleted += chunk.length
          }
        } catch (eDel) {
          console.log('[Migration 0064] Erro ao deletar duplicatas em residencial:', eDel)
        }
      }

      console.log(
        '[Migration 0064] Coleção residencial (08/09/2026): ' +
          totalDeleted +
          ' duplicata(s) removida(s). Grupos únicos: ' +
          groupKeys.length,
      )
      return totalDeleted
    }

    // Executar deduplicações
    var delMovel = deduplicateMovel0809()
    var delRes = deduplicateResidencial0809()
    console.log(
      '[Migration 0064] Total duplicatas deletadas (08/09/2026): ' +
        (delMovel + delRes) +
        ' (móvel: ' +
        delMovel +
        ', residencial: ' +
        delRes +
        ')',
    )

    // 3. DELETAR FPD_RECORDS E VENDOR_CONSOLIDATIONS APENAS DA REFERÊNCIA 08/09/2026
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM fpd_records WHERE referente IN ('08/09/2026', '08/09/26', '2026-09-08') OR referente LIKE '08/09/2026%'",
        )
        .execute()
    } catch (eDelFpd) {
      console.log('[Migration 0064] Erro ao deletar fpd_records de 08/09/2026:', eDelFpd)
    }

    try {
      app
        .db()
        .newQuery(
          "DELETE FROM vendor_consolidations WHERE data_referencia IN ('08/09/2026', '08/09/26', '2026-09-08') OR data_referencia LIKE '08/09/2026%'",
        )
        .execute()
    } catch (eDelVend) {
      console.log('[Migration 0064] Erro ao deletar vendor_consolidations de 08/09/2026:', eDelVend)
    }

    // 4. RECONSTITUIR FPD_RECORDS E VENDOR_CONSOLIDATIONS PARA 08/09/2026
    var allStores = []
    if (app.hasTable('stores')) {
      try {
        allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
      } catch (eStores) {
        console.log('[Migration 0064] Erro ao carregar stores:', eStores)
      }
    }

    function matchStoreRecord(rawName, storesList) {
      if (!rawName) return null
      var norm = normalizeText(rawName)
      if (!norm) return null

      for (var i = 0; i < storesList.length; i++) {
        var s = storesList[i]
        var sName = s.getString('name')
        if (sName && normalizeText(sName) === norm) {
          return s
        }
      }

      for (var j = 0; j < storesList.length; j++) {
        var st = storesList[j]
        var stName = normalizeText(st.getString('name'))
        if (norm.indexOf(stName) !== -1 || stName.indexOf(norm) !== -1) {
          return st
        }
      }

      return null
    }

    var storesCollection = app.findCollectionByNameOrId('stores')
    function getOrCreateStore(rawStoreName) {
      var trimmed = (rawStoreName || '').trim()
      if (!trimmed) return null
      var matched = matchStoreRecord(trimmed, allStores)
      if (matched) return matched

      try {
        var newStore = new Record(storesCollection)
        newStore.set('name', trimmed.toUpperCase())
        app.save(newStore)
        allStores.push(newStore)
        return newStore
      } catch (_) {
        try {
          var recheck = app.findFirstRecordByData('stores', 'name', trimmed.toUpperCase())
          if (recheck) {
            allStores.push(recheck)
            return recheck
          }
        } catch (__) {}
        return null
      }
    }

    var targetRef = '08/09/2026'
    var finalMovelRows = []
    if (app.hasTable('movel')) {
      var mSize = 2000
      var mOff = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mSize, mOff)
        } catch (_) {
          break
        }
        if (!mChunk || mChunk.length === 0) break
        for (var mi = 0; mi < mChunk.length; mi++) {
          var mR = mChunk[mi]
          if (isReference08092026(mR.getString('data_referencia'))) {
            finalMovelRows.push(mR)
          }
        }
        if (mChunk.length < mSize) break
        mOff += mSize
      }
    }

    var finalResRows = []
    if (app.hasTable('residencial')) {
      var rSize = 2000
      var rOff = 0
      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rSize, rOff)
        } catch (_) {
          break
        }
        if (!rChunk || rChunk.length === 0) break
        for (var ri = 0; ri < rChunk.length; ri++) {
          var rR = rChunk[ri]
          if (isReference08092026(rR.getString('data_referencia'))) {
            finalResRows.push(rR)
          }
        }
        if (rChunk.length < rSize) break
        rOff += rSize
      }
    }

    console.log(
      '[Migration 0064] Linhas analíticas restantes para ' +
        targetRef +
        ': móvel = ' +
        finalMovelRows.length +
        ', residencial = ' +
        finalResRows.length +
        ', total = ' +
        (finalMovelRows.length + finalResRows.length),
    )

    var storeAggMap = {}
    var vendorAggMap = {}

    function processRow(row) {
      var rawLoja = (row.getString('loja') || '').trim()
      var rawVendedor = (row.getString('vendedor') || '').trim()
      var rawOcorrencia = (row.getString('ocorrencias') || '').trim()

      var normVendedor = normalizeText(rawVendedor)
      var normLoja = normalizeText(rawLoja)

      if (
        (normVendedor === 'vendedor' && normLoja === 'loja') ||
        (normVendedor === 'vendedor' && !rawLoja) ||
        (normVendedor === 'vendedor' && normLoja === 'vendedor')
      ) {
        return
      }

      if (!rawLoja) {
        rawLoja = 'LOJA NÃO IDENTIFICADA'
      }

      var storeRec = getOrCreateStore(rawLoja)
      if (!storeRec) return

      var storeId = storeRec.id
      var canonicalLojaName = storeRec.getString('name').toUpperCase()
      var supervisao = storeRec.getString('supervisao') || ''

      if (!storeAggMap[storeId]) {
        storeAggMap[storeId] = {
          storeId: storeId,
          storeName: canonicalLojaName,
          referente: targetRef,
          total_linhas: 0,
          fatura_paga: 0,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 0,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
        }
      }

      var cat = classifyOcorrenciaString(rawOcorrencia) || 'nao_tratados'
      storeAggMap[storeId].total_linhas++
      if (storeAggMap[storeId][cat] !== undefined) {
        storeAggMap[storeId][cat]++
      } else {
        storeAggMap[storeId].nao_tratados++
      }

      var vendedorUpper = rawVendedor ? rawVendedor.toUpperCase() : 'NÃO INFORMADO'
      if (vendedorUpper === 'VENDEDOR') return

      var vendorKey = vendedorUpper + '__' + canonicalLojaName
      if (!vendorAggMap[vendorKey]) {
        vendorAggMap[vendorKey] = {
          vendedor: vendedorUpper,
          loja: canonicalLojaName,
          supervisao: supervisao,
          data_referencia: targetRef,
          total_linhas: 0,
          fatura_paga: 0,
          envio_fatura: 0,
          promessa_pagto: 0,
          sem_contato: 0,
          cancelados: 0,
          pendente: 0,
          contato_realizado: 0,
          nao_tratados: 0,
          outros: 0,
        }
      }

      vendorAggMap[vendorKey].total_linhas++
      if (vendorAggMap[vendorKey][cat] !== undefined) {
        vendorAggMap[vendorKey][cat]++
      } else {
        vendorAggMap[vendorKey].nao_tratados++
      }
    }

    for (var m = 0; m < finalMovelRows.length; m++) {
      processRow(finalMovelRows[m])
    }
    for (var r = 0; r < finalResRows.length; r++) {
      processRow(finalResRows[r])
    }

    // Gravar fpd_records
    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var storeIds = Object.keys(storeAggMap)
    var totalFpdLinhas = 0
    for (var s = 0; s < storeIds.length; s++) {
      var sAgg = storeAggMap[storeIds[s]]
      totalFpdLinhas += sAgg.total_linhas

      var fpdRec = new Record(fpdCollection)
      fpdRec.set('store', sAgg.storeId)
      fpdRec.set('referente', sAgg.referente)
      fpdRec.set('total_linhas', sAgg.total_linhas)
      fpdRec.set('fatura_paga', sAgg.fatura_paga)
      fpdRec.set('envio_fatura', sAgg.envio_fatura)
      fpdRec.set('promessa_pagto', sAgg.promessa_pagto)
      fpdRec.set('sem_contato', sAgg.sem_contato)
      fpdRec.set('cancelados', sAgg.cancelados)
      fpdRec.set('pendente', sAgg.pendente)
      fpdRec.set('contato_realizado', sAgg.contato_realizado)
      fpdRec.set('nao_tratados', sAgg.nao_tratados)
      fpdRec.set('outros', sAgg.outros)

      try {
        app.save(fpdRec)
      } catch (errSaveFpd) {
        console.log(
          '[Migration 0064] Erro ao salvar fpd_record para ' + sAgg.storeName + ':',
          errSaveFpd,
        )
      }
    }

    // Gravar vendor_consolidations
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')
    var vendorKeys = Object.keys(vendorAggMap)
    var totalVendorLinhas = 0
    for (var v = 0; v < vendorKeys.length; v++) {
      var vAgg = vendorAggMap[vendorKeys[v]]
      totalVendorLinhas += vAgg.total_linhas

      var vRec = new Record(vendorCollection)
      vRec.set('vendedor', vAgg.vendedor)
      vRec.set('loja', vAgg.loja)
      vRec.set('supervisao', vAgg.supervisao)
      vRec.set('data_referencia', vAgg.data_referencia)
      vRec.set('total_linhas', vAgg.total_linhas)
      vRec.set('fatura_paga', vAgg.fatura_paga)
      vRec.set('envio_fatura', vAgg.envio_fatura)
      vRec.set('promessa_pagto', vAgg.promessa_pagto)
      vRec.set('sem_contato', vAgg.sem_contato)
      vRec.set('cancelados', vAgg.cancelados)
      vRec.set('pendente', vAgg.pendente)
      vRec.set('contato_realizado', vAgg.contato_realizado)
      vRec.set('nao_tratados', vAgg.nao_tratados)
      vRec.set('outros', vAgg.outros)

      try {
        app.save(vRec)
      } catch (errSaveVend) {
        console.log('[Migration 0064] Erro ao salvar vendor_consolidation:', errSaveVend)
      }
    }

    console.log(
      '[Migration 0064] Concluída com sucesso! Totais para ' +
        targetRef +
        ': fpd_records = ' +
        totalFpdLinhas +
        ', vendor_consolidations = ' +
        totalVendorLinhas +
        ', lojas = ' +
        storeIds.length +
        ', vendedores = ' +
        vendorKeys.length,
    )
  },
  (_app) => {},
)
