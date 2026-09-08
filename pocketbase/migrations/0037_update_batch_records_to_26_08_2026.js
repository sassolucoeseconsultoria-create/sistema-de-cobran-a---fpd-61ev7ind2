/// <reference types="pocketbase" />

/**
 * Migration 0037: Atualizar registros de lote e analíticos com data_referencia "04/09/2026"
 * para "26/08/2026".
 *
 * Atualiza:
 * 1. imported_files: campo 'reference_date'
 * 2. fpd_records: campo 'referente'
 * 3. vendor_consolidations: campo 'data_referencia'
 * 4. movel: campo 'data_referencia' e substitui "04/09/2026" dentro do campo JSON 'dados'
 * 5. residencial: campo 'data_referencia' e substitui "04/09/2026" dentro do campo JSON 'dados'
 *
 * Tratamento de JSON:
 * PocketBase no goja pode expor campos JSON como array de bytes (slice de uint8), string JSON ou objeto.
 * Esta migração atualiza via SQL e também itera sobre registros com dados em bytes para decodificar,
 * substituir a string "04/09/2026" por "26/08/2026", e ressalvar.
 */
migrate(
  (app) => {
    const OLD_DATE = '04/09/2026'
    const NEW_DATE = '26/08/2026'

    function parseDadosValue(raw) {
      if (!raw) return null
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

      return { __raw_string__: str }
    }

    function replaceDateInObj(val, oldStr, newStr) {
      if (val === null || val === undefined) return val
      if (typeof val === 'string') {
        if (val.indexOf(oldStr) !== -1) {
          return val.split(oldStr).join(newStr)
        }
        return val
      }
      if (Array.isArray(val)) {
        return val.map(function (item) {
          return replaceDateInObj(item, oldStr, newStr)
        })
      }
      if (typeof val === 'object') {
        var updated = {}
        var keys = Object.keys(val)
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i]
          var newKey = k.indexOf(oldStr) !== -1 ? k.split(oldStr).join(newStr) : k
          updated[newKey] = replaceDateInObj(val[k], oldStr, newStr)
        }
        return updated
      }
      return val
    }

    // 1. imported_files (reference_date)
    if (app.hasTable('imported_files')) {
      app
        .db()
        .newQuery(
          'UPDATE imported_files SET reference_date = {:newDate} WHERE reference_date = {:oldDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    // 2. fpd_records (referente)
    if (app.hasTable('fpd_records')) {
      app
        .db()
        .newQuery('UPDATE fpd_records SET referente = {:newDate} WHERE referente = {:oldDate}')
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    // 3. vendor_consolidations (data_referencia)
    if (app.hasTable('vendor_consolidations')) {
      app
        .db()
        .newQuery(
          'UPDATE vendor_consolidations SET data_referencia = {:newDate} WHERE data_referencia = {:oldDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    // 4. movel: data_referencia e campo dados
    if (app.hasTable('movel')) {
      app
        .db()
        .newQuery(
          'UPDATE movel SET data_referencia = {:newDate} WHERE data_referencia = {:oldDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()

      // Atualização via SQL caso dados esteja salvo como texto
      try {
        app
          .db()
          .newQuery(
            'UPDATE movel SET dados = replace(dados, {:oldDate}, {:newDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + OLD_DATE + '%',
          })
          .execute()
      } catch (e) {
        console.log('Aviso ao atualizar JSON dados em movel via SQL:', e)
      }

      // Verificação em nível de Record para tratar caso de bytes / objeto
      try {
        var movelRecords = app.findRecordsByFilter(
          'movel',
          "data_referencia = '26/08/2026' || data_referencia = '04/09/2026'",
          'linha',
          5000,
          0,
        )
        for (var mIdx = 0; mIdx < movelRecords.length; mIdx++) {
          var recM = movelRecords[mIdx]
          var rawD = recM.get('dados')
          var parsedObj = parseDadosValue(rawD)
          if (parsedObj) {
            var rawJsonStr = JSON.stringify(parsedObj)
            if (rawJsonStr.indexOf(OLD_DATE) !== -1) {
              var replacedObj = replaceDateInObj(parsedObj, OLD_DATE, NEW_DATE)
              recM.set('dados', replacedObj)
              app.save(recM)
            }
          }
        }
      } catch (errRecM) {
        console.log('Aviso ao verificar dados JSON em movel:', errRecM)
      }
    }

    // 5. residencial: data_referencia e campo dados
    if (app.hasTable('residencial')) {
      app
        .db()
        .newQuery(
          'UPDATE residencial SET data_referencia = {:newDate} WHERE data_referencia = {:oldDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()

      try {
        app
          .db()
          .newQuery(
            'UPDATE residencial SET dados = replace(dados, {:oldDate}, {:newDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + OLD_DATE + '%',
          })
          .execute()
      } catch (e) {
        console.log('Aviso ao atualizar JSON dados em residencial via SQL:', e)
      }

      try {
        var resRecords = app.findRecordsByFilter(
          'residencial',
          "data_referencia = '26/08/2026' || data_referencia = '04/09/2026'",
          'linha',
          5000,
          0,
        )
        for (var rIdx = 0; rIdx < resRecords.length; rIdx++) {
          var recR = resRecords[rIdx]
          var rawDr = recR.get('dados')
          var parsedObjR = parseDadosValue(rawDr)
          if (parsedObjR) {
            var rawJsonStrR = JSON.stringify(parsedObjR)
            if (rawJsonStrR.indexOf(OLD_DATE) !== -1) {
              var replacedObjR = replaceDateInObj(parsedObjR, OLD_DATE, NEW_DATE)
              recR.set('dados', replacedObjR)
              app.save(recR)
            }
          }
        }
      } catch (errRecR) {
        console.log('Aviso ao verificar dados JSON em residencial:', errRecR)
      }
    }
  },
  (app) => {
    var OLD_DATE = '04/09/2026'
    var NEW_DATE = '26/08/2026'

    if (app.hasTable('imported_files')) {
      app
        .db()
        .newQuery(
          'UPDATE imported_files SET reference_date = {:oldDate} WHERE reference_date = {:newDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    if (app.hasTable('fpd_records')) {
      app
        .db()
        .newQuery('UPDATE fpd_records SET referente = {:oldDate} WHERE referente = {:newDate}')
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    if (app.hasTable('vendor_consolidations')) {
      app
        .db()
        .newQuery(
          'UPDATE vendor_consolidations SET data_referencia = {:oldDate} WHERE data_referencia = {:newDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    if (app.hasTable('movel')) {
      app
        .db()
        .newQuery(
          'UPDATE movel SET data_referencia = {:oldDate} WHERE data_referencia = {:newDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }

    if (app.hasTable('residencial')) {
      app
        .db()
        .newQuery(
          'UPDATE residencial SET data_referencia = {:oldDate} WHERE data_referencia = {:newDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()
    }
  },
)
