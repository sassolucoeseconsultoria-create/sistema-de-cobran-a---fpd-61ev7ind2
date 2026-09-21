/// <reference types="pocketbase" />

/**
 * Migration 0073: Reconstruir fpd_records e vendor_consolidations para TODAS as referências
 * com paginação completa (batch 2000 em loop até esgotar), deduplicação fiel e isolamento estrito.
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

    function matchStoreRecord(inputName, storesList) {
      if (!inputName || !storesList || storesList.length === 0) return null
      var inputNorm = normalizeText(inputName)
      if (!inputNorm) return null

      // 1. Match exato normalizado
      for (var i = 0; i < storesList.length; i++) {
        var s = storesList[i]
        if (normalizeText(s.getString('name')) === inputNorm) {
          return s
        }
      }

      var isCallOrIlhaInput = /\b(call|ilha)\b/.test(inputNorm)
      var hasDfInput = /\bdf\b/.test(inputNorm)
      var hasGoInput = /\bgo\b/.test(inputNorm)

      // 2. Contains match com isolamento estrito de CALL/ILHA e DF vs GO
      for (var j = 0; j < storesList.length; j++) {
        var s2 = storesList[j]
        var sNorm = normalizeText(s2.getString('name'))
        var isCallOrIlhaStore = /\b(call|ilha)\b/.test(sNorm)
        if (isCallOrIlhaInput !== isCallOrIlhaStore) continue

        var hasDfStore = /\bdf\b/.test(sNorm)
        var hasGoStore = /\bgo\b/.test(sNorm)
        if ((hasDfInput && hasGoStore) || (hasGoInput && hasDfStore)) continue

        if (inputNorm.includes(sNorm) || sNorm.includes(inputNorm)) {
          return s2
        }
      }

      // 3. Simplified match (removendo ruído: shopping, goiania, celnet, boullevard)
      var simplify = function (t) {
        return normalizeText(
          t
            .replace(/\bboullevard\b/g, 'boulevard')
            .replace(/\bshopping\b/g, '')
            .replace(/\bgoiania\b/g, '')
            .replace(/\bcelnet\b/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        )
      }

      var inSimp = simplify(inputNorm)
      if (inSimp.length >= 2) {
        for (var k = 0; k < storesList.length; k++) {
          var s3 = storesList[k]
          var sNorm3 = normalizeText(s3.getString('name'))
          var isCallOrIlhaStore3 = /\b(call|ilha)\b/.test(sNorm3)
          if (isCallOrIlhaInput !== isCallOrIlhaStore3) continue

          var sSimp = simplify(sNorm3)
          if (sSimp === inSimp) return s3
          if (sSimp.length >= 3 && (inSimp.includes(sSimp) || sSimp.includes(inSimp))) {
            var hasDfStore3 = /\bdf\b/.test(sNorm3)
            var hasGoStore3 = /\bgo\b/.test(sNorm3)
            if ((hasDfInput && hasGoStore3) || (hasGoInput && hasDfStore3)) continue
            return s3
          }
        }
      }

      return null
    }

    function classifyOcorrenciaString(rawVal) {
      if (rawVal === null || rawVal === undefined) return 'nao_tratados'
      var norm = normalizeText(rawVal)
      if (!norm) return 'nao_tratados'

      if (
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad') ||
        norm === 'pago 1' ||
        norm === '1'
      ) {
        return 'fatura_paga'
      }

      if (
        norm.includes('enviad') ||
        norm.includes('envio') ||
        norm.includes('2 via') ||
        norm.includes('2a via')
      ) {
        return 'envio_fatura'
      }

      if (norm.includes('promessa')) {
        return 'promessa_pagto'
      }

      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('nao atendeu') ||
        norm.includes('caixa postal') ||
        norm.includes('recusad') ||
        norm.includes('desligad') ||
        norm.includes('telefone errado') ||
        norm.includes('numero incorreto')
      ) {
        return 'sem_contato'
      }

      if (
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv') ||
        norm.includes('desconect')
      ) {
        return 'cancelados'
      }

      if (
        norm.includes('pendente') ||
        norm.includes('em analise') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando') ||
        norm.includes('preventiva fpd') ||
        norm.includes('virou fpd') ||
        norm.includes('em aberto')
      ) {
        return 'pendente'
      }

      if (
        norm.includes('contato realizado') ||
        norm.includes('contato') ||
        norm.includes('atendid') ||
        norm.includes('falou') ||
        norm.includes('cliente ciente') ||
        norm.includes('recado')
      ) {
        return 'contato_realizado'
      }

      if (
        norm.includes('nao tratado') ||
        norm.includes('nao tratada') ||
        norm.includes('naotratado') ||
        norm.includes('nao trabalh') ||
        norm.includes('a tratar') ||
        norm.includes('sem tratamento')
      ) {
        return 'nao_tratados'
      }

      // Fallback: qualquer outro texto vai para nao_tratados
      return 'nao_tratados'
    }

    console.log('[Migration 0073] Carregando lojas cadastradas...')
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0073] Erro ao carregar stores:', errStores)
    }

    function getOrCreateStore(rawStoreName) {
      var trimmed = (rawStoreName || '').trim()
      if (!trimmed) trimmed = 'LOJA NÃO IDENTIFICADA'
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

    console.log('[Migration 0073] Lendo todas as linhas de movel...')
    var movelByRef = {} // canonicalRef -> array of records
    if (app.hasTable('movel')) {
      var mPageSize = 2000
      var mOffset = 0
      var totalMovelRead = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mPageSize, mOffset)
        } catch (eM) {
          console.log('[Migration 0073] Erro ao paginar movel:', eM)
          break
        }
        if (!mChunk || mChunk.length === 0) break
        totalMovelRead += mChunk.length

        for (var mi = 0; mi < mChunk.length; mi++) {
          var mRec = mChunk[mi]
          var rawRefM = mRec.getString('data_referencia')
          var canRefM = normalizeReferenceDate(rawRefM)
          if (!canRefM) continue
          if (!movelByRef[canRefM]) {
            movelByRef[canRefM] = []
          }
          movelByRef[canRefM].push(mRec)
        }

        if (mChunk.length < mPageSize) break
        mOffset += mPageSize
      }
      console.log('[Migration 0073] Total linhas brutas lidas de movel: ' + totalMovelRead)
    }

    console.log('[Migration 0073] Lendo todas as linhas de residencial...')
    var resByRef = {} // canonicalRef -> array of records
    if (app.hasTable('residencial')) {
      var rPageSize = 2000
      var rOffset = 0
      var totalResRead = 0
      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rPageSize, rOffset)
        } catch (eR) {
          console.log('[Migration 0073] Erro ao paginar residencial:', eR)
          break
        }
        if (!rChunk || rChunk.length === 0) break
        totalResRead += rChunk.length

        for (var ri = 0; ri < rChunk.length; ri++) {
          var rRec = rChunk[ri]
          var rawRefR = rRec.getString('data_referencia')
          var canRefR = normalizeReferenceDate(rawRefR)
          if (!canRefR) continue
          if (!resByRef[canRefR]) {
            resByRef[canRefR] = []
          }
          resByRef[canRefR].push(rRec)
        }

        if (rChunk.length < rPageSize) break
        rOffset += rPageSize
      }
      console.log('[Migration 0073] Total linhas brutas lidas de residencial: ' + totalResRead)
    }

    // Coletar todas as referências encontradas
    var allRefsSet = {}
    var mKeys = Object.keys(movelByRef)
    for (var k1 = 0; k1 < mKeys.length; k1++) {
      allRefsSet[mKeys[k1]] = true
    }
    var rKeys = Object.keys(resByRef)
    for (var k2 = 0; k2 < rKeys.length; k2++) {
      allRefsSet[rKeys[k2]] = true
    }
    var allTargetRefs = Object.keys(allRefsSet)
    console.log(
      '[Migration 0073] Referências encontradas para reconstrução: ' +
        JSON.stringify(allTargetRefs),
    )

    // Limpar fpd_records e vendor_consolidations completamente
    console.log('[Migration 0073] Limpando fpd_records e vendor_consolidations...')
    try {
      app.db().newQuery('DELETE FROM fpd_records').execute()
      app.db().newQuery('DELETE FROM vendor_consolidations').execute()
    } catch (eDel) {
      console.log('[Migration 0073] Erro ao limpar tabelas consolidadas:', eDel)
    }

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')

    var grandTotalFpd = 0
    var grandTotalVendor = 0

    // Para cada referência, deduplicar separadamente e agregar
    for (var refIdx = 0; refIdx < allTargetRefs.length; refIdx++) {
      var currentRef = allTargetRefs[refIdx]
      var movelRowsRaw = movelByRef[currentRef] || []
      var resRowsRaw = resByRef[currentRef] || []

      // Deduplicação Móvel
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

      // Deduplicação Residencial
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
        '[Migration 0073] Ref ' +
          currentRef +
          ': móvel único = ' +
          dedupedMovel.length +
          ', residencial único = ' +
          dedupedRes.length +
          ', total esperado = ' +
          (dedupedMovel.length + dedupedRes.length),
      )

      var storeAggMap = {}
      var vendorAggMap = {}

      var processRecord = function (row) {
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

        // Determinar supervisão/coordenação a partir do cadastro das lojas
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
            referente: currentRef,
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
        if (vendedorUpper === 'VENDEDOR') {
          vendedorUpper = 'NÃO INFORMADO'
        }

        var vendorKey = vendedorUpper + '__' + canonicalLojaName
        if (!vendorAggMap[vendorKey]) {
          vendorAggMap[vendorKey] = {
            vendedor: vendedorUpper,
            loja: canonicalLojaName,
            supervisao: supervisao,
            data_referencia: currentRef,
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

      for (var pmi = 0; pmi < dedupedMovel.length; pmi++) {
        processRecord(dedupedMovel[pmi])
      }
      for (var pri = 0; pri < dedupedRes.length; pri++) {
        processRecord(dedupedRes[pri])
      }

      // Gravar fpd_records para a referência
      var storeIds = Object.keys(storeAggMap)
      var refTotalFpd = 0
      for (var sIdx = 0; sIdx < storeIds.length; sIdx++) {
        var sAgg = storeAggMap[storeIds[sIdx]]
        refTotalFpd += sAgg.total_linhas

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
        } catch (eSFpd) {
          console.log('[Migration 0073] Erro ao salvar fpd_record:', eSFpd)
        }
      }

      // Gravar vendor_consolidations para a referência
      var vendorKeys = Object.keys(vendorAggMap)
      var refTotalVendor = 0
      for (var vIdx = 0; vIdx < vendorKeys.length; vIdx++) {
        var vAgg = vendorAggMap[vendorKeys[vIdx]]
        refTotalVendor += vAgg.total_linhas

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
        } catch (eSVend) {
          console.log('[Migration 0073] Erro ao salvar vendor_consolidation:', eSVend)
        }
      }

      grandTotalFpd += refTotalFpd
      grandTotalVendor += refTotalVendor

      console.log(
        '[Migration 0073] Ref ' +
          currentRef +
          ' concluída -> fpd_records somam ' +
          refTotalFpd +
          ', vendor_consolidations somam ' +
          refTotalVendor,
      )
    }

    console.log(
      '[Migration 0073] Finalizada com sucesso! Total consolidado geral: fpd_records = ' +
        grandTotalFpd +
        ', vendor_consolidations = ' +
        grandTotalVendor,
    )
  },
  (_app) => {},
)
