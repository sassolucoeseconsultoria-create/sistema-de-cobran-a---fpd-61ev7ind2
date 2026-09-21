/// <reference types="pocketbase" />

/**
 * Migration 0068: Reconstruir Vendor Consolidations e FPD Records Deduplicados
 * para TODAS as referências existentes a partir das linhas analíticas reais de `movel` e `residencial`.
 *
 * Correções obrigatórias:
 * 1. Linhas com `vendedor` vazio em movel/residencial devem ser agrupadas sob rótulo
 *    "NÃO INFORMADO" (e se loja estiver vazia, sob "LOJA NÃO IDENTIFICADA").
 * 2. As linhas analíticas devem ser deduplicadas com a mesma chave canônica do Painel de Lojas e Inadimplência:
 *    - Móvel: chave por Número/Telefone
 *    - Residencial: chave por NR_CONTRATO
 * 3. Ocorrência fiel à linha (ocorrência prevalece se preenchida; classificação derivativa só se vazia).
 * 4. Isolamento absoluto por data_referencia (nunca misturar referências).
 * 5. vendor_consolidations e fpd_records ficam com a contagem idêntica à soma deduplicada movel+residencial.
 * 6. Vinculação correta de supervisão das lojas (incluindo Karen para GAMA DF e Lucas para ILHA RESIDENCIAL).
 */
