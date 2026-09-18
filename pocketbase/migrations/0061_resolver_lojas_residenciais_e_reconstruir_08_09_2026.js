/// <reference types="pocketbase" />

/**
 * Migration 0061: Preencher Loja de Linhas Residenciais Vazias e Reconstruir Consolidado 08/09/2026
 *
 * Contexto:
 * Registros de `residencial` com data_referencia = '08/09/2026' estavam com loja = ""
 * (por falta de fallback no parser analítico quando o cabeçalho não era 'Loja').
 * Devido a loja="", essas linhas foram descartadas no getOrCreateStore() das migrações anteriores,
 * gerando a divergência: Painel de Lojas (4.404) vs Inadimplência (3.954 na ref ou 4.404 somando sem loja).
 *
 * Objetivo desta migração:
 * 1. Para cada registro de `residencial` com loja = "" ou null:
 *    - Tentar obter o arquivo de origem (arquivo) e derivar a loja pelo nome do arquivo (guessStoreName)
 *      ou consultando imported_files;
 *    - Se ainda assim não encontrar, derivar do campo `dados` (ex: chave "loja" ou coluna 46/4)
 *    - Se nada identificar, atribuir "LOJA NÃO IDENTIFICADA" (ou combinar com a loja canônica do arquivo).
 *    - Salvar o registro residencial atualizado com a loja resolvida.
 *
 * 2. Atualizar permissões de data_referencia 08/09/2026 caso estejam todas falsas sem intenção:
 *    - Garantir que a referência 08/09/2026 esteja habilitada para os perfis.
 *
 * 3. DELETE de `fpd_records` e `vendor_consolidations` da referência 08/09/2026.
 *
 * 4. Reconstruir `fpd_records` e `vendor_consolidations` para 08/09/2026 a partir de TODAS as linhas
 *    de `movel` + `residencial` agrupadas por loja (agora 100% com loja preenchida).
 *    Total Painel de Lojas = Total Inadimplência na referência 08/09/2026.
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
      '[Migration 0061] Iniciando correção de lojas residenciais vazias e reconstrução 08/09/2026...',
    )

    // Carregar lojas existentes
    var storesCollection = app.findCollectionByNameOrId('stores')
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (errStores) {
      console.log('[Migration 0061] Erro ao carregar stores:', errStores)
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

    // Carregar imported_files para mapear file_name -> loja ou store
    var fileToStoreMap = {}
    try {
      var impFiles = app.findRecordsByFilter('imported_files', '1=1', 'id', 200, 0)
      for (var f = 0; f < impFiles.length; f++) {
        var ifRec = impFiles[f]
        var fname = ifRec.getString('file_name')
        var fstoreId = ifRec.getString('store')
        if (fname && fstoreId) {
          fileToStoreMap[fname] = fstoreId
        }
      }
    } catch (eImp) {
      console.log('[Migration 0061] Erro ao ler imported_files:', eImp)
    }

    // Função para adivinhar a loja pelo nome do arquivo
    function guessStoreFromFileName(fileName) {
      if (!fileName) return ''
      var base = fileName.replace(/\.[^/.]+$/, '').trim()
      var cleaned = base
        .replace(/^[-\s_]+|[-\s_]+$/g, '')
        .replace(/^(base|inadimplencia|relatorio|fpd|preventiva)\b/gi, '')
        .replace(/\b(de|a|ate)\b/gi, '')
        .replace(/\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b/g, '')
        .replace(
          /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi,
          '',
        )
        .replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/gi, '')
        .replace(/\b20\d{2}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (cleaned.length >= 2) {
        return cleaned.toUpperCase()
      }
      return ''
    }

    // 1. Atualizar registros em `residencial` onde loja = "" ou null
    var updatedResCount = 0
    if (app.hasTable('residencial')) {
      var pageSize = 2000
      var offset = 0
      while (true) {
        var chunk = []
        try {
          chunk = app.findRecordsByFilter(
            'residencial',
            'loja = "" || loja = null',
            'id',
            pageSize,
            offset,
          )
        } catch (errResFind) {
          console.log('[Migration 0061] Erro ao buscar residencial com loja vazia:', errResFind)
          break
        }
        if (!chunk || chunk.length === 0) break

        for (var c = 0; c < chunk.length; c++) {
          var rRec = chunk[c]
          var currentLoja = (rRec.getString('loja') || '').trim()
          if (!currentLoja) {
            var fileName = rRec.getString('arquivo')
            var resolvedLoja = ''

            // 1. Tentar via imported_files storeId
            if (fileName && fileToStoreMap[fileName]) {
              var sId = fileToStoreMap[fileName]
              for (var si = 0; si < allStores.length; si++) {
                if (allStores[si].id === sId) {
                  resolvedLoja = allStores[si].getString('name')
                  break
                }
              }
            }

            // 2. Tentar via dados JSON (ex: dados.loja ou coluna AU/46 ou coluna 4)
            if (!resolvedLoja) {
              try {
                var dadosRaw = rRec.get('dados')
                if (dadosRaw && typeof dadosRaw === 'object') {
                  if (dadosRaw.loja && String(dadosRaw.loja).trim()) {
                    resolvedLoja = String(dadosRaw.loja).trim()
                  } else if (dadosRaw['46'] && String(dadosRaw['46']).trim()) {
                    resolvedLoja = String(dadosRaw['46']).trim()
                  } else if (dadosRaw['4'] && String(dadosRaw['4']).trim()) {
                    resolvedLoja = String(dadosRaw['4']).trim()
                  }
                }
              } catch (_) {}
            }

            // 3. Tentar pelo nome do arquivo
            if (!resolvedLoja && fileName) {
              var guessed = guessStoreFromFileName(fileName)
              if (guessed) {
                var matchG = matchStoreRecord(guessed, allStores)
                resolvedLoja = matchG ? matchG.getString('name') : guessed
              }
            }

            // 4. Fallback final: LOJA NÃO IDENTIFICADA
            if (!resolvedLoja) {
              resolvedLoja = 'LOJA NÃO IDENTIFICADA'
            }

            // Normalizar com as lojas do cadastro
            var matchFin = matchStoreRecord(resolvedLoja, allStores)
            var finalLojaName = matchFin ? matchFin.getString('name') : resolvedLoja.toUpperCase()

            rRec.set('loja', finalLojaName)
            try {
              app.save(rRec)
              updatedResCount++
            } catch (errSaveRes) {
              console.log(
                '[Migration 0061] Erro ao salvar residencial ' + rRec.id + ':',
                errSaveRes,
              )
            }
          }
        }
        if (chunk.length < pageSize) break
        offset += pageSize
      }
    }
    console.log('[Migration 0061] Linhas residenciais atualizadas com loja:', updatedResCount)

    // 2. Garantir permissões de 08/09/2026 habilitadas em reference_date_permissions
    try {
      if (app.hasTable('reference_date_permissions')) {
        var perms = app.findRecordsByFilter(
          'reference_date_permissions',
          "referente ~ '08/09/2026'",
          'id',
          10,
          0,
        )
        for (var pIdx = 0; pIdx < perms.length; pIdx++) {
          var pRec = perms[pIdx]
          // Se todos os perfis estiverem explicitamente como false, resetar para true
          if (
            pRec.getBool('gerente') === false &&
            pRec.getBool('supervisor') === false &&
            pRec.getBool('coordenador') === false
          ) {
            pRec.set('gerente', true)
            pRec.set('supervisor', true)
            pRec.set('coordenador', true)
            app.save(pRec)
            console.log('[Migration 0061] Permissões de 08/09/2026 reabilitadas para true.')
          }
        }
      }
    } catch (errPerm) {
      console.log('[Migration 0061] Erro ao ajustar permissões:', errPerm)
    }

    // 3. Excluir fpd_records e vendor_consolidations para a referência 08/09/2026
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM fpd_records WHERE referente IN ('08/09/2026', '08/09/26', '2026-09-08') OR referente LIKE '08/09/2026%' OR referente LIKE '08/09/26%' OR referente LIKE '2026-09-08%'",
        )
        .execute()
    } catch (errDelFpd) {
      console.log('[Migration 0061] Erro ao deletar fpd_records:', errDelFpd)
    }

    try {
      app
        .db()
        .newQuery(
          "DELETE FROM vendor_consolidations WHERE data_referencia IN ('08/09/2026', '08/09/26', '2026-09-08') OR data_referencia LIKE '08/09/2026%' OR data_referencia LIKE '08/09/26%' OR data_referencia LIKE '2026-09-08%'",
        )
        .execute()
    } catch (errDelVend) {
      console.log('[Migration 0061] Erro ao deletar vendor_consolidations:', errDelVend)
    }

    // 4. Buscar todas as linhas de `movel` e `residencial` para 08/09/2026
    var allMovelRows = []
    if (app.hasTable('movel')) {
      var mPageSize = 2000
      var mOffset = 0
      while (true) {
        var mChunk = []
        try {
          mChunk = app.findRecordsByFilter('movel', '1=1', 'id', mPageSize, mOffset)
        } catch (errMovelFind) {
          console.log('[Migration 0061] Erro ao buscar movel:', errMovelFind)
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

    var allResRows = []
    if (app.hasTable('residencial')) {
      var rPageSize = 2000
      var rOffset = 0
      while (true) {
        var rChunk = []
        try {
          rChunk = app.findRecordsByFilter('residencial', '1=1', 'id', rPageSize, rOffset)
        } catch (errResFindAll) {
          console.log('[Migration 0061] Erro ao buscar residencial:', errResFindAll)
          break
        }
        if (!rChunk || rChunk.length === 0) break

        for (var ri = 0; ri < rChunk.length; ri++) {
          var rRecord = rChunk[ri]
          var rRef = rRecord.getString('data_referencia')
          if (isReference08092026(rRef)) {
            allResRows.push(rRecord)
          }
        }
        if (rChunk.length < rPageSize) break
        rOffset += rPageSize
      }
    }

    console.log(
      '[Migration 0061] Linhas 08/09/2026 a consolidar: móvel = ' +
        allMovelRows.length +
        ', residencial = ' +
        allResRows.length,
    )

    // 5. Agrupamento por Loja e por Vendedor
    var storeAggMap = {}
    var vendorAggMap = {}
    var canonicalRefDate = '08/09/2026'

    function processRow(row) {
      var rawLoja = (row.getString('loja') || '').trim()
      var rawVendedor = (row.getString('vendedor') || '').trim()
      var rawOcorrencia = (row.getString('ocorrencias') || '').trim()

      var normVendedor = normalizeText(rawVendedor)
      var normLoja = normalizeText(rawLoja)

      // Descartar cabeçalhos acidentais
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

    for (var m = 0; m < allMovelRows.length; m++) {
      processRow(allMovelRows[m])
    }
    for (var r = 0; r < allResRows.length; r++) {
      processRow(allResRows[r])
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
        console.log('[Migration 0061] Erro ao salvar fpd_record:', errSaveFpd)
      }
    }

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
        console.log('[Migration 0061] Erro ao salvar vendor_consolidation:', errSaveVend)
      }
    }

    console.log('[Migration 0061] Finalizado com sucesso:', {
      fpdRecordsSaved: fpdRecordsSaved,
      vendorRecordsSaved: vendorRecordsSaved,
      totalLinhasConsolidado: totalLinhasConsolidado,
    })
  },
  (_app) => {},
)
