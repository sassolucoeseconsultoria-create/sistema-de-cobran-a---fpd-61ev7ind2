/// <reference types="pocketbase" />

/**
 * Migration 0086: Transferir as linhas do vendedor LOHRAN RODOVALHO MARTINS
 * que estão na loja CELNET CALL JK para a loja CELNET NOVA SUIÇA — em todas as
 * referências e nas duas abas (Móvel e Residencial).
 *
 * Precedentes do projeto: 0078 (exclusão + reconsolidação CALL JK) e 0079
 * (reconsolidação por loja legítima). Regra obrigatória: APENAS o campo loja
 * das linhas é alterado — vendedor, cliente, telefone, ocorrências, datas,
 * dados e demais campos ficam intactos. Linhas do mesmo vendedor em OUTRAS
 * lojas (Ceilândia, Nerópolis etc.) não são tocadas.
 *
 * Idempotente: na segunda execução não há linhas na origem e a reconsolidação
 * regrava os mesmos totais (no-op efetivo).
 *
 * Padrão de gravação conferido no banco:
 * - movel/residencial.loja        -> NOME da loja (texto)
 * - fpd_records.store             -> ID da loja (relação)
 * - vendor_consolidations.loja    -> NOME da loja (texto)
 */
migrate(
  (app) => {
    // =========================================================================
    // 0. Resolução das lojas pelo cadastro real (stores)
    // =========================================================================
    var allStores = []
    try {
      allStores = app.findRecordsByFilter('stores', '1=1', 'name', 500, 0)
    } catch (eStores) {
      console.log('[Migration 0086] Erro ao carregar stores:', eStores)
    }

    var origemStore = null
    var destinoStore = null
    for (var s = 0; s < allStores.length; s++) {
      var st = allStores[s]
      var stName = String(st.getString('name') || '').trim()
      if (!origemStore && stName.toUpperCase() === 'CELNET CALL JK') {
        origemStore = st
      }
      // Destino: exatamente CELNET NOVA SUIÇA (não confundir com CELNET CALL NOVA SUIÇA)
      if (!destinoStore && stName.toUpperCase() === 'CELNET NOVA SUIÇA') {
        destinoStore = st
      }
    }

    if (!origemStore || !destinoStore) {
      console.log(
        '[Migration 0086] Lojas não encontradas (origem: ' +
          (origemStore ? 'ok' : 'faltando') +
          ', destino: ' +
          (destinoStore ? 'ok' : 'faltando') +
          ') — nada a fazer.',
      )
      return
    }

    var origemId = origemStore.id
    var origemName = String(origemStore.getString('name') || '').trim()
    var destinoId = destinoStore.id
    var destinoName = String(destinoStore.getString('name') || '').trim()

    console.log(
      '[Migration 0086] Transferindo linhas de ' +
        origemName +
        ' (' +
        origemId +
        ') para ' +
        destinoName +
        ' (' +
        destinoId +
        ')',
    )

    var TARGET_VENDORS = ['LOHRAN RODOVALHO MARTINS']

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

    function normalizeVendorName(str) {
      return normalizeText(str).replace(/\s+/g, ' ')
    }

    var targetVendorNorms = {}
    for (var tv = 0; tv < TARGET_VENDORS.length; tv++) {
      targetVendorNorms[normalizeVendorName(TARGET_VENDORS[tv])] = TARGET_VENDORS[tv]
    }

    function isTargetVendor(rawName) {
      if (!rawName) return false
      var norm = normalizeVendorName(rawName)
      return !!targetVendorNorms[norm]
    }

    function isOrigemStore(rawLoja) {
      if (!rawLoja) return false
      var norm = normalizeText(rawLoja)
      return norm === normalizeText(origemName)
    }

    function normalizeDigits(str) {
      if (str === null || str === undefined) return ''
      return String(str).replace(/\D/g, '')
    }

    function normalizeReferenceDate(rawStr) {
      if (!rawStr) return ''
      var str = String(rawStr).trim()
      if (!str) return ''

      var isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (isoMatch) {
        var y = parseInt(isoMatch[1], 10)
        var m = parseInt(isoMatch[2], 10)
        var d = parseInt(isoMatch[3], 10)
        var dd = d < 10 ? '0' + d : '' + d
        var mm = m < 10 ? '0' + m : '' + m
        return dd + '/' + mm + '/' + y
      }

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

    // =========================================================================
    // 1. Transferir as linhas (APENAS o campo loja) em movel e residencial
    // =========================================================================
    var transferStats = {
      movel: 0,
      residencial: 0,
      total: 0,
      byRef: {},
      vendorNamesSeen: {},
    }

    function transferRowsInTable(tableName) {
      if (!app.hasTable(tableName)) {
        console.log('[Migration 0086] Tabela ' + tableName + ' não existe — pulando.')
        return
      }

      var pageSize = 2000
      var offset = 0
      var movedIds = []

      while (true) {
        var chunk = []
        try {
          chunk = app.findRecordsByFilter(tableName, '1=1', 'id', pageSize, offset)
        } catch (eScan) {
          console.log('[Migration 0086] Erro ao ler ' + tableName + ':', eScan)
          break
        }
        if (!chunk || chunk.length === 0) break

        for (var i = 0; i < chunk.length; i++) {
          var rec = chunk[i]
          var rawLoja = rec.getString('loja')
          if (!isOrigemStore(rawLoja)) continue

          var rawVend = rec.getString('vendedor')
          if (!isTargetVendor(rawVend)) continue

          movedIds.push(rec.id)
          transferStats[tableName]++
          transferStats.total++
          transferStats.vendorNamesSeen[String(rawVend).trim().toUpperCase()] = true

          var canRef = normalizeReferenceDate(rec.getString('data_referencia')) || 'SEM REFERÊNCIA'
          if (!transferStats.byRef[canRef]) transferStats.byRef[canRef] = 0
          transferStats.byRef[canRef]++
        }

        if (chunk.length < pageSize) break
        offset += pageSize
      }

      if (movedIds.length === 0) {
        console.log(
          '[Migration 0086] Nenhuma linha a transferir em ' +
            tableName +
            ' (vendedor já transferido ou nunca esteve lá).',
        )
        return
      }

      // UPDATE pontual: altera SOMENTE o campo loja para o NOME da loja de destino
      var batch = 400
      for (var b = 0; b < movedIds.length; b += batch) {
        var chunkIds = movedIds.slice(b, b + batch)
        var quoted = chunkIds
          .map(function (id) {
            return "'" + String(id).replace(/'/g, "''") + "'"
          })
          .join(',')
        try {
          app
            .db()
            .newQuery(
              'UPDATE ' +
                tableName +
                " SET loja = '" +
                destinoName +
                "' WHERE id IN (" +
                quoted +
                ')',
            )
            .execute()
        } catch (eUpd) {
          console.log('[Migration 0086] Erro ao atualizar loja em ' + tableName + ':', eUpd)
        }
      }

      console.log(
        '[Migration 0086] ' +
          tableName +
          ': ' +
          movedIds.length +
          ' linha(s) transferida(s) para ' +
          destinoName,
      )
    }

    transferRowsInTable('movel')
    transferRowsInTable('residencial')

    console.log('================ AUDITORIA DA TRANSFERÊNCIA ================')
    console.log('Linhas transferidas em Móvel: ' + transferStats.movel)
    console.log('Linhas transferidas em Residencial: ' + transferStats.residencial)
    console.log('Total transferido: ' + transferStats.total)
    var seenVendors = Object.keys(transferStats.vendorNamesSeen)
    for (var vv = 0; vv < seenVendors.length; vv++) {
      console.log(' - Vendedor transferido: ' + seenVendors[vv])
    }
    var refsList = Object.keys(transferStats.byRef)
    for (var rr = 0; rr < refsList.length; rr++) {
      console.log(
        ' - Referência ' + refsList[rr] + ': ' + transferStats.byRef[refsList[rr]] + ' linha(s)',
      )
    }
    console.log('============================================================')

    // =========================================================================
    // 2. Reconsolidação das referências afetadas (mesma lógica da 0078/0079):
    //    para cada (loja afetada, referência), regrava fpd_records (por ID da
    //    loja) e vendor_consolidations (por NOME da loja) a partir das linhas
    //    deduplicadas atuais de movel/residencial.
    // =========================================================================
    function extractMovelKey(rec) {
      var rawDados = rec.get('dados')
      var dadosObj = rawDados
      if (typeof dadosObj === 'string') {
        try {
          dadosObj = JSON.parse(dadosObj)
        } catch (_) {
          dadosObj = {}
        }
      }
      if (!dadosObj || typeof dadosObj !== 'object' || Array.isArray(dadosObj)) dadosObj = {}

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

    function extractResidencialKey(rec) {
      var direct = rec.getString('nr_contrato')
      if (direct && direct.trim()) {
        var norm = direct.replace(/[\s.\-_\/\\()]/g, '').toLowerCase()
        if (norm) return norm
      }

      var rawDados = rec.get('dados')
      var dadosObj = rawDados
      if (typeof dadosObj === 'string') {
        try {
          dadosObj = JSON.parse(dadosObj)
        } catch (_) {
          dadosObj = {}
        }
      }
      if (!dadosObj || typeof dadosObj !== 'object' || Array.isArray(dadosObj)) dadosObj = {}

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
            .replace(/[\s.\-_\/\\()]/g, '')
            .toLowerCase()
          if (normD) return normD
        }
      }

      var keys = Object.keys(dadosObj)
      for (var k = 0; k < keys.length; k++) {
        var kNorm = keys[k].toLowerCase().replace(/[\s_]+/g, '')
        if (kNorm === 'nrcontrato' || kNorm === 'contrato') {
          var normFound = String(dadosObj[keys[k]])
            .replace(/[\s.\-_\/\\()]/g, '')
            .toLowerCase()
          if (normFound) return normFound
        }
      }

      return ''
    }

    function fetchRowsByStore(tableName, storeName) {
      var out = []
      if (!app.hasTable(tableName)) return out
      var pageSize = 2000
      var offset = 0
      while (true) {
        var chunk = []
        try {
          chunk = app.findRecordsByFilter(tableName, '1=1', 'id', pageSize, offset)
        } catch (eScan) {
          console.log('[Migration 0086] Erro ao ler ' + tableName + ':', eScan)
          break
        }
        if (!chunk || chunk.length === 0) break
        for (var i = 0; i < chunk.length; i++) {
          if (isOrigemStore(chunk[i].getString('loja'))) {
            out.push(chunk[i])
          }
        }
        if (chunk.length < pageSize) break
        offset += pageSize
      }
      return out
    }

    // Lojas a reconsolidar: a origem (perdeu linhas) e a destino (ganhou linhas)
    var affectedStores = [
      { id: origemId, name: origemName },
      { id: destinoId, name: destinoName },
    ]

    var fpdCollection = app.findCollectionByNameOrId('fpd_records')
    var vendorCollection = app.findCollectionByNameOrId('vendor_consolidations')

    for (var as = 0; as < affectedStores.length; as++) {
      var storeInfo = affectedStores[as]
      var storeRec = null
      for (var fs = 0; fs < allStores.length; fs++) {
        if (allStores[fs].id === storeInfo.id) {
          storeRec = allStores[fs]
          break
        }
      }
      var supervisao = storeRec ? String(storeRec.getString('supervisao') || '') : ''
      if (!supervisao) supervisao = 'Karen'

      // Linhas atuais da loja (após a transferência), agrupadas por referência
      // e por tabela (a deduplicação é específica de cada tabela)
      var rowsByRef = {} // ref -> { movel: [], residencial: [] }
      var movelRows = fetchRowsByStore('movel', storeInfo.name)
      var residencialRows = fetchRowsByStore('residencial', storeInfo.name)

      function pushRowByRef(row, tableKey) {
        var rowRef = normalizeReferenceDate(row.getString('data_referencia'))
        if (!rowRef) return
        if (!rowsByRef[rowRef]) rowsByRef[rowRef] = { movel: [], residencial: [] }
        rowsByRef[rowRef][tableKey].push(row)
      }
      for (var am = 0; am < movelRows.length; am++) pushRowByRef(movelRows[am], 'movel')
      for (var ar = 0; ar < residencialRows.length; ar++)
        pushRowByRef(residencialRows[ar], 'residencial')

      // Referências que já constavam nas consolidações da loja (para zerá-las se
      // ficaram sem linhas — mesmo padrão da 0078)
      var knownRefs = {}
      for (var kr in rowsByRef) knownRefs[kr] = true
      if (app.hasTable('fpd_records')) {
        try {
          var existingFpds = app.findRecordsByFilter(
            'fpd_records',
            "store = '" + storeInfo.id + "'",
            'referente',
            200,
            0,
          )
          for (var ef = 0; ef < existingFpds.length; ef++) {
            var cRef = normalizeReferenceDate(existingFpds[ef].getString('referente'))
            if (cRef) knownRefs[cRef] = true
          }
        } catch (eFpd) {
          console.log('[Migration 0086] Erro ao ler fpd_records de ' + storeInfo.name + ':', eFpd)
        }
      }

      var refsToConsolidate = Object.keys(knownRefs)
      console.log(
        '[Migration 0086] Reconsolidando ' +
          storeInfo.name +
          ' nas referências: ' +
          JSON.stringify(refsToConsolidate),
      )

      for (var ri = 0; ri < refsToConsolidate.length; ri++) {
        var refAtual = refsToConsolidate[ri]
        var refRows = rowsByRef[refAtual] || { movel: [], residencial: [] }

        // Deduplicação canônica fiel (mesma da 0079), específica por tabela
        var deduped = []
        var tableKeys = ['movel', 'residencial']
        for (var tk = 0; tk < tableKeys.length; tk++) {
          var tableKey = tableKeys[tk]
          var rows = refRows[tableKey] || []
          var seenKeys = {}
          for (var di = 0; di < rows.length; di++) {
            var item = rows[di]
            var key =
              tableKey === 'residencial' ? extractResidencialKey(item) : extractMovelKey(item)
            if (!key) {
              deduped.push(item)
              continue
            }
            if (seenKeys[key]) continue
            seenKeys[key] = true
            deduped.push(item)
          }
        }

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

        var processRow = function (row) {
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
              loja: storeInfo.name,
              supervisao: supervisao,
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

        for (var p1 = 0; p1 < deduped.length; p1++) {
          processRow(deduped[p1])
        }

        // --- fpd_records (por ID da loja) ---
        if (storeInfo.id) {
          var existingFpd = null
          try {
            var fpdList = app.findRecordsByFilter(
              'fpd_records',
              "store = '" +
                storeInfo.id +
                "' && (referente = '" +
                refAtual +
                "' || referente = '" +
                refAtual +
                " ')",
              '-created',
              1,
              0,
            )
            if (fpdList && fpdList.length > 0) existingFpd = fpdList[0]
          } catch (_) {}

          var targetFpd = existingFpd || new Record(fpdCollection)
          targetFpd.set('store', storeInfo.id)
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
              '[Migration 0086] fpd_records de ' +
                storeInfo.name +
                ' ref ' +
                refAtual +
                ' gravado (total_linhas = ' +
                storeAgg.total_linhas +
                ')',
            )
          } catch (eSaveFpd) {
            console.log('[Migration 0086] Erro ao salvar fpd_record:', eSaveFpd)
          }
        }

        // --- vendor_consolidations (por NOME da loja) ---
        var existingVendors = []
        try {
          existingVendors = app.findRecordsByFilter(
            'vendor_consolidations',
            "loja = '" +
              storeInfo.name +
              "' && (data_referencia = '" +
              refAtual +
              "' || data_referencia = '" +
              refAtual +
              " ')",
            'vendedor',
            500,
            0,
          )
        } catch (eVendFilter) {
          console.log('[Migration 0086] Erro ao buscar vendor_consolidations:', eVendFilter)
        }

        var existingVendorMap = {}
        for (var ev = 0; ev < existingVendors.length; ev++) {
          var vRecExisting = existingVendors[ev]
          var vUpperExisting = (vRecExisting.getString('vendedor') || '').trim().toUpperCase()
          existingVendorMap[vUpperExisting] = vRecExisting
        }

        for (var vendK in vendorAggMap) {
          var vData = vendorAggMap[vendK]
          var vRecord = existingVendorMap[vendK] || new Record(vendorCollection)

          vRecord.set('vendedor', vData.vendedor)
          vRecord.set('loja', storeInfo.name)
          vRecord.set('supervisao', supervisao)
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
            console.log('[Migration 0086] Erro ao salvar vendor_consolidation:', eSaveVend)
          }

          delete existingVendorMap[vendK]
        }

        // Vendedores que não têm mais linhas na loja/referência: remover o registro
        for (var remK in existingVendorMap) {
          try {
            app.delete(existingVendorMap[remK])
            console.log(
              '[Migration 0086] vendor_consolidations removido para ' +
                remK +
                ' em ' +
                storeInfo.name +
                ' ref ' +
                refAtual,
            )
          } catch (eDelV) {
            console.log('[Migration 0086] Erro ao deletar vendor_consolidation:', eDelV)
          }
        }
      }
    }

    console.log('[Migration 0086] Transferência e reconsolidação concluídas com sucesso!')
  },
  (_app) => {},
)
