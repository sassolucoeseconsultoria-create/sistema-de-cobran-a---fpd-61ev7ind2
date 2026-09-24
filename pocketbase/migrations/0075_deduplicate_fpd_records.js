/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Deduplicar fpd_records por (store, referente), preservando o registro mais recente (maior updated / importado_em / created)
    try {
      app
        .db()
        .newQuery(`
      DELETE FROM fpd_records
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY store, TRIM(referente)
                   ORDER BY datetime(COALESCE(NULLIF(updated, ''), NULLIF(importado_em, ''), created)) DESC,
                            datetime(COALESCE(NULLIF(importado_em, ''), created)) DESC,
                            datetime(created) DESC,
                            id DESC
                 ) as rn
          FROM fpd_records
        ) WHERE rn = 1
      )
    `)
        .execute()
    } catch (err) {
      console.warn('[0075_deduplicate_fpd_records] Erro ao deduplicar fpd_records:', err)
    }
  },
  (app) => {
    // Reversão não necessária (registros duplicados descartados)
  },
)