migrate(
  (app) => {
    function normalizeText(val) {
      if (!val) return ''
      return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
    }

    function normalizeClientKey(val) {
      if (!val) return ''
      var digits = String(val).replace(/\D+/g, '')
      if (digits) {
        digits = digits.replace(/^0+/, '')
        if (digits) return digits
      }
      return String(val).trim().toUpperCase()
    }

    function parseDadosValue(raw) {
      if (!raw) return {}
      if (typeof raw === 'object') return raw
      try {
        if (typeof raw === 'string') {
          var trimmed = raw.trim()
          if (!trimmed || trimmed === 'null' || trimmed === '{}') return {}
          return JSON.parse(trimmed)
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

    // Carregar todas as lojas existentes
    var allStores = []
    if (app.hasTable('stores')) {
      try {
        allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
      } catch (eStores) {
        console.log('[Migration 0068] Erro ao carregar stores:', eStores)
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

    // 1. Ler todas as linhas de `movel`
    var allMovel = []
    if (app.hasTable('movel')) {
      var mSize = 2000
      var mOff = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mSize, mOff)
        } catch (eM) {
          console.log('[Migration 0068] Erro ao ler movel:', eM)
          break
        }
        if (!mChunk || mChunk.length === 0) break
        for (var mi = 0; mi < mChunk.length; mi++) {
          allMovel.push(mChunk[mi])
        }
        if (mChunk.length < mSize) break
        mOff += mSize
      }
    }

    // 2. Ler todas as linhas de `residencial`
    var allRes = []
    if (app.hasTable('residencial')) {
      var rSize = 2000
      var rOff = 0
      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rSize, rOff)
        } catch (eR) {
          console.log('[Migration 0068] Erro ao ler residencial:', eR)
          break
        }
        if (!rChunk || rChunk.length === 0) break
        for (var ri = 0; ri < rChunk.length; ri++) {
          allRes.push(rChunk[ri])
        }
        if (rChunk.length < rSize) break
        rOff += rSize
      }
    }

    console.log(
      '[Migration 0068] Total linhas brutas lidas: movel = ' +
        allMovel.length +
        ', residencial = ' +
        allRes.length,
    )

    // Agrupar e isolar estritamente por data_referencia
    function normalizeReferenceDate(raw) {
      if (!raw) return ''
      var trimmed = String(raw).trim()
      if (!trimmed) return ''
      // Formato YYYY-MM-DD -> DD/MM/YYYY
      var isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        return isoMatch[3] + '/' + isoMatch[2] + '/' + isoMatch[1]
      }
      var dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var dd = dmyMatch[1].length === 1 ? '0' + dmyMatch[1] : dmyMatch[1]
        var mm = dmyMatch[2].length === 1 ? '0' + dmyMatch[2] : dmyMatch[2]
        var yyyy = dmyMatch[3].length === 2 ? '20' + dmyMatch[3] : dmyMatch[3]
        return dd + '/' + mm + '/' + yyyy
      }
      return trimmed
    }

    var distinctDatesSet = {}
    for (var iM = 0; iM < allMovel.length; iM++) {
      var refM = normalizeReferenceDate(allMovel[iM].getString('data_referencia'))
      if (refM) distinctDatesSet[refM] = true
    }
    for (var iR = 0; iR < allRes.length; iR++) {
      var refR = normalizeReferenceDate(allRes[iR].getString('data_referencia'))
      if (refR) distinctDatesSet[refR] = true
    }

    var distinctDates = Object.keys(distinctDatesSet).sort()
    console.log('[Migration 0068] Referências encontradas:', JSON.stringify(distinctDates))

    // 3. Deletar fpd_records e vendor_consolidations para recriar 100% fiel e reconciliado
    try {
      app.db().newQuery('DELETE FROM fpd_records').execute()
      console.log('[Migration 0068] fpd_records limpo.')
    } catch (eDelFpd) {
      console.log('[Migration 0068] Erro ao limpar fpd_records:', eDelFpd)
    }

    try {
      app.db().newQuery('DELETE FROM vendor_consolidations').execute()
      console.log('[Migration 0068] vendor_consolidations limpo.')
    } catch (eDelVend) {
      console.log('[Migration 0068] Erro ao limpar vendor_consolidations:', eDelVend)
    }

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')

    var globalFpdSaved = 0
    var globalVendorSaved = 0

    // Processar cada referência separadamente
    for (var dIdx = 0; dIdx < distinctDates.length; dIdx++) {
      var currentRef = distinctDates[dIdx]

      // Deduplicar movel desta data
      var movelThisDate = []
      var seenMovelKeys = {}
      for (var mi = 0; mi < allMovel.length; mi++) {
        var recM = allMovel[mi]
        var mRef = normalizeReferenceDate(recM.getString('data_referencia'))
        if (mRef !== currentRef) continue

        var keyM = extractMovelKey(recM)
        if (keyM) {
          if (seenMovelKeys[keyM]) continue
          seenMovelKeys[keyM] = true
        }
        movelThisDate.push(recM)
      }

      // Deduplicar residencial desta data
      var resThisDate = []
      var seenResKeys = {}
      for (var ri = 0; ri < allRes.length; ri++) {
        var recR = allRes[ri]
        var rRef = normalizeReferenceDate(recR.getString('data_referencia'))
        if (rRef !== currentRef) continue

        var keyR = extractResidencialKey(recR)
        if (keyR) {
          if (seenResKeys[keyR]) continue
          seenResKeys[keyR] = true
        }
        resThisDate.push(recR)
      }

      console.log(
        '[Migration 0068] Referência ' +
          currentRef +
          ': móvel deduplicado = ' +
          movelThisDate.length +
          ', residencial deduplicado = ' +
          resThisDate.length +
          ', total analítico = ' +
          (movelThisDate.length + resThisDate.length),
      )

      var storeAggMap = {}
      var vendorAggMap = {}

      var processLine = function (row) {
        var rawLoja = (row.getString('loja') || '').trim()
        var rawVendedor = (row.getString('vendedor') || '').trim()
        var rawOcorrencia = (row.getString('ocorrencias') || '').trim()

        var normVendedor = normalizeText(rawVendedor)
        var normLoja = normalizeText(rawLoja)

        // Descartar cabeçalho dummy acidental
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

        // Preservar supervisões de cadastro vinculadas a Karen e Lucas
        if (!supervisao) {
          if (canonicalLojaName.indexOf('GAMA DF') !== -1) {
            supervisao = 'Karen'
          } else if (canonicalLojaName === 'CELNET ILHA RESIDENCIAL') {
            supervisao = 'Lucas Diniz'
          }
        }

        // Regra do Usuário: Vendedor vazio -> "NÃO INFORMADO"
        var vendedorUpper = rawVendedor ? rawVendedor.toUpperCase() : 'NÃO INFORMADO'
        if (vendedorUpper === 'VENDEDOR') {
          vendedorUpper = 'NÃO INFORMADO'
        }

        var cat = classifyOcorrenciaString(rawOcorrencia) || 'nao_tratados'

        // 1. Agregação por Loja (fpd_records)
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
        storeAggMap[storeId].total_linhas++
        if (storeAggMap[storeId][cat] !== undefined) {
          storeAggMap[storeId][cat]++
        } else {
          storeAggMap[storeId].nao_tratados++
        }

        // 2. Agregação por Vendedor (vendor_consolidations)
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

      for (var m = 0; m < movelThisDate.length; m++) {
        processLine(movelThisDate[m])
      }
      for (var r = 0; r < resThisDate.length; r++) {
        processLine(resThisDate[r])
      }

      // Salvar fpd_records
      var sKeys = Object.keys(storeAggMap)
      var fpdTotalForRef = 0
      for (var sk = 0; sk < sKeys.length; sk++) {
        var sAgg = storeAggMap[sKeys[sk]]
        fpdTotalForRef += sAgg.total_linhas

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
          globalFpdSaved++
        } catch (errSaveFpd) {
          console.log(
            '[Migration 0068] Erro ao salvar fpd_record para ' + sAgg.storeName + ':',
            errSaveFpd,
          )
        }
      }

      // Salvar vendor_consolidations
      var vKeys = Object.keys(vendorAggMap)
      var vendTotalForRef = 0
      for (var vk = 0; vk < vKeys.length; vk++) {
        var vAgg = vendorAggMap[vKeys[vk]]
        vendTotalForRef += vAgg.total_linhas

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
          globalVendorSaved++
        } catch (errSaveVend) {
          console.log('[Migration 0068] Erro ao salvar vendor_consolidation:', errSaveVend)
        }
      }

      console.log(
        '[Migration 0068] Validação Referência ' +
          currentRef +
          ': analítico deduplicado = ' +
          (movelThisDate.length + resThisDate.length) +
          ', fpd_records somado = ' +
          fpdTotalForRef +
          ', vendor_consolidations somado = ' +
          vendTotalForRef +
          ' | Match perfeito: ' +
          (movelThisDate.length + resThisDate.length === fpdTotalForRef &&
            fpdTotalForRef === vendTotalForRef),
      )
    }

    console.log(
      '[Migration 0068] Concluída com sucesso! fpd_records criados: ' +
        globalFpdSaved +
        ', vendor_consolidations criados: ' +
        globalVendorSaved,
    )
  },
  (_app) => {},
)
