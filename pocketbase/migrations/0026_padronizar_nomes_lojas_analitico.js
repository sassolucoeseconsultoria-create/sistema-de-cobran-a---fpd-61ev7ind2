migrate(
  (app) => {
    // 0026: Padronizar nomes de lojas nos registros existentes das tabelas movel e residencial
    // Ex: "CELNET AGUAS CLARA" -> "CELNET AGUAS CLARAS",
    // "CELNET MATRIZ PLANALTINA DF" -> "CELNET PLANALTINA DF"
    // Mantendo consistência com o cadastro oficial das lojas cadastradas na collection stores.

    // 1. Padronizar Águas Claras em movel e residencial
    if (app.hasTable('movel')) {
      app
        .db()
        .newQuery(
          `UPDATE movel 
           SET loja = 'CELNET AGUAS CLARAS' 
           WHERE loja IN ('CELNET AGUAS CLARA', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE movel 
           SET loja = 'CELNET PLANALTINA DF' 
           WHERE loja IN ('CELNET MATRIZ PLANALTINA DF', 'MATRIZ PLANALTINA DF', 'CELNET PLANALTINA')
             AND loja NOT LIKE '%PLANALTINA%GO%'`,
        )
        .execute()
    }

    if (app.hasTable('residencial')) {
      app
        .db()
        .newQuery(
          `UPDATE residencial 
           SET loja = 'CELNET AGUAS CLARAS' 
           WHERE loja IN ('CELNET AGUAS CLARA', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE residencial 
           SET loja = 'CELNET PLANALTINA DF' 
           WHERE loja IN ('CELNET MATRIZ PLANALTINA DF', 'MATRIZ PLANALTINA DF', 'CELNET PLANALTINA')
             AND loja NOT LIKE '%PLANALTINA%GO%'`,
        )
        .execute()
    }

    if (app.hasTable('relacionamento')) {
      app
        .db()
        .newQuery(
          `UPDATE relacionamento 
           SET loja = 'CELNET AGUAS CLARAS' 
           WHERE loja IN ('CELNET AGUAS CLARA', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE relacionamento 
           SET loja = 'CELNET PLANALTINA DF' 
           WHERE loja IN ('CELNET MATRIZ PLANALTINA DF', 'MATRIZ PLANALTINA DF', 'CELNET PLANALTINA')
             AND loja NOT LIKE '%PLANALTINA%GO%'`,
        )
        .execute()
    }
  },
  (_app) => {
    // Reversão não necessária pois padronização preserva semântica
  },
)
