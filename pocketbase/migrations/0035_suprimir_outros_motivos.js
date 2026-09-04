/// <reference types="pocketbase" />

/**
 * Migration 0035: Normalização definitiva de ocorrências.
 * Converte qualquer registro histórico com 'Outros Motivos'/'outros' para 'Não Tratados'
 * nas coleções movel, residencial e relacionamento (dados JSON em bytes ou string),
 * garantindo a supressão total da categoria inventada 'outros'.
 */
migrate(
  (app) => {
    // 1. Coleção movel
    try {
      const movelRecords = app.findRecordsByFilter(
        'movel',
        "ocorrencias = 'Outros Motivos' || ocorrencias = 'outros'",
        '-created',
        5000,
      )
      for (const rec of movelRecords) {
        rec.set('ocorrencias', 'Não Tratados')
        app.save(rec)
      }
    } catch (e) {
      // Ignora se não houver registros ou se der erro leve
    }

    // 2. Coleção residencial
    try {
      const resRecords = app.findRecordsByFilter(
        'residencial',
        "ocorrencias = 'Outros Motivos' || ocorrencias = 'outros'",
        '-created',
        5000,
      )
      for (const rec of resRecords) {
        rec.set('ocorrencias', 'Não Tratados')
        app.save(rec)
      }
    } catch (e) {
      // Ignora se não houver registros
    }

    // 3. Coleção relacionamento (interpretação de JSON em formato de bytes/string)
    try {
      const relRecords = app.findRecordsByFilter('relacionamento', '1=1', '-created', 5000)
      for (const rec of relRecords) {
        let rawDados = rec.get('dados')
        if (!rawDados) continue

        let parsed = null
        if (typeof rawDados === 'string') {
          try {
            parsed = JSON.parse(rawDados)
          } catch (_) {
            parsed = null
          }
        } else if (typeof rawDados === 'object') {
          // PocketBase pode entregar Uint8Array/bytes ou objeto
          if (Array.isArray(rawDados) || rawDados.constructor?.name === 'Uint8Array') {
            try {
              const str = String.fromCharCode.apply(null, rawDados)
              parsed = JSON.parse(str)
            } catch (_) {
              parsed = null
            }
          } else {
            parsed = rawDados
          }
        }

        if (parsed && typeof parsed === 'object') {
          let modified = false
          if (parsed.ocorrencias === 'Outros Motivos' || parsed.ocorrencias === 'outros') {
            parsed.ocorrencias = 'Não Tratados'
            modified = true
          }
          if (parsed.OCORRENCIAS === 'Outros Motivos' || parsed.OCORRENCIAS === 'outros') {
            parsed.OCORRENCIAS = 'Não Tratados'
            modified = true
          }
          if (parsed.ocorrencia === 'Outros Motivos' || parsed.ocorrencia === 'outros') {
            parsed.ocorrencia = 'Não Tratados'
            modified = true
          }
          if (modified) {
            rec.set('dados', JSON.stringify(parsed))
            app.save(rec)
          }
        }
      }
    } catch (e) {
      // Ignora se a tabela não existir
    }
  },
  (app) => {
    // Rollback no-op
  },
)
