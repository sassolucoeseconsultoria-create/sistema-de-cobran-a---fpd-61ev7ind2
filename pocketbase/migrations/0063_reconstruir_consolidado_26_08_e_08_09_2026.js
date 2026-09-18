/// <reference types="pocketbase" />

/**
 * Migration 0063: Reconstruir Consolidado e Vendedores das Referências 26/08/2026 e 08/09/2026
 *
 * Problema diagnosticado:
 * - Em 26/08/2026, fpd_records somava 2.446 enquanto as linhas analíticas de móvel + residencial somavam 2.468 (diferença de 22).
 * - A diferença total estava na loja "CELNET CALL NOVA SUIÇA" (store mnx8lowo2kjhoux):
 *   o consolidado tinha apenas 8 linhas, mas havia 30 linhas analíticas na ref (móvel + residencial).
 *   O arquivo misto "CELNET NOVA SUIÇA.xlsx" continha linhas de loja física e linhas de CALL com ocorrências
 *   variadas (Pendente, Contato Realizado, Fatura(s) Paga(s) etc.) que foram sobrescritas ou não contabilizadas
 *   no consolidado da loja correta.
 *
 * Solução desta migração:
 * 1. Limpar fpd_records e vendor_consolidations para as referências '26/08/2026' e '08/09/2026'.
 * 2. Carregar todas as linhas reais de `movel` e `residencial` correspondentes a '26/08/2026' e '08/09/2026'.
 * 3. Para cada linha, agrupar pela loja da própria linha (normalizada e resolvida contra a coleção stores),
 *    isolando rigorosamente lojas físicas de CALL/ILHA.
 * 4. Classificar ocorrências de forma fiel com fallback 'nao_tratados' para qualquer texto não reconhecido,
 *    garantindo que 100% das linhas analíticas sejam contadas em total_linhas.
 * 5. Reconstruir fpd_records e vendor_consolidations preservando anotações manuais nas coleções analíticas (que não são tocadas).
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

    function isReference26082026(rawStr) {
      if (!rawStr) return false
      var str = String(rawStr).trim()
      if (!str) return false
      if (
        str === '26/08/2026' ||
        str === '26/08/26' ||
        str === '2026-08-26' ||
        str.indexOf('26/08/2026') === 0 ||
        str.indexOf('26/08/26') === 0 ||
        str.indexOf('2026-08-26') === 0
      ) {
        return true
      }
      var dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var day = parseInt(dmyMatch[1], 10)
        var month = parseInt(dmyMatch[2], 10)
        var year = parseInt(dmyMatch[3], 10)
        if (year < 100) year += 2000
        if (day === 26 && month === 8 && year === 2026) return true
      }
      return false
    }

    function isReference08092026(rawStr) {
      if (!rawStr) return false
      var str = String(rawStr).trim()
      if (!str) return false
      if (
        str === '08/09/2026' ||
        str === '08/09/26' ||
        str === '2026-09-08' ||
        str.indexOf('08/09/2026') === 0 ||
        str.indexOf('08/09/26') === 0 ||
        str.indexOf('2026-09-08') === 0
      ) {
        return true
      }
      var dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var day = parseInt(dmyMatch[1], 10)
        var month = parseInt(dmyMatch[2], 10)
        var year = parseInt(dmyMatch[3], 10)
        if (year < 100) year += 2000
        if (day === 8 && month === 9 && year === 2026) return true
      }
      return false
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

      // 3. Simplified match (removendo ruído)
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
        norm === 'pago=1' ||
        norm === '1'
      ) {
        return 'fatura_paga'
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
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv') ||
        norm.includes('desconect')
      ) {
        return 'cancelados'
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
        norm.includes('caixa postal') ||
        norm.includes('recusad') ||
        norm.includes('desligad')
      ) {
        return 'sem_contato'
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

      // Fallback: qualquer linha com texto não categorizado entra em 'nao_tratados'
      return 'nao_tratados'
    }

    console.log(
      '[Migration 0063] Iniciando reconstrução de fpd_records e vendor_consolidations para 26/08/2026 e 08/09/2026...',
    )

    // 1. Carregar lojas cadastradas
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0063] Erro ao carregar stores:', errStores)
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

    // 2. Limpar fpd_records e vendor_consolidations das duas referências
    var targetReferences = ['26/08/2026', '08/09/2026']
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM fpd_records WHERE referente IN ('26/08/2026', '26/08/26', '2026-08-26', '08/09/2026', '08/09/26', '2026-09-08') OR referente LIKE '26/08/2026%' OR referente LIKE '08/09/2026%'",
        )
        .execute()
    } catch (errDelFpd) {
      console.log('[Migration 0063] Erro ao deletar fpd_records:', errDelFpd)
    }

    try {
      app
        .db()
        .newQuery(
          "DELETE FROM vendor_consolidations WHERE data_referencia IN ('26/08/2026', '26/08/26', '2026-08-26', '08/09/2026', '08/09/26', '2026-09-08') OR data_referencia LIKE '26/08/2026%' OR data_referencia LIKE '08/09/2026%'",
        )
        .execute()
    } catch (errDelVend) {
      console.log('[Migration 0063] Erro ao deletar vendor_consolidations:', errDelVend)
    }

    // 3. Processar cada referência individualmente
    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')

    for (var tIdx = 0; tIdx < targetReferences.length; tIdx++) {
      var currentRef = targetReferences[tIdx]
      var isRefMatcher = currentRef === '26/08/2026' ? isReference26082026 : isReference08092026

      var movelRows = []
      if (app.hasTable('movel')) {
        var mPageSize = 2000
        var mOffset = 0
        while (true) {
          var mChunk = []
          try {
            mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mPageSize, mOffset)
          } catch (eM) {
            console.log('[Migration 0063] Erro ao ler movel:', eM)
            break
          }
          if (!mChunk || mChunk.length === 0) break
          for (var mi = 0; mi < mChunk.length; mi++) {
            var mRec = mChunk[mi]
            if (isRefMatcher(mRec.getString('data_referencia'))) {
              movelRows.push(mRec)
            }
          }
          if (mChunk.length < mPageSize) break
          mOffset += mPageSize
        }
      }

      var resRows = []
      if (app.hasTable('residencial')) {
        var rPageSize = 2000
        var rOffset = 0
        while (true) {
          var rChunk = []
          try {
            rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rPageSize, rOffset)
          } catch (eR) {
            console.log('[Migration 0063] Erro ao ler residencial:', eR)
            break
          }
          if (!rChunk || rChunk.length === 0) break
          for (var ri = 0; ri < rChunk.length; ri++) {
            var rRec = rChunk[ri]
            if (isRefMatcher(rRec.getString('data_referencia'))) {
              resRows.push(rRec)
            }
          }
          if (rChunk.length < rPageSize) break
          rOffset += rPageSize
        }
      }

      console.log(
        '[Migration 0063] Referência ' +
          currentRef +
          ': móvel = ' +
          movelRows.length +
          ', residencial = ' +
          resRows.length +
          ', total analítico = ' +
          (movelRows.length + resRows.length),
      )

      var storeAggMap = {}
      var vendorAggMap = {}

      var processSingleRow = function (row) {
        var rawLoja = (row.getString('loja') || '').trim()
        var rawVendedor = (row.getString('vendedor') || '').trim()
        var rawOcorrencia = (row.getString('ocorrencias') || '').trim()

        var normVendedor = normalizeText(rawVendedor)
        var normLoja = normalizeText(rawLoja)

        // Descartar linhas dummy de cabeçalho
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

      for (var mIdx = 0; mIdx < movelRows.length; mIdx++) {
        processSingleRow(movelRows[mIdx])
      }
      for (var rIdx = 0; rIdx < resRows.length; rIdx++) {
        processSingleRow(resRows[rIdx])
      }

      // Salvar fpd_records
      var storeIds = Object.keys(storeAggMap)
      var totalFpdLinhas = 0
      for (var si = 0; si < storeIds.length; si++) {
        var sAgg = storeAggMap[storeIds[si]]
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
            '[Migration 0063] Erro ao salvar fpd_record para ' + sAgg.storeName + ':',
            errSaveFpd,
          )
        }
      }

      // Salvar vendor_consolidations
      var vendorKeys = Object.keys(vendorAggMap)
      for (var vi = 0; vi < vendorKeys.length; vi++) {
        var vAgg = vendorAggMap[vendorKeys[vi]]
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
          console.log('[Migration 0063] Erro ao salvar vendor_consolidation:', errSaveVend)
        }
      }

      console.log(
        '[Migration 0063] Referência ' +
          currentRef +
          ' concluída. Total fpd_records linhas = ' +
          totalFpdLinhas +
          ', lojas = ' +
          storeIds.length +
          ', vendedores = ' +
          vendorKeys.length,
      )
    }

    console.log('[Migration 0063] Concluída com sucesso.')
  },
  (_app) => {},
)
