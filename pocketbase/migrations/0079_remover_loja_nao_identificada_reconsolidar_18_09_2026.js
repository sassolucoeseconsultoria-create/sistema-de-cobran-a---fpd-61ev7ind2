/// <reference types="pocketbase" />

/**
 * Migration 0079: Eliminar a store espúria 'LOJA NÃO IDENTIFICADA' (id: za7f4q5qmwqr5gu),
 * remover todos os seus fpd_records em qualquer referência, e reconsolidar
 * a referência 18/09/2026 estritamente para as 33 lojas legítimas.
 *
 * Idempotente: execuções subsequentes não falham nem criam duplicações.
 */
migrate(
  (app) => {
    function normalizeText(str) {
      if (!str) return ''
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function normalizeDigits(str) {
      if (str === null || str === undefined) return ''
      return String(str).replace(/\D/g, '')
    }

    function normalizeReferenceDate(rawStr) {
      if (!rawStr) return ''
      var str = String(rawStr).trim()
      if (!str) return ''

      // Formato YYYY-MM-DD
      var isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (isoMatch) {
        var y = parseInt(isoMatch[1], 10)
        var m = parseInt(isoMatch[2], 10)
        var d = parseInt(isoMatch[3], 10)
        var dd = d < 10 ? '0' + d : '' + d
        var mm = m < 10 ? '0' + m : '' + m
        return dd + '/' + mm + '/' + y
      }

      // Formato DD/MM/YYYY ou DD/MM/YY
      var dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var day = parseInt(dmyMatch[1], 10)
        var month = parseInt(dmyMatch[2], 10)
        var year = parseInt(dmyMatch[3], 10)
        if (year < 100) year += 2000
        var dayStr = day < 10 ? '0' + day : '' + day
        var monthStr = month < 10 ? '0' + month : '' + month
        return dayStr + '/' + monthStr + '/' + year
      }

      return str
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
        var norm = direct.replace(/[\s.\-_/\\()]/g, '').toLowerCase()
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
          var normD = String(dadosObj[cand])
            .replace(/[\s.\-_/\\()]/g, '')
            .toLowerCase()
          if (normD) return normD
        }
      }

      var keys = Object.keys(dadosObj)
      for (var k = 0; k < keys.length; k++) {
        var kNorm = keys[k].toLowerCase().replace(/[\s_]+/g, '')
        if (kNorm === 'nrcontrato' || kNorm === 'contrato') {
          var normFound = String(dadosObj[keys[k]])
            .replace(/[\s.\-_/\\()]/g, '')
            .toLowerCase()
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
          var dig = normalizeDigits(dadosObj[cand])
          if (dig) return dig
        }
      }

      var keys = Object.keys(dadosObj)
      if (keys.length > 0) {
        var firstVal = dadosObj[keys[0]]
        if (firstVal !== undefined && firstVal !== null) {
          var digFirst = normalizeDigits(firstVal)
          if (digFirst) return digFirst
        }
      }

      return ''
    }

    function stripCelnetPrefix(str) {
      if (!str) return ''
      return str.replace(/^celnet\s+/, '').trim()
    }

    function matchStoreRecord(inputName, storesList) {
      if (!inputName || !storesList || storesList.length === 0) return null
      var inputNorm = normalizeText(inputName)
      if (!inputNorm) return null

      // Ignorar fallback literal ou não identificado
      if (inputNorm.indexOf('nao identificada') !== -1) return null

      var isCallInput = /\bcall\b/.test(inputNorm)
      var isIlhaInput = /\bilha\b/.test(inputNorm)
      var hasDfInput = /\bdf\b/.test(inputNorm)
      var hasGoInput = /\bgo\b/.test(inputNorm)

      var isClassCompatible = function (sNorm) {
        var isCallStore = /\bcall\b/.test(sNorm)
        var isIlhaStore = /\bilha\b/.test(sNorm)
        if (isCallInput !== isCallStore) return false
        if (isIlhaInput !== isIlhaStore) return false

        var hasDfStore = /\bdf\b/.test(sNorm)
        var hasGoStore = /\bgo\b/.test(sNorm)
        if ((hasDfInput && hasGoStore) || (hasGoInput && hasDfStore)) {
          return false
        }
        return true
      }

      // 1. Match exato (com ou sem prefixo CELNET)
      var inputWithoutCelnet = stripCelnetPrefix(inputNorm)
      var exactCandidates = []
      for (var i = 0; i < storesList.length; i++) {
        var s = storesList[i]
        var sNorm = normalizeText(s.getString('name'))
        if (!isClassCompatible(sNorm)) continue

        var sWithoutCelnet = stripCelnetPrefix(sNorm)
        if (sNorm === inputNorm) {
          exactCandidates.push(s)
        } else if (
          inputWithoutCelnet &&
          sWithoutCelnet &&
          (sNorm === inputWithoutCelnet ||
            sWithoutCelnet === inputNorm ||
            sWithoutCelnet === inputWithoutCelnet)
        ) {
          exactCandidates.push(s)
        }
      }

      if (exactCandidates.length === 1) {
        return exactCandidates[0]
      } else if (exactCandidates.length > 1) {
        for (var ec = 0; ec < exactCandidates.length; ec++) {
          if (normalizeText(exactCandidates[ec].getString('name')) === inputNorm) {
            return exactCandidates[ec]
          }
        }
        return null
      }

      // 2. Substring nos dois sentidos com unicidade estrita
      var substringCandidates = []
      for (var j = 0; j < storesList.length; j++) {
        var s2 = storesList[j]
        var sNorm2 = normalizeText(s2.getString('name'))
        if (!isClassCompatible(sNorm2)) continue

        var sWithoutCelnet2 = stripCelnetPrefix(sNorm2)
        var matches =
          inputNorm.indexOf(sNorm2) !== -1 ||
          sNorm2.indexOf(inputNorm) !== -1 ||
          (inputWithoutCelnet.length >= 3 &&
            sWithoutCelnet2.length >= 3 &&
            (inputWithoutCelnet.indexOf(sWithoutCelnet2) !== -1 ||
              sWithoutCelnet2.indexOf(inputWithoutCelnet) !== -1))

        if (matches) {
          substringCandidates.push(s2)
        }
      }

      if (substringCandidates.length === 1) {
        return substringCandidates[0]
      } else if (substringCandidates.length > 1) {
        return null
      }

      return null
    }

    function classifyOcorrenciaString(rawVal) {
      if (rawVal === null || rawVal === undefined) return 'nao_tratados'
      var norm = normalizeText(rawVal)
      if (!norm) return 'nao_tratados'

      if (
        norm.indexOf('paga') !== -1 ||
        norm.indexOf('pago') !== -1 ||
        norm.indexOf('quitad') !== -1 ||
        norm.indexOf('liquidad') !== -1 ||
        norm === 'pago 1' ||
        norm === '1'
      ) {
        return 'fatura_paga'
      }

      if (
        norm.indexOf('enviad') !== -1 ||
        norm.indexOf('envio') !== -1 ||
        norm.indexOf('2 via') !== -1 ||
        norm.indexOf('2a via') !== -1
      ) {
        return 'envio_fatura'
      }

      if (norm.indexOf('promessa') !== -1) {
        return 'promessa_pagto'
      }

      if (
        norm.indexOf('sem contato') !== -1 ||
        norm.indexOf('nao atende') !== -1 ||
        norm.indexOf('nao atendeu') !== -1 ||
        norm.indexOf('caixa postal') !== -1 ||
        norm.indexOf('recusad') !== -1 ||
        norm.indexOf('desligad') !== -1 ||
        norm.indexOf('telefone errado') !== -1 ||
        norm.indexOf('numero incorreto') !== -1
      ) {
        return 'sem_contato'
      }

      if (
        norm.indexOf('cancel') !== -1 ||
        norm.indexOf('fraude') !== -1 ||
        norm.indexOf('desist') !== -1 ||
        norm.indexOf('devolv') !== -1 ||
        norm.indexOf('desconect') !== -1
      ) {
        return 'cancelados'
      }

      if (
        norm.indexOf('pendente') !== -1 ||
        norm.indexOf('em analise') !== -1 ||
        norm.indexOf('em tratativa') !== -1 ||
        norm.indexOf('aguardando') !== -1 ||
        norm.indexOf('preventiva fpd') !== -1 ||
        norm.indexOf('virou fpd') !== -1 ||
        norm.indexOf('em aberto') !== -1
      ) {
        return 'pendente'
      }

      if (
        norm.indexOf('contato realizado') !== -1 ||
        norm.indexOf('contato') !== -1 ||
        norm.indexOf('atendid') !== -1 ||
        norm.indexOf('falou') !== -1 ||
        norm.indexOf('cliente ciente') !== -1 ||
        norm.indexOf('recado') !== -1
      ) {
        return 'contato_realizado'
      }

      if (
        norm.indexOf('nao tratado') !== -1 ||
        norm.indexOf('nao tratada') !== -1 ||
        norm.indexOf('naotratado') !== -1 ||
        norm.indexOf('nao trabalh') !== -1 ||
        norm.indexOf('a tratar') !== -1 ||
        norm.indexOf('sem tratamento') !== -1
      ) {
        return 'nao_tratados'
      }

      return 'nao_tratados'
    }

    console.log('[Migration 0079] Iniciando limpeza da loja espúria e fpd_records...')

    // 1. Remover registros de fpd_records vinculados à loja espúria za7f4q5qmwqr5gu ou a qualquer loja "não identificada"
    var spuriousStoreId = 'za7f4q5qmwqr5gu'
    try {
      app
        .db()
        .newQuery("DELETE FROM fpd_records WHERE store = '" + spuriousStoreId + "'")
        .execute()
      console.log('[Migration 0079] fpd_records da store za7f4q5qmwqr5gu deletados via SQL.')
    } catch (eFpdDel) {
      console.log('[Migration 0079] Erro ao deletar fpd_records da store espúria:', eFpdDel)
    }

    // 2. Apagar a loja espúria da coleção stores
    try {
      var spuriousStoreRec = null
      try {
        spuriousStoreRec = app.findRecordById('stores', spuriousStoreId)
      } catch (_) {}

      if (spuriousStoreRec) {
        app.delete(spuriousStoreRec)
        console.log('[Migration 0079] Store espúria ' + spuriousStoreId + ' deletada com sucesso.')
      } else {
        // Tentar via SQL caso já não exista como record do PocketBase
        app
          .db()
          .newQuery("DELETE FROM stores WHERE id = '" + spuriousStoreId + "'")
          .execute()
        console.log('[Migration 0079] Store espúria ' + spuriousStoreId + ' garantida ausente.')
      }
    } catch (eStoreDel) {
      console.log('[Migration 0079] Erro ao deletar store espúria:', eStoreDel)
    }

    // Também remover qualquer outra store espúria com nome LOJA NÃO IDENTIFICADA se houver
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM stores WHERE UPPER(name) LIKE '%NAO IDENTIFICADA%' OR UPPER(name) LIKE '%NÃO IDENTIFICADA%'",
        )
        .execute()
    } catch (_) {}

    // 3. Carregar as 33 lojas legítimas cadastradas
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter(
        'stores',
        "name !~ 'IDENTIFICADA' && id != '" + spuriousStoreId + "'",
        'name',
        200,
        0,
      )
    } catch (errStores) {
      console.log('[Migration 0079] Erro ao carregar stores legítimas:', errStores)
    }
    console.log('[Migration 0079] Lojas legítimas encontradas: ' + allStores.length)

    // 4. Reconsolidar a referência 18/09/2026 para as lojas legítimas
    var TARGET_REF = '18/09/2026'
    console.log('[Migration 0079] Reconsolidando referência ' + TARGET_REF + '...')

    // Ler linhas de Móvel da referência 18/09/2026
    var movelRowsRaw = []
    if (app.hasTable('movel')) {
      var mSize = 2000
      var mOff = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter(
            'movel',
            "data_referencia ~ '" + TARGET_REF + "'",
            'id',
            mSize,
            mOff,
          )
        } catch (eM) {
          console.log('[Migration 0079] Erro ao buscar movel:', eM)
          break
        }
        if (!mChunk || mChunk.length === 0) break
        for (var mi = 0; mi < mChunk.length; mi++) {
          var canRefM = normalizeReferenceDate(mChunk[mi].getString('data_referencia'))
          if (canRefM === TARGET_REF) {
            movelRowsRaw.push(mChunk[mi])
          }
        }
        if (mChunk.length < mSize) break
        mOff += mSize
      }
    }
    console.log('[Migration 0079] Linhas brutas de móvel para 18/09/2026: ' + movelRowsRaw.length)

    // Ler linhas de Residencial da referência 18/09/2026
    var resRowsRaw = []
    if (app.hasTable('residencial')) {
      var rSize = 2000
      var rOff = 0
      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter(
            'residencial',
            "data_referencia ~ '" + TARGET_REF + "'",
            'id',
            rSize,
            rOff,
          )
        } catch (eR) {
          console.log('[Migration 0079] Erro ao buscar residencial:', eR)
          break
        }
        if (!rChunk || rChunk.length === 0) break
        for (var ri = 0; ri < rChunk.length; ri++) {
          var canRefR = normalizeReferenceDate(rChunk[ri].getString('data_referencia'))
          if (canRefR === TARGET_REF) {
            resRowsRaw.push(rChunk[ri])
          }
        }
        if (rChunk.length < rSize) break
        rOff += rSize
      }
    }
    console.log(
      '[Migration 0079] Linhas brutas de residencial para 18/09/2026: ' + resRowsRaw.length,
    )

    // Deduplicação canônica fiel
    var seenMovelKeys = {}
    var dedupedMovel = []
    for (var dmi = 0; dmi < movelRowsRaw.length; dmi++) {
      var mItem = movelRowsRaw[dmi]
      var mKey = extractMovelKey(mItem)
      if (!mKey) {
        dedupedMovel.push(mItem)
        continue
      }
      if (seenMovelKeys[mKey]) continue
      seenMovelKeys[mKey] = true
      dedupedMovel.push(mItem)
    }

    var seenResKeys = {}
    var dedupedRes = []
    for (var dri = 0; dri < resRowsRaw.length; dri++) {
      var rItem = resRowsRaw[dri]
      var rKey = extractResidencialKey(rItem)
      if (!rKey) {
        dedupedRes.push(rItem)
        continue
      }
      if (seenResKeys[rKey]) continue
      seenResKeys[rKey] = true
      dedupedRes.push(rItem)
    }

    console.log(
      '[Migration 0079] Ref ' +
        TARGET_REF +
        ': Móvel deduplicado = ' +
        dedupedMovel.length +
        ', Residencial deduplicado = ' +
        dedupedRes.length,
    )

    // Agrupamento estrito por loja legítima
    var storeAggMap = {} // storeId -> aggData
    var vendorAggMap = {} // vendorKey -> aggData
    var unassignedCount = 0

    var processUnifiedRow = function (row) {
      var rawLoja = (row.getString('loja') || '').trim()
      var rawVendedor = (row.getString('vendedor') || '').trim()
      var rawOco = (row.getString('ocorrencias') || '').trim()

      var normV = normalizeText(rawVendedor)
      var normL = normalizeText(rawLoja)

      if (
        (normV === 'vendedor' && normL === 'loja') ||
        (normV === 'vendedor' && !rawLoja) ||
        (normV === 'vendedor' && normL === 'vendedor')
      ) {
        return
      }

      // Regra inegociável: célula vazia ou não reconhecida é IGNORADA para agregação por loja
      if (!rawLoja) {
        unassignedCount++
        return
      }

      var storeRec = matchStoreRecord(rawLoja, allStores)
      if (!storeRec) {
        unassignedCount++
        return
      }

      var storeId = storeRec.id
      var canonicalLojaName = storeRec.getString('name').toUpperCase()

      var supervisao = storeRec.getString('supervisao') || ''
      if (!supervisao) {
        if (canonicalLojaName.indexOf('CELNET CALL') === 0) {
          supervisao = 'Karen'
        } else if (
          canonicalLojaName.indexOf('CELNET ILHA RESID. GAMA DF') !== -1 ||
          canonicalLojaName.indexOf('CELNET ILHA RESIDENCIAL GAMA DF') !== -1
        ) {
          supervisao = 'Karen'
        } else if (canonicalLojaName === 'CELNET ILHA RESIDENCIAL') {
          supervisao = 'Lucas Diniz'
        }
      }

      if (!storeAggMap[storeId]) {
        storeAggMap[storeId] = {
          storeId: storeId,
          storeName: canonicalLojaName,
          referente: TARGET_REF,
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

      var cat = classifyOcorrenciaString(rawOco) || 'nao_tratados'
      storeAggMap[storeId].total_linhas++
      if (storeAggMap[storeId][cat] !== undefined) {
        storeAggMap[storeId][cat]++
      } else {
        storeAggMap[storeId].nao_tratados++
      }

      var vendUpper = rawVendedor ? rawVendedor.toUpperCase() : 'NÃO INFORMADO'
      if (vendUpper === 'VENDEDOR') vendUpper = 'NÃO INFORMADO'

      var vendorKey = vendUpper + '__' + canonicalLojaName
      if (!vendorAggMap[vendorKey]) {
        vendorAggMap[vendorKey] = {
          vendedor: vendUpper,
          loja: canonicalLojaName,
          supervisao: supervisao,
          data_referencia: TARGET_REF,
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

    for (var pm = 0; pm < dedupedMovel.length; pm++) {
      processUnifiedRow(dedupedMovel[pm])
    }
    for (var pr = 0; pr < dedupedRes.length; pr++) {
      processUnifiedRow(dedupedRes[pr])
    }

    console.log(
      '[Migration 0079] Linhas analíticas sem loja identificada (não agregadas): ' +
        unassignedCount,
    )

    // 5. Apagar TODOS os fpd_records e vendor_consolidations existentes da referência 18/09/2026
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM fpd_records WHERE referente = '" +
            TARGET_REF +
            "' OR referente = '" +
            TARGET_REF +
            " '",
        )
        .execute()
      app
        .db()
        .newQuery(
          "DELETE FROM vendor_consolidations WHERE data_referencia = '" +
            TARGET_REF +
            "' OR data_referencia = '" +
            TARGET_REF +
            " '",
        )
        .execute()
      console.log('[Migration 0079] Registros antigos de 18/09/2026 removidos para reescrita.')
    } catch (eCleanRef) {
      console.log('[Migration 0079] Erro ao limpar ref 18/09/2026:', eCleanRef)
    }

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')

    // 6. Gravar fpd_records para as lojas legítimas que possuem linhas agregadas
    var storeIds = Object.keys(storeAggMap)
    console.log(
      '[Migration 0079] Gravando fpd_records para ' + storeIds.length + ' lojas legítimas...',
    )
    for (var si = 0; si < storeIds.length; si++) {
      var sAgg = storeAggMap[storeIds[si]]
      var fpdRec = new Record(fpdCollection)
      fpdRec.set('store', sAgg.storeId)
      fpdRec.set('referente', TARGET_REF)
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
      } catch (eSaveFpd) {
        console.log('[Migration 0079] Erro ao salvar fpd_record:', eSaveFpd)
      }
    }

    // 7. Gravar vendor_consolidations da referência 18/09/2026
    var vendorKeys = Object.keys(vendorAggMap)
    console.log(
      '[Migration 0079] Gravando vendor_consolidations para ' +
        vendorKeys.length +
        ' vendedores...',
    )
    for (var vi = 0; vi < vendorKeys.length; vi++) {
      var vAgg = vendorAggMap[vendorKeys[vi]]
      var vRec = new Record(vendorCollection)
      vRec.set('vendedor', vAgg.vendedor)
      vRec.set('loja', vAgg.loja)
      vRec.set('supervisao', vAgg.supervisao)
      vRec.set('data_referencia', TARGET_REF)
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
      } catch (eSaveVend) {
        console.log('[Migration 0079] Erro ao salvar vendor_consolidation:', eSaveVend)
      }
    }

    console.log(
      '[Migration 0079] Concluída com sucesso! Total lojas consolidadas para ' +
        TARGET_REF +
        ': ' +
        storeIds.length +
        ' (espúria eliminada).',
    )
  },
  (_app) => {},
)
