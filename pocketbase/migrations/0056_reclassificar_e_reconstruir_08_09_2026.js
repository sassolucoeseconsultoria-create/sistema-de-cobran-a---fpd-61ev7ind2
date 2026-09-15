/// <reference types="pocketbase" />

/**
 * Migration 0056: Reclassificação do Residencial 08/09/2026 e Reconstrução Consolidada
 *
 * Objetivo:
 * 1. Para a referência 08/09/2026 e variações ("08/09/2026", "08/09/26", "2026-09-08"):
 *    (a) Reclassificar as 567 linhas de `residencial` aplicando a nova regra de prioridade:
 *        - (i) pago=1, fatura contendo "Paga" ou vlr_pago>0 -> "Fatura(s) Paga(s)"
 *        - (ii) virou_fpd=1 / indicador contém "virou fpd" / preventiva_fpd=1 / indicador contém "preventiva fpd" / fatura contém "em aberto" -> "Pendente" (prevalece sobre "Não Tratados")
 *        - (iii) dsc_status_contrato/indicador contendo "cancel"/"desconect" -> "Cancelados"
 *        - (iv) "Não Tratados" apenas se nada acima classificar.
 *    (b) DELETE de `fpd_records` e `vendor_consolidations` da referência 08/09/2026.
 *    (c) Reconstruir `fpd_records` e `vendor_consolidations` a partir de todas as linhas de `movel` + `residencial` dessa referência,
 *        agrupando pela loja da própria linha (resolve-ou-cria em `stores`, mantendo isolamento estrito CALL/ILHA x loja física).
 *    (d) Total consolidado esperado final: 2.152 linhas (1.585 móvel + 567 residencial).
 *    (e) NADA da referência 26/08/2026 nem de outras referências deve ser alterado.
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
      var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        var iYear = parseInt(isoMatch[1], 10)
        var iMonth = parseInt(isoMatch[2], 10)
        var iDay = parseInt(isoMatch[3], 10)
        if (iDay === 8 && iMonth === 9 && iYear === 2026) return true
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

    function classifyOcorrenciaString(rawVal) {
      if (rawVal === null || rawVal === undefined) return null
      var norm = normalizeText(rawVal)
      if (!norm) return null

      if (
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad')
      ) {
        return 'fatura_paga'
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

      return 'nao_tratados'
    }

    console.log(
      '[Migration 0056] Iniciando reclassificação e reconciliação da referência 08/09/2026...',
    )

    // 1. Buscar todas as linhas de `residencial` da referência 08/09/2026
    var allResRows = []
    if (app.hasTable('residencial')) {
      var pageSize = 2000
      var offset = 0
      while (true) {
        var chunk = []
        try {
          chunk = app.findRecordsByFilter('residencial', '1=1', 'id', pageSize, offset)
        } catch (errResFind) {
          console.log('[Migration 0056] Erro ao buscar residencial:', errResFind)
          break
        }
        if (!chunk || chunk.length === 0) break

        for (var c = 0; c < chunk.length; c++) {
          var rRec = chunk[c]
          var rRef = rRec.getString('data_referencia')
          if (isReference08092026(rRef)) {
            allResRows.push(rRec)
          }
        }
        if (chunk.length < pageSize) break
        offset += pageSize
      }
    }
    console.log(
      '[Migration 0056] Linhas residenciais encontradas para 08/09/2026:',
      allResRows.length,
    )

    // Reclassificar as linhas residenciais
    var reclassifiedCount = 0
    for (var ri = 0; ri < allResRows.length; ri++) {
      var row = allResRows[ri]
      var faturaVal = row.getString('fatura')
      var pagoVal = row.getString('pago')
      var vlrPagoVal = row.getString('vlr_pago')
      var indicadorVal = row.getString('indicador')
      var preventivaVal = row.getString('preventiva_fpd')
      var virouFpdVal = row.getString('virou_fpd')
      var dscStatusVal = row.getString('dsc_status_contrato')

      var faturaStr = faturaVal ? String(faturaVal).trim() : ''
      var pagoStr = pagoVal ? String(pagoVal).trim() : ''
      var vlrPagoNum = vlrPagoVal ? parseFloat(String(vlrPagoVal).replace(',', '.')) : NaN

      var isFaturaPaga =
        pagoStr === '1' ||
        normalizeText(pagoStr) === 'pago' ||
        normalizeText(pagoStr) === 'sim' ||
        normalizeText(pagoStr) === 'true' ||
        normalizeText(faturaStr).includes('paga') ||
        (!isNaN(vlrPagoNum) && vlrPagoNum > 0)

      var normIndicador = indicadorVal ? normalizeText(indicadorVal) : ''
      var normPreventiva = preventivaVal ? normalizeText(preventivaVal) : ''
      var normVirou = virouFpdVal ? normalizeText(virouFpdVal) : ''
      var normFatura = faturaStr ? normalizeText(faturaStr) : ''
      var normDscStatus = dscStatusVal ? normalizeText(dscStatusVal) : ''

      var isVirouFpd =
        normVirou === '1' || normVirou.includes('virou fpd') || normIndicador.includes('virou fpd')
      var isPreventivaFpd =
        normPreventiva === '1' ||
        normPreventiva.includes('preventiva fpd') ||
        normIndicador.includes('preventiva fpd')
      var isFaturaEmAberto = normFatura.includes('em aberto') || normFatura.includes('aberto')

      var isPendente = isVirouFpd || isPreventivaFpd || isFaturaEmAberto

      var isCancelado =
        normDscStatus.includes('cancel') ||
        normDscStatus.includes('desconect') ||
        normIndicador.includes('cancel') ||
        normIndicador.includes('desconect')

      var newOcorrencia = 'Não Tratados'
      if (isFaturaPaga) {
        newOcorrencia = 'Fatura(s) Paga(s)'
      } else if (isPendente) {
        newOcorrencia = 'Pendente'
      } else if (isCancelado) {
        newOcorrencia = 'Cancelados'
      } else {
        newOcorrencia = 'Não Tratados'
      }

      var currentOcorrencia = row.getString('ocorrencias')
      if (currentOcorrencia !== newOcorrencia) {
        row.set('ocorrencias', newOcorrencia)
        try {
          app.save(row)
          reclassifiedCount++
        } catch (errSave) {
          console.log(
            '[Migration 0056] Erro ao salvar linha residencial id ' + row.id + ':',
            errSave,
          )
        }
      }
    }
    console.log('[Migration 0056] Linhas residenciais reclassificadas:', reclassifiedCount)

    // 2. Carregar lojas cadastradas
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0056] Erro ao carregar stores:', errStores)
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

    // 3. Excluir fpd_records e vendor_consolidations para a referência 08/09/2026
    var fpdRecordsDeleted = 0
    var vendorConsolidationsDeleted = 0
    try {
      var resDelFpd = app
        .db()
        .newQuery(
          "DELETE FROM fpd_records WHERE referente IN ('08/09/2026', '08/09/26', '2026-09-08') OR referente LIKE '08/09/2026%' OR referente LIKE '08/09/26%' OR referente LIKE '2026-09-08%'",
        )
        .execute()
      if (resDelFpd && typeof resDelFpd.rowsAffected === 'function') {
        fpdRecordsDeleted = resDelFpd.rowsAffected()
      }
    } catch (errDelFpd) {
      console.log('[Migration 0056] Erro ao deletar fpd_records:', errDelFpd)
    }

    try {
      var resDelVend = app
        .db()
        .newQuery(
          "DELETE FROM vendor_consolidations WHERE data_referencia IN ('08/09/2026', '08/09/26', '2026-09-08') OR data_referencia LIKE '08/09/2026%' OR data_referencia LIKE '08/09/26%' OR data_referencia LIKE '2026-09-08%'",
        )
        .execute()
      if (resDelVend && typeof resDelVend.rowsAffected === 'function') {
        vendorConsolidationsDeleted = resDelVend.rowsAffected()
      }
    } catch (errDelVend) {
      console.log('[Migration 0056] Erro ao deletar vendor_consolidations:', errDelVend)
    }

    console.log('[Migration 0056] Deletados antigos de 08/09/2026:', {
      fpd_records: fpdRecordsDeleted,
      vendor_consolidations: vendorConsolidationsDeleted,
    })

    // 4. Buscar todas as linhas de `movel` da referência 08/09/2026
    var allMovelRows = []
    if (app.hasTable('movel')) {
      var mPageSize = 2000
      var mOffset = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mPageSize, mOffset)
        } catch (errMovelFind) {
          console.log('[Migration 0056] Erro ao buscar movel:', errMovelFind)
          break
        }
        if (!mChunk || mChunk.length === 0) break

        for (var mi = 0; mi < mChunk.length; mi++) {
          var mRec = mChunk[mi]
          var mRef = mRec.getString('data_referencia')
          if (isReference08092026(mRef)) {
            allMovelRows.push(mRec)
          }
        }
        if (mChunk.length < mPageSize) break
        mOffset += mPageSize
      }
    }
    console.log('[Migration 0056] Linhas móvel encontradas para 08/09/2026:', allMovelRows.length)

    // 5. Agregação por Loja e por Vendedor
    var storeAggMap = {}
    var vendorAggMap = {}
    var canonicalRefDate = '08/09/2026'

    function processRow(row, isResidencial) {
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
          referente: canonicalRefDate,
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
          data_referencia: canonicalRefDate,
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

    // Processar todas as linhas de móvel
    for (var mIdx = 0; mIdx < allMovelRows.length; mIdx++) {
      processRow(allMovelRows[mIdx], false)
    }

    // Processar todas as linhas de residencial (recarregar dados atualizados com ocorrências salvas)
    for (var rIdx = 0; rIdx < allResRows.length; rIdx++) {
      processRow(allResRows[rIdx], true)
    }

    // 6. Gravar fpd_records
    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var storeIds = Object.keys(storeAggMap)
    var totalLinhasConsolidado = 0
    var fpdRecordsSaved = 0

    for (var sIdx = 0; sIdx < storeIds.length; sIdx++) {
      var sAgg = storeAggMap[storeIds[sIdx]]
      totalLinhasConsolidado += sAgg.total_linhas

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
        fpdRecordsSaved++
      } catch (errSaveFpd) {
        console.log(
          '[Migration 0056] Erro ao salvar fpd_record loja ' + sAgg.storeName + ':',
          errSaveFpd,
        )
      }
    }

    console.log(
      '[Migration 0056] Total fpd_records gravados:',
      fpdRecordsSaved,
      'com soma total_linhas =',
      totalLinhasConsolidado,
    )

    // 7. Gravar vendor_consolidations
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')
    var vendorKeys = Object.keys(vendorAggMap)
    var vendorRecordsSaved = 0

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
        vendorRecordsSaved++
      } catch (errSaveVend) {
        console.log(
          '[Migration 0056] Erro ao salvar vendor_consolidation ' + vAgg.vendedor + ':',
          errSaveVend,
        )
      }
    }

    console.log('[Migration 0056] Total vendor_consolidations gravados:', vendorRecordsSaved)
    console.log(
      '[Migration 0056] Concluído com sucesso. Total consolidado final para 08/09/2026: ' +
        totalLinhasConsolidado,
    )
  },
  (_app) => {},
)
