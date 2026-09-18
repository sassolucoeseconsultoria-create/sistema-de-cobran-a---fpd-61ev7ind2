/// <reference types="pocketbase" />

/**
 * Migration 0060: Deduplicação retroativa em `movel` e `residencial`.
 *
 * Solicitação:
 * - Chave: NR_CONTRATO no Residencial / Número da primeira coluna no Móvel,
 *   normalizada por trim/separadores/minúsculas.
 * - Unicidade por data_referencia + chave normalizada.
 * - Mantém o registro mais recente (maior created/updated) ou preferindo o com
 *   comentários ou promessa preenchidos, excluindo os demais duplicados.
 * - Idempotente (se executada novamente, 0 duplicados encontrados).
 */
migrate(
  (app) => {
    function normalizeClientKey(raw) {
      if (raw === null || raw === undefined) return ''
      var str = String(raw).trim()
      if (!str) return ''
      return str.replace(/[\s.\-_/\\()]/g, '').toLowerCase()
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

    function extractResidencialKeyFromRecord(rec) {
      var direct = rec.getString('nr_contrato')
      if (direct && direct.trim()) {
        var norm = normalizeClientKey(direct)
        if (norm) return norm
      }

      var rawDados = rec.get('dados')
      var dadosObj = parseDadosValue(rawDados)
      var keys = Object.keys(dadosObj)
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

      for (var k = 0; k < keys.length; k++) {
        var kNorm = keys[k].toLowerCase().replace(/[\s_]+/g, '')
        if (kNorm === 'nrcontrato' || kNorm === 'contrato') {
          var normFound = normalizeClientKey(dadosObj[keys[k]])
          if (normFound) return normFound
        }
      }

      return ''
    }

    function extractMovelKeyFromRecord(rec) {
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

    function calculateRecordScore(rec) {
      var score = 0
      var comentarios = (rec.getString('comentarios') || '').trim()
      var promessa = (rec.getString('data_promessa_de_pagto') || '').trim()
      var ocorrencias = (rec.getString('ocorrencias') || '').trim()

      if (comentarios) score += 20
      if (promessa) score += 20
      if (
        ocorrencias &&
        ocorrencias.toLowerCase() !== 'não tratados' &&
        ocorrencias.toLowerCase() !== 'nao tratados'
      ) {
        score += 10
      }

      // Desempate temporal: updated/created
      var updatedStr = rec.getString('updated') || rec.getString('created') || ''
      var timeMs = 0
      if (updatedStr) {
        var parsedTime = Date.parse(updatedStr)
        if (!isNaN(parsedTime)) {
          timeMs = parsedTime
        }
      }

      return { score: score, timeMs: timeMs }
    }

    function deduplicateCollection(colName, isResidencial) {
      if (!app.hasTable(colName)) {
        console.log('[Migration 0060] Tabela ' + colName + ' não existe, pulando.')
        return { totalExamined: 0, removedCount: 0, groupsCount: 0, byRef: {} }
      }

      console.log('[Migration 0060] Iniciando deduplicação em ' + colName + '...')

      var pageSize = 2000
      var offset = 0
      var groups = {}
      var totalExamined = 0
      var byRef = {}

      while (true) {
        var records = []
        try {
          records = app.findRecordsByFilter(colName, '1=1', 'id', pageSize, offset)
        } catch (err) {
          console.log('[Migration 0060] Erro ao ler ' + colName + ':', err)
          break
        }

        if (!records || records.length === 0) break

        for (var i = 0; i < records.length; i++) {
          var rec = records[i]
          totalExamined++
          var ref = (rec.getString('data_referencia') || '').trim()
          var key = isResidencial
            ? extractResidencialKeyFromRecord(rec)
            : extractMovelKeyFromRecord(rec)

          if (!ref || !key) {
            // Sem chave normalizada ou sem referência: preserva individualmente sem colapsar
            continue
          }

          var compositeKey = ref + '::' + key
          if (!groups[compositeKey]) {
            groups[compositeKey] = {
              ref: ref,
              key: key,
              records: [],
            }
          }
          groups[compositeKey].records.push(rec)
        }

        if (records.length < pageSize) break
        offset += pageSize
      }

      var idsToDelete = []
      var groupsWithDupes = 0

      var groupKeys = Object.keys(groups)
      for (var g = 0; g < groupKeys.length; g++) {
        var grp = groups[groupKeys[g]]
        if (grp.records.length <= 1) continue

        groupsWithDupes++
        // Encontrar o melhor registro do grupo
        var bestIndex = 0
        var bestRating = calculateRecordScore(grp.records[0])

        for (var r = 1; r < grp.records.length; r++) {
          var currentRating = calculateRecordScore(grp.records[r])
          if (
            currentRating.score > bestRating.score ||
            (currentRating.score === bestRating.score && currentRating.timeMs > bestRating.timeMs)
          ) {
            bestIndex = r
            bestRating = currentRating
          }
        }

        var survivor = grp.records[bestIndex]
        var survivorComentarios = (survivor.getString('comentarios') || '').trim()
        var survivorPromessa = (survivor.getString('data_promessa_de_pagto') || '').trim()
        var survivorOcorrencias = (survivor.getString('ocorrencias') || '').trim()
        var survivorNeedsSave = false

        // Para os outros, marcar para exclusão e mesclar dados se o sobrevivente estiver vazio
        for (var d = 0; d < grp.records.length; d++) {
          if (d === bestIndex) continue
          var victim = grp.records[d]
          idsToDelete.push(victim.id)

          var vCom = (victim.getString('comentarios') || '').trim()
          var vPro = (victim.getString('data_promessa_de_pagto') || '').trim()
          var vOco = (victim.getString('ocorrencias') || '').trim()

          if (!survivorComentarios && vCom) {
            survivor.set('comentarios', vCom)
            survivorComentarios = vCom
            survivorNeedsSave = true
          }
          if (!survivorPromessa && vPro) {
            survivor.set('data_promessa_de_pagto', vPro)
            survivorPromessa = vPro
            survivorNeedsSave = true
          }
          if (
            (!survivorOcorrencias ||
              survivorOcorrencias.toLowerCase() === 'não tratados' ||
              survivorOcorrencias.toLowerCase() === 'nao tratados') &&
            vOco &&
            vOco.toLowerCase() !== 'não tratados' &&
            vOco.toLowerCase() !== 'nao tratados'
          ) {
            survivor.set('ocorrencias', vOco)
            survivorOcorrencias = vOco
            survivorNeedsSave = true
          }

          var refBucket = grp.ref || 'SEM_REFERENCIA'
          byRef[refBucket] = (byRef[refBucket] || 0) + 1
        }

        if (survivorNeedsSave) {
          try {
            app.save(survivor)
          } catch (saveErr) {
            console.log(
              '[Migration 0060] Erro ao atualizar sobrevivente ' + survivor.id + ':',
              saveErr,
            )
          }
        }
      }

      // Executar exclusão dos registros duplicados em lotes seguros
      var totalDeleted = 0
      var batchSize = 400
      for (var b = 0; b < idsToDelete.length; b += batchSize) {
        var chunk = idsToDelete.slice(b, b + batchSize)
        var quoted = chunk
          .map(function (id) {
            return "'" + id.replace(/'/g, "''") + "'"
          })
          .join(',')
        try {
          var res = app
            .db()
            .newQuery('DELETE FROM ' + colName + ' WHERE id IN (' + quoted + ')')
            .execute()
          if (res && typeof res.rowsAffected === 'function') {
            totalDeleted += res.rowsAffected()
          } else {
            totalDeleted += chunk.length
          }
        } catch (delErr) {
          console.log('[Migration 0060] Erro ao deletar duplicatas em ' + colName + ':', delErr)
        }
      }

      console.log(
        '[Migration 0060] Concluído para ' +
          colName +
          ': ' +
          totalDeleted +
          ' duplicata(s) removida(s) de ' +
          groupsWithDupes +
          ' grupo(s).',
        JSON.stringify(byRef),
      )

      return {
        totalExamined: totalExamined,
        removedCount: totalDeleted,
        groupsCount: groupsWithDupes,
        byRef: byRef,
      }
    }

    var rMovel = deduplicateCollection('movel', false)
    var rResidencial = deduplicateCollection('residencial', true)

    console.log('[Migration 0060] Relatório de deduplicação retroativa:', {
      movel: rMovel,
      residencial: rResidencial,
    })
  },
  (_app) => {
    // Operação de limpeza idempotente
  },
)
