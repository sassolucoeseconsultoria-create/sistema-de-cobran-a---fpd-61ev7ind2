/// <reference types="pocketbase" />

/**
 * Migration 0045: Reconstruir fpd_records e vendor_consolidations para a referência 26/08/2026.
 *
 * Idempotente: limpa as coleções antes de derivar:
 * 1. fpd_records a partir dos arquivos mais recentes de imported_files (reference_date = '26/08/2026').
 *    Resolve o store_name para o ID real em stores (normalizado, cria se não existir).
 * 2. vendor_consolidations a partir de movel e residencial (data_referencia = '26/08/2026').
 *    Expurga linhas de cabeçalho e classifica ocorrências com supervisão da loja em stores.
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

      // 1. Exact match
      for (var i = 0; i < storesList.length; i++) {
        var s = storesList[i]
        if (normalizeText(s.getString('name')) === inputNorm) {
          return s
        }
      }

      var isCallOrIlhaInput = /\b(call|ilha)\b/.test(inputNorm)
      var hasDfInput = /\bdf\b/.test(inputNorm)
      var hasGoInput = /\bgo\b/.test(inputNorm)

      // 2. Contains match with DF/GO and Call/Ilha protection
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

      // 3. Simplified match (stripping filler terms like celnet, shopping, goiania, boullevard -> boulevard)
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

      // Fatura(s) Paga(s)
      if (
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad')
      ) {
        return 'fatura_paga'
      }

      // Enviado Fatura(s)
      if (
        norm.includes('enviad') ||
        norm.includes('envio') ||
        norm.includes('2 via') ||
        norm.includes('2a via')
      ) {
        return 'envio_fatura'
      }

      // Promessa de Pagto.
      if (norm.includes('promessa')) {
        return 'promessa_pagto'
      }

      // Sem Contato
      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('caixa postal') ||
        norm.includes('recusad') ||
        norm.includes('desligad')
      ) {
        return 'sem_contato'
      }

      // Cancelados
      if (
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv')
      ) {
        return 'cancelados'
      }

      // Pendente
      if (
        norm.includes('pendente') ||
        norm.includes('em analise') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando')
      ) {
        return 'pendente'
      }

      // Contato Realizado
      if (
        norm.includes('contato') ||
        norm.includes('atendid') ||
        norm.includes('falou') ||
        norm.includes('recado')
      ) {
        return 'contato_realizado'
      }

      // Não Tratados
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

      return 'outros'
    }

    console.log('[Migration 0045] Iniciando reconstrução de fpd_records e vendor_consolidations...')

    // 1. Limpar coleções existentes para garantir idempotência
    try {
      app.db().newQuery('DELETE FROM fpd_records').execute()
      console.log('[Migration 0045] fpd_records limpo.')
    } catch (e1) {
      console.log('[Migration 0045] Aviso ao limpar fpd_records:', e1)
    }

    try {
      app.db().newQuery('DELETE FROM vendor_consolidations').execute()
      console.log('[Migration 0045] vendor_consolidations limpo.')
    } catch (e2) {
      console.log('[Migration 0045] Aviso ao limpar vendor_consolidations:', e2)
    }

    // Carregar todas as lojas do cadastro
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0045] Erro ao carregar stores:', errStores)
    }

    function getOrCreateStore(rawStoreName) {
      var trimmed = (rawStoreName || '').trim()
      if (!trimmed) return null
      var matched = matchStoreRecord(trimmed, allStores)
      if (matched) return matched

      // Criar nova loja
      try {
        var storesColl = app.findCollectionByNameOrId('stores')
        var newStore = new Record(storesColl)
        newStore.set('name', trimmed.toUpperCase())
        app.save(newStore)
        allStores.push(newStore)
        console.log('[Migration 0045] Criada loja:', trimmed.toUpperCase())
        return newStore
      } catch (errCreate) {
        // Fallback retry match
        try {
          var recheck = app.findFirstRecordByData('stores', 'name', trimmed.toUpperCase())
          if (recheck) {
            allStores.push(recheck)
            return recheck
          }
        } catch (_) {}
        console.log('[Migration 0045] Erro ao criar loja ' + trimmed + ':', errCreate)
        return null
      }
    }

    // 2. RECONSTRUIR fpd_records a partir de imported_files (reference_date = '26/08/2026')
    // Como houve reimportações sucessivas das 29 planilhas, agrupamos por loja e pegamos a versão mais recente
    var importedFiles = []
    try {
      importedFiles = app.findRecordsByFilter(
        'imported_files',
        "reference_date = '26/08/2026'",
        '-created',
        500,
        0,
      )
    } catch (errIF) {
      console.log('[Migration 0045] Erro ao buscar imported_files:', errIF)
    }

    console.log('[Migration 0045] Total imported_files encontrados:', importedFiles.length)

    // Agrupar pelo nome/loja pegando o registro mais recente (já ordenado por -created)
    var latestFilePerStore = {}
    for (var i = 0; i < importedFiles.length; i++) {
      var fileRec = importedFiles[i]
      var rawStore = (fileRec.getString('store_name') || '').trim().toUpperCase()
      if (!rawStore) {
        var fname = fileRec.getString('file_name') || ''
        rawStore = fname
          .replace(/\.xlsx$/i, '')
          .trim()
          .toUpperCase()
      }
      if (!rawStore) continue

      // Resolver loja canônica
      var resolvedStore = getOrCreateStore(rawStore)
      var storeKey = resolvedStore ? resolvedStore.id : rawStore

      if (!latestFilePerStore[storeKey]) {
        latestFilePerStore[storeKey] = {
          storeRecord: resolvedStore,
          rawStoreName: rawStore,
          fileRec: fileRec,
        }
      }
    }

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var fpdCount = 0

    var storeKeys = Object.keys(latestFilePerStore)
    for (var k = 0; k < storeKeys.length; k++) {
      var item = latestFilePerStore[storeKeys[k]]
      var sRec = item.storeRecord
      if (!sRec) {
        sRec = getOrCreateStore(item.rawStoreName)
      }
      if (!sRec) {
        console.log('[Migration 0045] Pular gravação FPD sem store ID para:', item.rawStoreName)
        continue
      }

      var f = item.fileRec
      var fpdRecord = new Record(fpdCollection)
      fpdRecord.set('store', sRec.id)
      fpdRecord.set('referente', '26/08/2026')
      fpdRecord.set('total_linhas', f.getInt('total_linhas'))
      fpdRecord.set('fatura_paga', f.getInt('fatura_paga'))
      fpdRecord.set('envio_fatura', f.getInt('envio_fatura') || f.getInt('enviado_faturas'))
      fpdRecord.set('promessa_pagto', f.getInt('promessa_pagto'))
      fpdRecord.set('sem_contato', f.getInt('sem_contato'))
      fpdRecord.set('cancelados', f.getInt('cancelados'))
      fpdRecord.set('pendente', f.getInt('pendente'))
      fpdRecord.set('contato_realizado', f.getInt('contato_realizado'))
      fpdRecord.set('nao_tratados', f.getInt('nao_tratados'))
      fpdRecord.set('outros', f.getInt('outros'))

      try {
        app.save(fpdRecord)
        fpdCount++
      } catch (errSaveFpd) {
        console.log(
          '[Migration 0045] Erro ao salvar fpd_record para ' + sRec.getString('name') + ':',
          errSaveFpd,
        )
      }
    }

    console.log('[Migration 0045] Total de fpd_records reconstruídos:', fpdCount)

    // 3. RECONSTRUIR vendor_consolidations a partir das linhas de movel e residencial (data_referencia '26/08/2026')
    var movelRows = []
    try {
      movelRows = app.findRecordsByFilter('movel', "data_referencia = '26/08/2026'", 'id', 50000, 0)
    } catch (errMovel) {
      console.log('[Migration 0045] Erro ao buscar movel:', errMovel)
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
    } catch (errRes) {
      console.log('[Migration 0045] Erro ao buscar residencial:', errRes)
    }

    console.log(
      '[Migration 0045] Linhas analíticas encontradas - Movel:',
      movelRows.length,
      'Residencial:',
      resRows.length,
    )

    var vendorAggMap = {} // key: `${vendedor}__${loja}`

    function processAnalyticalRow(row) {
      var rawVendedor = (row.getString('vendedor') || '').trim()
      var rawLoja = (row.getString('loja') || '').trim()
      var ocorrenciaRaw = (row.getString('ocorrencias') || '').trim()

      var normVendedor = normalizeText(rawVendedor)
      var normLoja = normalizeText(rawLoja)

      // Expurga cabeçalhos dummy e linhas vazias
      if (
        (normVendedor === 'vendedor' && normLoja === 'loja') ||
        (normVendedor === 'vendedor' && !rawLoja) ||
        (normVendedor === 'vendedor' && normLoja === 'vendedor')
      ) {
        return
      }

      var vendedorUpper = rawVendedor ? rawVendedor.toUpperCase() : 'NÃO INFORMADO'
      if (vendedorUpper === 'VENDEDOR') return

      var lojaStore = matchStoreRecord(rawLoja, allStores)
      var resolvedLojaName = lojaStore
        ? lojaStore.getString('name').toUpperCase()
        : rawLoja.toUpperCase()
      var supervisao = lojaStore ? lojaStore.getString('supervisao') || '' : ''

      var key = vendedorUpper + '__' + resolvedLojaName

      if (!vendorAggMap[key]) {
        vendorAggMap[key] = {
          vendedor: vendedorUpper,
          loja: resolvedLojaName,
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
          outros: 0,
          nao_tratados: 0,
        }
      }

      vendorAggMap[key].total_linhas++
      var cat = classifyOcorrencia(ocorrenciaRaw)
      if (cat && vendorAggMap[key][cat] !== undefined) {
        vendorAggMap[key][cat]++
      } else {
        vendorAggMap[key].nao_tratados++
      }
    }

    for (var m = 0; m < movelRows.length; m++) {
      processAnalyticalRow(movelRows[m])
    }
    for (var r = 0; r < resRows.length; r++) {
      processAnalyticalRow(resRows[r])
    }

    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')
    var vendorKeys = Object.keys(vendorAggMap)
    var vendorCount = 0

    console.log('[Migration 0045] Grupos de vendedores encontrados:', vendorKeys.length)

    for (var v = 0; v < vendorKeys.length; v++) {
      var vItem = vendorAggMap[vendorKeys[v]]
      var vRec = new Record(vendorCollection)
      vRec.set('vendedor', vItem.vendedor)
      vRec.set('loja', vItem.loja)
      vRec.set('supervisao', vItem.supervisao)
      vRec.set('data_referencia', vItem.data_referencia)
      vRec.set('total_linhas', vItem.total_linhas)
      vRec.set('fatura_paga', vItem.fatura_paga)
      vRec.set('envio_fatura', vItem.envio_fatura)
      vRec.set('promessa_pagto', vItem.promessa_pagto)
      vRec.set('sem_contato', vItem.sem_contato)
      vRec.set('cancelados', vItem.cancelados)
      vRec.set('pendente', vItem.pendente)
      vRec.set('contato_realizado', vItem.contato_realizado)
      vRec.set('outros', vItem.outros)
      vRec.set('nao_tratados', vItem.nao_tratados)

      try {
        app.save(vRec)
        vendorCount++
      } catch (errSaveVendor) {
        console.log('[Migration 0045] Erro ao salvar vendor_consolidation:', errSaveVendor)
      }
    }

    console.log('[Migration 0045] Total de vendor_consolidations criados:', vendorCount)
  },
  (_app) => {},
)
