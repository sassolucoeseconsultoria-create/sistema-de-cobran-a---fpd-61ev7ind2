/// <reference types="pocketbase" />

/**
 * Migration 0036: Alterar a data de Referência da base atual de 04/09/2026 para 26/08/2026.
 *
 * Atualiza:
 * 1. imported_files: campo 'reference_date'
 * 2. fpd_records: campo 'referente'
 * 3. vendor_consolidations: campo 'data_referencia'
 * 4. movel: campo 'data_referencia' e dentro do JSON 'dados' (chaves de data de referência se existirem,
 *    tratando bytes/string/objeto com segurança goja)
 * 5. residencial: campo 'data_referencia' e dentro do JSON 'dados'
 * 6. relacionamento: dentro do JSON 'dados' (se existirem registros)
 */
migrate(
  (app) => {
    const OLD_DATE = '04/09/2026'
    const NEW_DATE = '26/08/2026'

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

    // 4. movel (data_referencia)
    if (app.hasTable('movel')) {
      app
        .db()
        .newQuery(
          'UPDATE movel SET data_referencia = {:newDate} WHERE data_referencia = {:oldDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()

      // Também verificar se dados JSON possui a data 04/09/2026 em texto
      // No SQLite: UPDATE movel SET dados = replace(dados, '04/09/2026', '26/08/2026') WHERE dados LIKE '%04/09/2026%'
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
    }

    // 5. residencial (data_referencia)
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
    }

    // 6. relacionamento (dados JSON se existir)
    if (app.hasTable('relacionamento')) {
      try {
        app
          .db()
          .newQuery(
            'UPDATE relacionamento SET dados = replace(dados, {:oldDate}, {:newDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + OLD_DATE + '%',
          })
          .execute()
      } catch (e) {
        console.log('Aviso ao atualizar JSON dados em relacionamento via SQL:', e)
      }
    }
  },
  (app) => {
    const OLD_DATE = '04/09/2026'
    const NEW_DATE = '26/08/2026'

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

      try {
        app
          .db()
          .newQuery(
            'UPDATE movel SET dados = replace(dados, {:newDate}, {:oldDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + NEW_DATE + '%',
          })
          .execute()
      } catch (_) {}
    }

    if (app.hasTable('residencial')) {
      app
        .db()
        .newQuery(
          'UPDATE residencial SET data_referencia = {:oldDate} WHERE data_referencia = {:newDate}',
        )
        .bind({ newDate: NEW_DATE, oldDate: OLD_DATE })
        .execute()

      try {
        app
          .db()
          .newQuery(
            'UPDATE residencial SET dados = replace(dados, {:newDate}, {:oldDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + NEW_DATE + '%',
          })
          .execute()
      } catch (_) {}
    }

    if (app.hasTable('relacionamento')) {
      try {
        app
          .db()
          .newQuery(
            'UPDATE relacionamento SET dados = replace(dados, {:newDate}, {:oldDate}) WHERE dados LIKE {:likePattern}',
          )
          .bind({
            oldDate: OLD_DATE,
            newDate: NEW_DATE,
            likePattern: '%' + NEW_DATE + '%',
          })
          .execute()
      } catch (_) {}
    }
  },
)
