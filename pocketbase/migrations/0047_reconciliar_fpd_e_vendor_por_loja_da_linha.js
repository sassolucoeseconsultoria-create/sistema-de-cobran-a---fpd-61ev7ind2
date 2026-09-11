/// <reference types="pocketbase" />

migrate(
  (app) => {
    // Normalizador idêntico ao do sistema
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

      // 3. Simplified match (removendo ruído: celnet, shopping, goiania, boullevard -> boulevard)
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

    function classifyOcorrencia(rawVal) {
      if (rawVal === null || rawVal === undefined) return null
      var norm = normalizeText(rawVal)
      if (!norm) return null

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
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad')
      ) {
        return 'fatura_paga'
      }

      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('caixa postal') ||
        norm.includes('recusad') ||
        norm.includes('desligad')
      ) {
        return 'sem_contato'
      }

      if (
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv')
      ) {
        return 'cancelados'
      }

      if (
        norm.includes('pendente') ||
        norm.includes('em analise') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando')
      ) {
        return 'pendente'
      }

      if (
        norm.includes('contato') ||
        norm.includes('atendid') ||
        norm.includes('falou') ||
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

    // 1. Carregar todas as stores
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0047] Erro ao carregar stores:', errStores)
    }

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
      } catch (errCreate) {
        try {
          var recheck = app.findFirstRecordByData('stores', 'name', trimmed.toUpperCase())
          if (recheck) {
            allStores.push(recheck)
            return recheck
          }
        } catch (_) {}
        return null
      }
    }

    // 2. Limpar dados existentes de 26/08/2026 em fpd_records e vendor_consolidations
    try {
      app.db().newQuery("DELETE FROM fpd_records WHERE referente = '26/08/2026'").execute()
    } catch (e1) {
      console.log('[Migration 0047] Erro ao limpar fpd_records:', e1)
    }

    try {
      app
        .db()
        .newQuery("DELETE FROM vendor_consolidations WHERE data_referencia = '26/08/2026'")
        .execute()
    } catch (e2) {
      console.log('[Migration 0047] Erro ao limpar vendor_consolidations:', e2)
    }

    // 3. Carregar registros analíticos de movel e residencial
    var movelRows = []
    try {
      movelRows = app.findRecordsByFilter('movel', "data_referencia = '26/08/2026'", 'id', 50000, 0)
    } catch (errM) {
      console.log('[Migration 0047] Erro ao buscar movel:', errM)
    }

    var resRows = []
    try {
      resRows = app.findRecordsByFilter(
        'residencial',
        "data_referencia = '26/08/2026'",
        'id',
        50000,
        0,
      )
    } catch (errR) {
      console.log('[Migration 0047] Erro ao buscar residencial:', errR)
    }

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

      var storeRec = getOrCreateStore(rawLoja)
      if (!storeRec) {
        return
      }

      var storeId = storeRec.id
      var canonicalLojaName = storeRec.getString('name').toUpperCase()
      var supervisao = storeRec.getString('supervisao') || ''

      if (!storeAggMap[storeId]) {
        storeAggMap[storeId] = {
          storeId: storeId,
          storeName: canonicalLojaName,
          referente: '26/08/2026',
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

      var cat = classifyOcorrencia(rawOcorrencia) || 'nao_tratados'
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
          data_referencia: '26/08/2026',
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

    for (var m = 0; m < movelRows.length; m++) {
      processRow(movelRows[m])
    }
    for (var r = 0; r < resRows.length; r++) {
      processRow(resRows[r])
    }

    // 4. Salvar fpd_records
    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var storeIds = Object.keys(storeAggMap)
    for (var sIdx = 0; sIdx < storeIds.length; sIdx++) {
      var sAgg = storeAggMap[storeIds[sIdx]]
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
      } catch (errFpd) {
        console.log('[Migration 0047] Erro ao salvar fpd_record:', errFpd)
      }
    }

    // 5. Salvar vendor_consolidations
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')
    var vendorKeys = Object.keys(vendorAggMap)
    for (var vIdx = 0; vIdx < vendorKeys.length; vIdx++) {
      var vAgg = vendorAggMap[vendorKeys[vIdx]]
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
      } catch (errVend) {
        console.log('[Migration 0047] Erro ao salvar vendor_consolidation:', errVend)
      }
    }
  },
  (app) => {},
)
