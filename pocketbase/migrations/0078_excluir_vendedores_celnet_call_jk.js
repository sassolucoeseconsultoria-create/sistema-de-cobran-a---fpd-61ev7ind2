/// <reference types="pocketbase" />

/**
 * Migration 0078: Excluir definitivamente da loja CELNET CALL JK as linhas dos 5 vendedores
 * e reconsolidar os dados (fpd_records e vendor_consolidations) para todas as referências afetadas.
 *
 * 5 Vendedores alvo:
 * 1. STEFANY SARAH DO NASCIMENTO FEITOSA
 * 2. RAYANE BARBOSA DE ANDRADE
 * 3. LOHRAN RODOVALHO MARTINS
 * 4. RENATA DE OLIVEIRA SANTOS
 * 5. ISABELLA CARDOSO DOS SANTOS
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

      for (var i = 0; i < storesList.length; i++) {
        var s = storesList[i]
        if (normalizeText(s.getString('name')) === inputNorm) {
          return s
        }
      }

      var isCallOrIlhaInput = /\b(call|ilha)\b/.test(inputNorm)
      var hasDfInput = /\bdf\b/.test(inputNorm)
      var hasGoInput = /\bgo\b/.test(inputNorm)

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

      return 'nao_tratados'
    }

    // Nomes dos 5 vendedores alvo a excluir (normalizados para comparação)
    var targetVendorsRaw = [
      'STEFANY SARAH DO NASCIMENTO FEITOSA',
      'RAYANE BARBOSA DE ANDRADE',
      'LOHRAN RODOVALHO MARTINS',
      'RENATA DE OLIVEIRA SANTOS',
      'ISABELLA CARDOSO DOS SANTOS',
    ]

    var targetVendorsNorm = {}
    for (var tv = 0; tv < targetVendorsRaw.length; tv++) {
      targetVendorsNorm[normalizeText(targetVendorsRaw[tv])] = targetVendorsRaw[tv]
    }

    console.log('[Migration 0078] Vendedores alvo para exclusão em CELNET CALL JK:')
    for (var k in targetVendorsNorm) {
      console.log(' - ' + targetVendorsNorm[k] + ' (norm: ' + k + ')')
    }

    // Carregar todas as lojas cadastradas
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0078] Erro ao carregar stores:', errStores)
    }

    // Identificar CELNET CALL JK
    var celnetCallJkStore = matchStoreRecord('CELNET CALL JK', allStores)
    if (!celnetCallJkStore) {
      try {
        celnetCallJkStore = app.findFirstRecordByData('stores', 'name', 'CELNET CALL JK')
      } catch (_) {}
    }

    var callJkStoreId = celnetCallJkStore ? celnetCallJkStore.id : ''
    var callJkStoreName = celnetCallJkStore
      ? celnetCallJkStore.getString('name').toUpperCase()
      : 'CELNET CALL JK'
    console.log(
      '[Migration 0078] Loja resolvida: ' + callJkStoreName + ' (id: ' + callJkStoreId + ')',
    )

    function isCelnetCallJk(rawStoreName) {
      if (!rawStoreName) return false
      var sNorm = normalizeText(rawStoreName)
      if (sNorm === 'celnet call jk') return true
      if (sNorm.includes('call jk') || sNorm.includes('calljk')) return true
      var matched = matchStoreRecord(rawStoreName, allStores)
      if (matched && normalizeText(matched.getString('name')) === 'celnet call jk') {
        return true
      }
      return false
    }

    var deletedStats = {
      movel: 0,
      residencial: 0,
      byVendor: {},
      byRef: {},
      affectedRefs: {},
    }

    for (var v0 = 0; v0 < targetVendorsRaw.length; v0++) {
      deletedStats.byVendor[targetVendorsRaw[v0]] = { movel: 0, residencial: 0, total: 0 }
    }

    // =========================================================================
    // ETAPA 1: Identificar e Excluir Linhas em MOVEL
    // =========================================================================
    if (app.hasTable('movel')) {
      console.log('[Migration 0078] Verificando linhas de movel...')
      var mPageSize = 2000
      var mOffset = 0
      var movelIdsToDelete = []

      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mPageSize, mOffset)
        } catch (eM) {
          console.log('[Migration 0078] Erro ao ler movel:', eM)
          break
        }
        if (!mChunk || mChunk.length === 0) break

        for (var mi = 0; mi < mChunk.length; mi++) {
          var mRec = mChunk[mi]
          var rawLojaM = mRec.getString('loja')
          if (!isCelnetCallJk(rawLojaM)) continue

          var rawVendM = mRec.getString('vendedor')
          var normVendM = normalizeText(rawVendM)
          if (!targetVendorsNorm[normVendM]) continue

          var canonicalVendName = targetVendorsNorm[normVendM]
          var rawRefM = mRec.getString('data_referencia')
          var canRefM = normalizeReferenceDate(rawRefM) || 'SEM REFERÊNCIA'

          movelIdsToDelete.push(mRec.id)
          deletedStats.movel++
          deletedStats.byVendor[canonicalVendName].movel++
          deletedStats.byVendor[canonicalVendName].total++
          deletedStats.affectedRefs[canRefM] = true

          if (!deletedStats.byRef[canRefM]) {
            deletedStats.byRef[canRefM] = 0
          }
          deletedStats.byRef[canRefM]++
        }

        if (mChunk.length < mPageSize) break
        mOffset += mPageSize
      }

      if (movelIdsToDelete.length > 0) {
        console.log(
          '[Migration 0078] Deletando ' + movelIdsToDelete.length + ' linha(s) em movel...',
        )
        var batchDelM = 400
        for (var bdm = 0; bdm < movelIdsToDelete.length; bdm += batchDelM) {
          var chunkM = movelIdsToDelete.slice(bdm, bdm + batchDelM)
          var quotedM = chunkM
            .map(function (id) {
              return "'" + id.replace(/'/g, "''") + "'"
            })
            .join(',')
          try {
            app
              .db()
              .newQuery('DELETE FROM movel WHERE id IN (' + quotedM + ')')
              .execute()
          } catch (eDelM) {
            console.log('[Migration 0078] Erro ao deletar em movel:', eDelM)
          }
        }
      } else {
        console.log('[Migration 0078] Nenhuma linha correspondente encontrada em movel.')
      }
    }

    // =========================================================================
    // ETAPA 2: Identificar e Excluir Linhas em RESIDENCIAL
    // =========================================================================
    if (app.hasTable('residencial')) {
      console.log('[Migration 0078] Verificando linhas de residencial...')
      var rPageSize = 2000
      var rOffset = 0
      var resIdsToDelete = []

      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rPageSize, rOffset)
        } catch (eR) {
          console.log('[Migration 0078] Erro ao ler residencial:', eR)
          break
        }
        if (!rChunk || rChunk.length === 0) break

        for (var ri = 0; ri < rChunk.length; ri++) {
          var rRec = rChunk[ri]
          var rawLojaR = rRec.getString('loja')
          if (!isCelnetCallJk(rawLojaR)) continue

          var rawVendR = rRec.getString('vendedor')
          var normVendR = normalizeText(rawVendR)
          if (!targetVendorsNorm[normVendR]) continue

          var canonicalVendNameR = targetVendorsNorm[normVendR]
          var rawRefR = rRec.getString('data_referencia')
          var canRefR = normalizeReferenceDate(rawRefR) || 'SEM REFERÊNCIA'

          resIdsToDelete.push(rRec.id)
          deletedStats.residencial++
          deletedStats.byVendor[canonicalVendNameR].residencial++
          deletedStats.byVendor[canonicalVendNameR].total++
          deletedStats.affectedRefs[canRefR] = true

          if (!deletedStats.byRef[canRefR]) {
            deletedStats.byRef[canRefR] = 0
          }
          deletedStats.byRef[canRefR]++
        }

        if (rChunk.length < rPageSize) break
        rOffset += rPageSize
      }

      if (resIdsToDelete.length > 0) {
        console.log(
          '[Migration 0078] Deletando ' + resIdsToDelete.length + ' linha(s) em residencial...',
        )
        var batchDelR = 400
        for (var bdr = 0; bdr < resIdsToDelete.length; bdr += batchDelR) {
          var chunkR = resIdsToDelete.slice(bdr, bdr + batchDelR)
          var quotedR = chunkR
            .map(function (id) {
              return "'" + id.replace(/'/g, "''") + "'"
            })
            .join(',')
          try {
            app
              .db()
              .newQuery('DELETE FROM residencial WHERE id IN (' + quotedR + ')')
              .execute()
          } catch (eDelR) {
            console.log('[Migration 0078] Erro ao deletar em residencial:', eDelR)
          }
        }
      } else {
        console.log('[Migration 0078] Nenhuma linha correspondente encontrada em residencial.')
      }
    }

    // Auditoria de exclusão por vendedor e por referência
    console.log('================ AUDITORIA DE EXCLUSÃO ================')
    console.log('Total de linhas excluídas em Móvel: ' + deletedStats.movel)
    console.log('Total de linhas excluídas em Residencial: ' + deletedStats.residencial)
    console.log(
      'Total Geral de linhas excluídas: ' + (deletedStats.movel + deletedStats.residencial),
    )
    console.log('Por Vendedor:')
    for (var vName in deletedStats.byVendor) {
      var st = deletedStats.byVendor[vName]
      console.log(
        ' - ' +
          vName +
          ': Total = ' +
          st.total +
          ' (móvel: ' +
          st.movel +
          ', residencial: ' +
          st.residencial +
          ')',
      )
    }
    console.log('Por Referência afetada:')
    for (var rRef in deletedStats.byRef) {
      console.log(' - ' + rRef + ': ' + deletedStats.byRef[rRef] + ' linha(s) excluída(s)')
    }
    console.log('=======================================================')

    // =========================================================================
    // ETAPA 3: Reconsolidação dos agregados da CELNET CALL JK
    // Para todas as referências existentes no banco para CELNET CALL JK
    // =========================================================================
    console.log('[Migration 0078] Iniciando reconsolidação para CELNET CALL JK...')

    // Ler todas as linhas RESTANTES de movel da CELNET CALL JK agrupadas por referência
    var remainingMovelByRef = {}
    if (app.hasTable('movel')) {
      var remMSize = 2000
      var remMOff = 0
      while (true) {
        var chunkMovel = []
        try {
          chunkMovel = app.findRecordsByFilter('movel', '1=1', 'id', remMSize, remMOff)
        } catch (_) {
          break
        }
        if (!chunkMovel || chunkMovel.length === 0) break

        for (var rmi = 0; rmi < chunkMovel.length; rmi++) {
          var rowM = chunkMovel[rmi]
          if (!isCelnetCallJk(rowM.getString('loja'))) continue
          var refM = normalizeReferenceDate(rowM.getString('data_referencia'))
          if (!refM) continue
          if (!remainingMovelByRef[refM]) {
            remainingMovelByRef[refM] = []
          }
          remainingMovelByRef[refM].push(rowM)
        }

        if (chunkMovel.length < remMSize) break
        remMOff += remMSize
      }
    }

    // Ler todas as linhas RESTANTES de residencial da CELNET CALL JK agrupadas por referência
    var remainingResByRef = {}
    if (app.hasTable('residencial')) {
      var remRSize = 2000
      var remROff = 0
      while (true) {
        var chunkRes = []
        try {
          chunkRes = app.findRecordsByFilter('residencial', '1=1', 'id', remRSize, remROff)
        } catch (_) {
          break
        }
        if (!chunkRes || chunkRes.length === 0) break

        for (var rri = 0; rri < chunkRes.length; rri++) {
          var rowR = chunkRes[rri]
          if (!isCelnetCallJk(rowR.getString('loja'))) continue
          var refR = normalizeReferenceDate(rowR.getString('data_referencia'))
          if (!refR) continue
          if (!remainingResByRef[refR]) {
            remainingResByRef[refR] = []
          }
          remainingResByRef[refR].push(rowR)
        }

        if (chunkRes.length < remRSize) break
        remROff += remRSize
      }
    }

    // Coletar referências conhecidas da loja a partir das linhas e de fpd_records existentes
    var allStoreRefsSet = {}
    for (var kM in remainingMovelByRef) allStoreRefsSet[kM] = true
    for (var kR in remainingResByRef) allStoreRefsSet[kR] = true
    for (var kAff in deletedStats.affectedRefs) {
      if (kAff !== 'SEM REFERÊNCIA') allStoreRefsSet[kAff] = true
    }

    // Incluir referências que já estavam em fpd_records para a loja
    if (app.hasTable('fpd_records') && callJkStoreId) {
      try {
        var existingFpds = app.findRecordsByFilter(
          'fpd_records',
          "store = '" + callJkStoreId + "'",
          'referente',
          200,
          0,
        )
        for (var ef = 0; ef < existingFpds.length; ef++) {
          var cRef = normalizeReferenceDate(existingFpds[ef].getString('referente'))
          if (cRef) allStoreRefsSet[cRef] = true
        }
      } catch (eFpdScan) {
        console.log('[Migration 0078] Erro ao ler fpd_records existentes:', eFpdScan)
      }
    }

    var storeRefsList = Object.keys(allStoreRefsSet)
    console.log(
      '[Migration 0078] Referências da CELNET CALL JK a reconsolidar: ' +
        JSON.stringify(storeRefsList),
    )

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')
    var supervisaoKaren = 'Karen'

    for (var sr = 0; sr < storeRefsList.length; sr++) {
      var refAtual = storeRefsList[sr]
      var movelRows = remainingMovelByRef[refAtual] || []
      var resRows = remainingResByRef[refAtual] || []

      // Deduplicação de móvel
      var seenMKeys = {}
      var dedupMovel = []
      for (var dmi = 0; dmi < movelRows.length; dmi++) {
        var itemM = movelRows[dmi]
        var mKey = extractMovelKey(itemM)
        if (!mKey) {
          dedupMovel.push(itemM)
          continue
        }
        if (seenMKeys[mKey]) continue
        seenMKeys[mKey] = true
        dedupMovel.push(itemM)
      }

      // Deduplicação de residencial
      var seenRKeys = {}
      var dedupRes = []
      for (var dri = 0; dri < resRows.length; dri++) {
        var itemR = resRows[dri]
        var rKey = extractResidencialKey(itemR)
        if (!rKey) {
          dedupRes.push(itemR)
          continue
        }
        if (seenRKeys[rKey]) continue
        seenRKeys[rKey] = true
        dedupRes.push(itemR)
      }

      console.log(
        '[Migration 0078] Reconsolidando Ref ' +
          refAtual +
          ' -> Linhas restantes únicas: Móvel=' +
          dedupMovel.length +
          ', Residencial=' +
          dedupRes.length +
          ', Total=' +
          (dedupMovel.length + dedupRes.length),
      )

      var storeAgg = {
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

      var vendorAggMap = {}

      var processRemainingRecord = function (row) {
        var rawVend = (row.getString('vendedor') || '').trim()
        var rawOco = (row.getString('ocorrencias') || '').trim()

        var normV = normalizeText(rawVend)
        if (normV === 'vendedor') return

        var cat = classifyOcorrenciaString(rawOco) || 'nao_tratados'
        storeAgg.total_linhas++
        if (storeAgg[cat] !== undefined) {
          storeAgg[cat]++
        } else {
          storeAgg.nao_tratados++
        }

        var vendUpper = rawVend ? rawVend.toUpperCase() : 'NÃO INFORMADO'
        if (vendUpper === 'VENDEDOR') vendUpper = 'NÃO INFORMADO'

        if (!vendorAggMap[vendUpper]) {
          vendorAggMap[vendUpper] = {
            vendedor: vendUpper,
            loja: callJkStoreName,
            supervisao: supervisaoKaren,
            data_referencia: refAtual,
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

        vendorAggMap[vendUpper].total_linhas++
        if (vendorAggMap[vendUpper][cat] !== undefined) {
          vendorAggMap[vendUpper][cat]++
        } else {
          vendorAggMap[vendUpper].nao_tratados++
        }
      }

      for (var pi1 = 0; pi1 < dedupMovel.length; pi1++) {
        processRemainingRecord(dedupMovel[pi1])
      }
      for (var pi2 = 0; pi2 < dedupRes.length; pi2++) {
        processRemainingRecord(dedupRes[pi2])
      }

      // Atualizar ou criar fpd_record para a loja nesta referência
      if (callJkStoreId) {
        var existingFpd = null
        try {
          var fpdList = app.findRecordsByFilter(
            'fpd_records',
            "store = '" +
              callJkStoreId +
              "' && (referente = '" +
              refAtual +
              "' || referente = '" +
              refAtual +
              " ')",
            '-created',
            1,
            0,
          )
          if (fpdList && fpdList.length > 0) {
            existingFpd = fpdList[0]
          }
        } catch (_) {}

        var targetFpd = existingFpd || new Record(fpdCollection)
        targetFpd.set('store', callJkStoreId)
        targetFpd.set('referente', refAtual)
        targetFpd.set('total_linhas', storeAgg.total_linhas)
        targetFpd.set('fatura_paga', storeAgg.fatura_paga)
        targetFpd.set('envio_fatura', storeAgg.envio_fatura)
        targetFpd.set('promessa_pagto', storeAgg.promessa_pagto)
        targetFpd.set('sem_contato', storeAgg.sem_contato)
        targetFpd.set('cancelados', storeAgg.cancelados)
        targetFpd.set('pendente', storeAgg.pendente)
        targetFpd.set('contato_realizado', storeAgg.contato_realizado)
        targetFpd.set('nao_tratados', storeAgg.nao_tratados)
        targetFpd.set('outros', storeAgg.outros)

        try {
          app.save(targetFpd)
          console.log(
            '[Migration 0078] FPD consolidado de CELNET CALL JK para ' +
              refAtual +
              ' atualizado com total_linhas = ' +
              storeAgg.total_linhas,
          )
        } catch (eSaveFpd) {
          console.log('[Migration 0078] Erro ao salvar fpd_record:', eSaveFpd)
        }
      }

      // Atualizar vendor_consolidations para a loja nesta referência
      // 1. Buscar registros existentes da loja e referência
      var existingVendors = []
      try {
        existingVendors = app.findRecordsByFilter(
          'vendor_consolidations',
          "(loja = 'CELNET CALL JK' || loja = 'CELNET CALLJK') && (data_referencia = '" +
            refAtual +
            "' || data_referencia = '" +
            refAtual +
            " ')",
          'vendedor',
          500,
          0,
        )
      } catch (eVendFilter) {
        console.log('[Migration 0078] Erro ao buscar vendor_consolidations:', eVendFilter)
      }

      var existingVendorMap = {}
      for (var ev = 0; ev < existingVendors.length; ev++) {
        var vRec = existingVendors[ev]
        var vUpper = (vRec.getString('vendedor') || '').trim().toUpperCase()
        existingVendorMap[vUpper] = vRec
      }

      // 2. Atualizar ou criar para os vendedores que ainda possuem linhas
      for (var vendK in vendorAggMap) {
        var vData = vendorAggMap[vendK]
        var vRecord = existingVendorMap[vendK] || new Record(vendorCollection)

        vRecord.set('vendedor', vData.vendedor)
        vRecord.set('loja', callJkStoreName)
        vRecord.set('supervisao', supervisaoKaren)
        vRecord.set('data_referencia', refAtual)
        vRecord.set('total_linhas', vData.total_linhas)
        vRecord.set('fatura_paga', vData.fatura_paga)
        vRecord.set('envio_fatura', vData.envio_fatura)
        vRecord.set('promessa_pagto', vData.promessa_pagto)
        vRecord.set('sem_contato', vData.sem_contato)
        vRecord.set('cancelados', vData.cancelados)
        vRecord.set('pendente', vData.pendente)
        vRecord.set('contato_realizado', vData.contato_realizado)
        vRecord.set('nao_tratados', vData.nao_tratados)
        vRecord.set('outros', vData.outros)

        try {
          app.save(vRecord)
        } catch (eSaveVend) {
          console.log('[Migration 0078] Erro ao salvar vendor_consolidation:', eSaveVend)
        }

        delete existingVendorMap[vendK]
      }

      // 3. Para os vendedores restantes (incluindo os 5 excluídos ou que não têm mais linhas),
      // remover os registros para não poluir o ranking com vendedores que não pertencem à loja
      for (var remVendK in existingVendorMap) {
        var recToDelete = existingVendorMap[remVendK]
        try {
          app.delete(recToDelete)
          console.log(
            '[Migration 0078] Registro de vendor_consolidations removido para ' +
              remVendK +
              ' na ref ' +
              refAtual,
          )
        } catch (eDelVendRec) {
          console.log(
            '[Migration 0078] Erro ao deletar vendor_consolidation sem linhas:',
            eDelVendRec,
          )
        }
      }
    }

    console.log(
      '[Migration 0078] Exclusão e reconsolidação da CELNET CALL JK concluídas com sucesso!',
    )
  },
  (_app) => {},
)
