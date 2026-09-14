/// <reference types="pocketbase" />

/**
 * Migration 0050: Limpar todos os dados com referência >= 08/09/2026 referente Móvel e Residencial.
 *
 * Solicitação do usuário:
 * "Limpar todos os dados com referência >= 08/09/2026 referente Móvel e Residencial."
 *
 * Escopo:
 * Remover todos os registros com Data de Referência >= 08/09/2026 (08/09/2026, 09/09/2026, 10/09/2026 e posteriores)
 * provenientes das importações Móvel e Residencial nas 5 coleções:
 * 1. `movel` (campo: data_referencia)
 * 2. `residencial` (campo: data_referencia)
 * 3. `fpd_records` (campo: referente)
 * 4. `vendor_consolidations` (campo: data_referencia)
 * 5. `imported_files` (campo: reference_date)
 *
 * Preservar obrigatoriamente:
 * - Registros com referência < 08/09/2026 (ex.: 26/08/2026)
 * - Usuários (users)
 * - Lojas e vínculos (stores)
 * - Comentários e promessas de clientes das referências anteriores
 */
migrate(
  (app) => {
    // Helper para converter string de data de referência em timestamp para comparação
    function parseDateToTimestamp(rawStr) {
      if (!rawStr) return null
      var str = String(rawStr).trim()
      if (!str) return null

      // Formato DD/MM/YYYY ou DD/MM/YY (ex.: 08/09/2026, 08/09/26, 26/08/2026)
      var dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var day = parseInt(dmyMatch[1], 10)
        var month = parseInt(dmyMatch[2], 10) - 1
        var year = parseInt(dmyMatch[3], 10)
        if (year < 100) year += 2000
        var dt = new Date(year, month, day, 0, 0, 0, 0)
        return isNaN(dt.getTime()) ? null : dt.getTime()
      }

      // Formato YYYY-MM-DD ou ISO (ex.: 2026-09-08, 2026-09-08 00:00:00.000Z)
      var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        var iYear = parseInt(isoMatch[1], 10)
        var iMonth = parseInt(isoMatch[2], 10) - 1
        var iDay = parseInt(isoMatch[3], 10)
        var iDt = new Date(iYear, iMonth, iDay, 0, 0, 0, 0)
        return isNaN(iDt.getTime()) ? null : iDt.getTime()
      }

      // Outros formatos via Date.parse
      var parsed = Date.parse(str)
      return isNaN(parsed) ? null : parsed
    }

    // Limite de referência: 08/09/2026 00:00:00
    var CUTOFF_TIMESTAMP = new Date(2026, 8, 8, 0, 0, 0, 0).getTime() // Mês 8 = Setembro

    function isReferenceGteCutoff(rawStr) {
      if (!rawStr) return false
      var str = String(rawStr).trim()
      if (!str) return false

      // Verificações rápidas por substring/prefixo conhecidas
      if (
        str.includes('08/09/2026') ||
        str.includes('08/09/26') ||
        str.includes('2026-09-08') ||
        str.includes('09/09/2026') ||
        str.includes('09/09/26') ||
        str.includes('2026-09-09') ||
        str.includes('10/09/2026') ||
        str.includes('10/09/26') ||
        str.includes('2026-09-10') ||
        str.includes('11/09/2026') ||
        str.includes('11/09/26') ||
        str.includes('2026-09-11')
      ) {
        return true
      }

      var ts = parseDateToTimestamp(str)
      if (ts !== null && ts >= CUTOFF_TIMESTAMP) {
        return true
      }

      return false
    }

    function cleanCollectionByField(colName, fieldName) {
      if (!app.hasTable(colName)) {
        console.log('[Migration 0050] Tabela ' + colName + ' não existe, pulando.')
        return { deleted: 0, preserved: 0 }
      }

      var countBefore = 0
      try {
        countBefore = app.countRecords(colName)
      } catch (_) {
        countBefore = 0
      }

      var idsToDelete = []
      var preservedCount = 0

      // Buscar todos os registros em páginas de 2000
      var pageSize = 2000
      var offset = 0
      while (true) {
        var records = []
        try {
          records = app.findRecordsByFilter(colName, '1=1', 'id', pageSize, offset)
        } catch (errFind) {
          console.log('[Migration 0050] Erro ao buscar registros de ' + colName + ':', errFind)
          break
        }

        if (!records || records.length === 0) break

        for (var i = 0; i < records.length; i++) {
          var rec = records[i]
          var val = rec.getString(fieldName)
          if (isReferenceGteCutoff(val)) {
            idsToDelete.push(rec.id)
          } else {
            preservedCount++
          }
        }

        if (records.length < pageSize) break
        offset += pageSize
      }

      // Executar deleção em batches via SQL
      var totalDeleted = 0
      var batchDeleteSize = 500
      for (var b = 0; b < idsToDelete.length; b += batchDeleteSize) {
        var chunk = idsToDelete.slice(b, b + batchDeleteSize)
        var quotedIds = chunk
          .map(function (id) {
            return "'" + id.replace(/'/g, "''") + "'"
          })
          .join(',')

        try {
          var res = app
            .db()
            .newQuery('DELETE FROM ' + colName + ' WHERE id IN (' + quotedIds + ')')
            .execute()
          if (res && typeof res.rowsAffected === 'function') {
            totalDeleted += res.rowsAffected()
          } else {
            totalDeleted += chunk.length
          }
        } catch (errDel) {
          console.log('[Migration 0050] Erro ao deletar batch em ' + colName + ':', errDel)
        }
      }

      // Executar também deleção direta por SQL como garantia de segurança para os formatos literais
      try {
        var directSqlRes = app
          .db()
          .newQuery(
            'DELETE FROM ' +
              colName +
              ' WHERE ' +
              fieldName +
              " IN ('08/09/2026', '08/09/26', '2026-09-08', '09/09/2026', '09/09/26', '2026-09-09', '10/09/2026', '10/09/26', '2026-09-10', '11/09/2026', '11/09/26', '2026-09-11') " +
              'OR ' +
              fieldName +
              " LIKE '08/09/2026%' " +
              'OR ' +
              fieldName +
              " LIKE '09/09/2026%' " +
              'OR ' +
              fieldName +
              " LIKE '10/09/2026%' " +
              'OR ' +
              fieldName +
              " LIKE '11/09/2026%' " +
              'OR ' +
              fieldName +
              " LIKE '2026-09-08%' " +
              'OR ' +
              fieldName +
              " LIKE '2026-09-09%' " +
              'OR ' +
              fieldName +
              " LIKE '2026-09-10%' " +
              'OR ' +
              fieldName +
              " LIKE '2026-09-11%'",
          )
          .execute()

        if (directSqlRes && typeof directSqlRes.rowsAffected === 'function') {
          var extra = directSqlRes.rowsAffected()
          if (extra > 0) {
            console.log(
              '[Migration 0050] SQL direto deletou mais ' + extra + ' registros em ' + colName,
            )
            totalDeleted += extra
          }
        }
      } catch (errDirect) {
        console.log('[Migration 0050] Erro no DELETE direto em ' + colName + ':', errDirect)
      }

      var countAfter = 0
      try {
        countAfter = app.countRecords(colName)
      } catch (_) {
        countAfter = 0
      }

      console.log(
        '[Migration 0050] ' +
          colName +
          ': antes=' +
          countBefore +
          ', deletados=' +
          totalDeleted +
          ', restantes=' +
          countAfter +
          ' (preservados=' +
          preservedCount +
          ')',
      )

      return { before: countBefore, deleted: totalDeleted, after: countAfter }
    }

    console.log('[Migration 0050] Iniciando limpeza de dados com referência >= 08/09/2026...')

    // 1. movel (campo: data_referencia)
    var rMovel = cleanCollectionByField('movel', 'data_referencia')

    // 2. residencial (campo: data_referencia)
    var rResidencial = cleanCollectionByField('residencial', 'data_referencia')

    // 3. fpd_records (campo: referente)
    var rFpd = cleanCollectionByField('fpd_records', 'referente')

    // 4. vendor_consolidations (campo: data_referencia)
    var rVendor = cleanCollectionByField('vendor_consolidations', 'data_referencia')

    // 5. imported_files (campo: reference_date)
    var rImported = cleanCollectionByField('imported_files', 'reference_date')

    console.log('[Migration 0050] Limpeza concluída com sucesso.', {
      movel: rMovel,
      residencial: rResidencial,
      fpd_records: rFpd,
      vendor_consolidations: rVendor,
      imported_files: rImported,
    })
  },
  (_app) => {
    // Operação de limpeza de dados é irreversível via safeDown
  },
)
