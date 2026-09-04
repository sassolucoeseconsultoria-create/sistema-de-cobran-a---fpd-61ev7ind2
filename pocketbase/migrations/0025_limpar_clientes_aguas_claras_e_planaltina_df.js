migrate(
  (app) => {
    // 0025: Limpar dados Gestão de Clientes em Inadimplência das Lojas CELNET AGUAS CLARAS e CELNET PLANALTINA DF
    // Abranger todas as variações de grafia conhecidas e possíveis (com/sem "MATRIZ", "AGUAS CLARA" / "AGUAS CLARAS", com acentos etc.)

    const lojasAlvo = [
      'CELNET AGUAS CLARA',
      'CELNET AGUAS CLARAS',
      'CELNET ÁGUAS CLARAS',
      'CELNET ÁGUAS CLARA',
      'AGUAS CLARAS',
      'AGUAS CLARA',
      'ÁGUAS CLARAS',
      'ÁGUAS CLARA',
      'CELNET MATRIZ PLANALTINA DF',
      'CELNET PLANALTINA DF',
      'CELNET PLANALTINA',
      'MATRIZ PLANALTINA DF',
      'PLANALTINA DF',
    ]

    const lojasAlvoSet = new Set(lojasAlvo.map((s) => s.toUpperCase()))

    let movelDeletedCount = 0
    let residencialDeletedCount = 0
    let relacionamentoDeletedCount = 0

    // 1. Limpeza em 'movel'
    if (app.hasTable('movel')) {
      // Excluir por correspondência exata de lista ou via cláusula LIKE abrangente
      // Mas com cuidado de NÃO excluir outras lojas como 'CELNET PLANALTINA GO'
      const resMovel = app
        .db()
        .newQuery(`
          DELETE FROM movel
          WHERE (
            loja IN ('CELNET AGUAS CLARA', 'CELNET AGUAS CLARAS', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')
            OR loja IN ('CELNET MATRIZ PLANALTINA DF', 'CELNET PLANALTINA DF', 'CELNET PLANALTINA', 'MATRIZ PLANALTINA DF', 'PLANALTINA DF')
            OR (loja LIKE '%AGUAS CLARA%' OR loja LIKE '%ÁGUAS CLARA%')
            OR (loja LIKE '%PLANALTINA%DF%' OR loja LIKE '%PLANALTINA DF%' OR loja = 'CELNET PLANALTINA')
            OR arquivo = 'CELNET AGUAS CLARAS.xlsx'
            OR arquivo = 'CELNET PLANALTINA DF.xlsx'
          )
          AND (loja NOT LIKE '%PLANALTINA%GO%')
        `)
        .execute()

      if (resMovel && typeof resMovel.rowsAffected === 'function') {
        movelDeletedCount = resMovel.rowsAffected()
      }
      console.log(
        `[0025_limpar_clientes_aguas_claras_e_planaltina_df] Movel deletados: ${movelDeletedCount}`,
      )
    }

    // 2. Limpeza em 'residencial'
    if (app.hasTable('residencial')) {
      const resResidencial = app
        .db()
        .newQuery(`
          DELETE FROM residencial
          WHERE (
            loja IN ('CELNET AGUAS CLARA', 'CELNET AGUAS CLARAS', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')
            OR loja IN ('CELNET MATRIZ PLANALTINA DF', 'CELNET PLANALTINA DF', 'CELNET PLANALTINA', 'MATRIZ PLANALTINA DF', 'PLANALTINA DF')
            OR (loja LIKE '%AGUAS CLARA%' OR loja LIKE '%ÁGUAS CLARA%')
            OR (loja LIKE '%PLANALTINA%DF%' OR loja LIKE '%PLANALTINA DF%' OR loja = 'CELNET PLANALTINA')
            OR arquivo = 'CELNET AGUAS CLARAS.xlsx'
            OR arquivo = 'CELNET PLANALTINA DF.xlsx'
          )
          AND (loja NOT LIKE '%PLANALTINA%GO%')
        `)
        .execute()

      if (resResidencial && typeof resResidencial.rowsAffected === 'function') {
        residencialDeletedCount = resResidencial.rowsAffected()
      }
      console.log(
        `[0025_limpar_clientes_aguas_claras_e_planaltina_df] Residencial deletados: ${residencialDeletedCount}`,
      )
    }

    // 3. Limpeza na tabela legada 'relacionamento' se existir
    if (app.hasTable('relacionamento')) {
      const resRel = app
        .db()
        .newQuery(`
          DELETE FROM relacionamento
          WHERE (
            loja IN ('CELNET AGUAS CLARA', 'CELNET AGUAS CLARAS', 'CELNET ÁGUAS CLARAS', 'CELNET ÁGUAS CLARA', 'AGUAS CLARAS', 'AGUAS CLARA', 'ÁGUAS CLARAS', 'ÁGUAS CLARA')
            OR loja IN ('CELNET MATRIZ PLANALTINA DF', 'CELNET PLANALTINA DF', 'CELNET PLANALTINA', 'MATRIZ PLANALTINA DF', 'PLANALTINA DF')
            OR (loja LIKE '%AGUAS CLARA%' OR loja LIKE '%ÁGUAS CLARA%')
            OR (loja LIKE '%PLANALTINA%DF%' OR loja LIKE '%PLANALTINA DF%' OR loja = 'CELNET PLANALTINA')
            OR arquivo = 'CELNET AGUAS CLARAS.xlsx'
            OR arquivo = 'CELNET PLANALTINA DF.xlsx'
          )
          AND (loja NOT LIKE '%PLANALTINA%GO%')
        `)
        .execute()

      if (resRel && typeof resRel.rowsAffected === 'function') {
        relacionamentoDeletedCount = resRel.rowsAffected()
      }
      console.log(
        `[0025_limpar_clientes_aguas_claras_e_planaltina_df] Relacionamento deletados: ${relacionamentoDeletedCount}`,
      )
    }
  },
  (_app) => {
    // Data deletion cannot be reverted
  },
)
