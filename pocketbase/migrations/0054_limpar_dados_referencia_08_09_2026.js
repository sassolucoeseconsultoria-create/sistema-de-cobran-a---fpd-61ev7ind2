/// <reference types="pocketbase" />

/**
 * Migration 0054: Limpar definitivamente todos os registros com Data de Referência 08/09/2026.
 *
 * Solicitação do usuário:
 * Limpar (excluir definitivamente) todos os registros importados de Móvel e Residencial cuja
 * Data de Referência seja 08/09/2026, nas cinco coleções que as importações alimentam:
 * 1. `movel` (clientes Móvel — Inadimplência aba Móvel, campo: data_referencia)
 * 2. `residencial` (clientes Residencial — Inadimplência aba Residencial, campo: data_referencia)
 * 3. `fpd_records` (consolidado — Painel de Lojas, campo: referente)
 * 4. `vendor_consolidations` (Ranking por Vendedor e Principais Ofensores, campo: data_referencia)
 * 5. `imported_files` (histórico de arquivos importados, campo: reference_date)
 *
 * Requisitos:
 * - Apagar SOMENTE referência 08/09/2026 e suas variações de formato ("08/09/2026", "08/09/26", "2026-09-08" e equivalentes ISO).
 * - PRESERVAR integralmente: todos os registros das outras referências (principalmente 26/08/2026, que é a base ativa),
 *   usuários, perfis e vínculos, cadastro de lojas com supervisão/coordenação.
 */
migrate(
  (app) => {
    // Helper para determinar se uma string representa exatamente a data de referência 08/09/2026
    function isReference08092026(rawStr) {
      if (!rawStr) return false
      var str = String(rawStr).trim()
      if (!str) return false

      // Correspondência direta com os formatos conhecidos
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

      // Parser de fallback para data DD/MM/YYYY ou DD/MM/YY
      var dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (dmyMatch) {
        var day = parseInt(dmyMatch[1], 10)
        var month = parseInt(dmyMatch[2], 10)
        var year = parseInt(dmyMatch[3], 10)
        if (year < 100) year += 2000
        if (day === 8 && month === 9 && year === 2026) {
          return true
        }
      }

      // Parser para data YYYY-MM-DD
      var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        var iYear = parseInt(isoMatch[1], 10)
        var iMonth = parseInt(isoMatch[2], 10)
        var iDay = parseInt(isoMatch[3], 10)
        if (iDay === 8 && iMonth === 9 && iYear === 2026) {
          return true
        }
      }

      return false
    }

    function cleanCollection0809(colName, fieldName) {
      if (!app.hasTable(colName)) {
        console.log('[Migration 0054] Tabela ' + colName + ' não existe, pulando.')
        return { deleted: 0, before: 0, after: 0 }
      }

      var countBefore = 0
      try {
        countBefore = app.countRecords(colName)
      } catch (_) {
        countBefore = 0
      }

      var idsToDelete = []
      var preservedCount = 0

      // Buscar todos os registros para filtrar em memória garantindo cobertura total
      var pageSize = 2000
      var offset = 0
      while (true) {
        var records = []
        try {
          records = app.findRecordsByFilter(colName, '1=1', 'id', pageSize, offset)
        } catch (errFind) {
          console.log('[Migration 0054] Erro ao buscar registros de ' + colName + ':', errFind)
          break
        }

        if (!records || records.length === 0) break

        for (var i = 0; i < records.length; i++) {
          var rec = records[i]
          var val = rec.getString(fieldName)
          if (isReference08092026(val)) {
            idsToDelete.push(rec.id)
          } else {
            preservedCount++
          }
        }

        if (records.length < pageSize) break
        offset += pageSize
      }

      // Deleção em lote dos IDs identificados
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
          console.log('[Migration 0054] Erro ao deletar batch em ' + colName + ':', errDel)
        }
      }

      // DELETE direto via SQL para garantir qualquer variação exata de 08/09/2026
      try {
        var directSqlRes = app
          .db()
          .newQuery(
            'DELETE FROM ' +
              colName +
              ' WHERE ' +
              fieldName +
              " IN ('08/09/2026', '08/09/26', '2026-09-08') " +
              'OR ' +
              fieldName +
              " LIKE '08/09/2026%' " +
              'OR ' +
              fieldName +
              " LIKE '08/09/26%' " +
              'OR ' +
              fieldName +
              " LIKE '2026-09-08%'",
          )
          .execute()

        if (directSqlRes && typeof directSqlRes.rowsAffected === 'function') {
          var extra = directSqlRes.rowsAffected()
          if (extra > 0) {
            totalDeleted += extra
          }
        }
      } catch (errDirect) {
        console.log('[Migration 0054] Erro no DELETE direto em ' + colName + ':', errDirect)
      }

      var countAfter = 0
      try {
        countAfter = app.countRecords(colName)
      } catch (_) {
        countAfter = 0
      }

      console.log(
        '[Migration 0054] ' +
          colName +
          ' (' +
          fieldName +
          '): antes=' +
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

    console.log('[Migration 0054] Iniciando limpeza definitiva da referência 08/09/2026...')

    // 1. movel (campo: data_referencia)
    var rMovel = cleanCollection0809('movel', 'data_referencia')

    // 2. residencial (campo: data_referencia)
    var rResidencial = cleanCollection0809('residencial', 'data_referencia')

    // 3. fpd_records (campo: referente)
    var rFpd = cleanCollection0809('fpd_records', 'referente')

    // 4. vendor_consolidations (campo: data_referencia)
    var rVendor = cleanCollection0809('vendor_consolidations', 'data_referencia')

    // 5. imported_files (campo: reference_date)
    var rImported = cleanCollection0809('imported_files', 'reference_date')

    console.log('[Migration 0054] Limpeza 08/09/2026 finalizada:', {
      movel: rMovel,
      residencial: rResidencial,
      fpd_records: rFpd,
      vendor_consolidations: rVendor,
      imported_files: rImported,
    })
  },
  (_app) => {
    // Operação de limpeza irreversível via safeDown
  },
)
