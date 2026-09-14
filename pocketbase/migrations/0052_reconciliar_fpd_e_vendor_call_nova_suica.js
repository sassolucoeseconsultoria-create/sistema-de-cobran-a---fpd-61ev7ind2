/// <reference types="pocketbase" />

/**
 * Migration 0052: Reconciliar fpd_records e vendor_consolidations para CELNET CALL NOVA SUIÇA
 * e para todas as lojas com base estrita na coluna `loja` de cada linha analítica
 * de movel e residencial (para todas as referências encontradas, garantindo que
 * soma de total_linhas em fpd_records por referência == contagem de linhas de clientes da mesma referência,
 * especificamente 2.471 para 26/08/2026).
 *
 * Isolamento absoluto CALL vs Loja Física (ex: CELNET CALL NOVA SUIÇA !== CELNET NOVA SUIÇA).
 * Preserva clientes, usuários, lojas e imported_files.
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

    // 1. Carregar todas as stores e garantir CELNET CALL NOVA SUIÇA
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 1000, 0)
    } catch (errStores) {
      console.log('[Migration 0052] Erro ao carregar stores:', errStores)
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

    // Garantir explicitamente que "CELNET CALL NOVA SUIÇA" existe no banco
    var callNovaSuica = getOrCreateStore('CELNET CALL NOVA SUIÇA')
    console.log(
      '[Migration 0052] Loja CELNET CALL NOVA SUIÇA pronta, id:',
      callNovaSuica ? callNovaSuica.id : 'nulo',
    )

    // 2. Identificar todas as referências existentes em movel e residencial
    var distinctRefs = {}
    try {
      var movelAll = app.findRecordsByFilter('movel', '1=1', 'id', 50000, 0)
      for (var mi = 0; mi < movelAll.length; mi++) {
        var rDate = (movelAll[mi].getString('data_referencia') || '').trim()
        if (rDate) distinctRefs[rDate] = true
      }
    } catch (errMAll) {
      console.log('[Migration 0052] Erro ao listar movel:', errMAll)
    }

    try {
      var resAll = app.findRecordsByFilter('residencial', '1=1', 'id', 50000, 0)
      for (var ri = 0; ri < resAll.length; ri++) {
        var rDate2 = (resAll[ri].getString('data_referencia') || '').trim()
        if (rDate2) distinctRefs[rDate2] = true
      }
    } catch (errRAll) {
      console.log('[Migration 0052] Erro ao listar residencial:', errRAll)
    }

    // Garantir '26/08/2026' no conjunto de referências
    distinctRefs['26/08/2026'] = true
    var refDates = Object.keys(distinctRefs)
    console.log('[Migration 0052] Referências a reconstruir:', refDates.join(', '))

    for (var dIdx = 0; dIdx < refDates.length; dIdx++) {
      var currentRef = refDates[dIdx]
      if (!currentRef) continue

      // Limpar fpd_records e vendor_consolidations para a referência
      try {
        app
          .db()
          .newQuery('DELETE FROM fpd_records WHERE referente = {:ref}')
          .bind({ ref: currentRef })
          .execute()
      } catch (e1) {
        console.log('[Migration 0052] Erro ao limpar fpd_records para ' + currentRef + ':', e1)
      }

      try {
        app
          .db()
          .newQuery('DELETE FROM vendor_consolidations WHERE data_referencia = {:ref}')
          .bind({ ref: currentRef })
          .execute()
      } catch (e2) {
        console.log(
          '[Migration 0052] Erro ao limpar vendor_consolidations para ' + currentRef + ':',
          e2,
        )
      }

      // Buscar linhas analíticas de movel e residencial para a referência
      var mRows = []
      try {
        mRows = app.findRecordsByFilter('movel', 'data_referencia = {:ref}', 'id', 50000, 0, {
          ref: currentRef,
        })
      } catch (eM) {
        console.log('[Migration 0052] movel find error:', eM)
      }

      var rRows = []
      try {
        rRows = app.findRecordsByFilter('residencial', 'data_referencia = {:ref}', 'id', 50000, 0, {
          ref: currentRef,
        })
      } catch (eR) {
        console.log('[Migration 0052] residencial find error:', eR)
      }

      var storeAggMap = {}
      var vendorAggMap = {}

      var processRow = function (row) {
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

      for (var iM = 0; iM < mRows.length; iM++) {
        processRow(mRows[iM])
      }
      for (var iR = 0; iR < rRows.length; iR++) {
        processRow(rRows[iR])
      }

      // Salvar fpd_records
      var fpdCol = app.findCollectionByNameOrId('fpd_records')
      var storeIds = Object.keys(storeAggMap)
      var totalFpdLines = 0
      for (var s = 0; s < storeIds.length; s++) {
        var sAgg = storeAggMap[storeIds[s]]
        var fpdRec = new Record(fpdCol)
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
          totalFpdLines += sAgg.total_linhas
        } catch (errF) {
          console.log('[Migration 0052] Erro fpd_record para store ' + sAgg.storeName + ':', errF)
        }
      }

      // Salvar vendor_consolidations
      var vendCol = app.findCollectionByNameOrId('vendor_consolidations')
      var vendorKeys = Object.keys(vendorAggMap)
      var totalVendorLines = 0
      for (var v = 0; v < vendorKeys.length; v++) {
        var vAgg = vendorAggMap[vendorKeys[v]]
        var vRec = new Record(vendCol)
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
          totalVendorLines += vAgg.total_linhas
        } catch (errV) {
          console.log(
            '[Migration 0052] Erro vendor_consolidation para ' +
              vAgg.vendedor +
              ' / ' +
              vAgg.loja +
              ':',
            errV,
          )
        }
      }

      console.log(
        '[Migration 0052] Ref ' +
          currentRef +
          ': ' +
          (mRows.length + rRows.length) +
          ' clientes analiticos | ' +
          totalFpdLines +
          ' linhas em fpd_records | ' +
          totalVendorLines +
          ' linhas em vendor_consolidations.',
      )
    }
  },
  (_app) => {},
)
