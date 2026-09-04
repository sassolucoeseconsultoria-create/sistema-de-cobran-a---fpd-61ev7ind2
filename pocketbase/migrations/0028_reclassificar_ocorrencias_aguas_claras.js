migrate(
  (app) => {
    // 0028: Reclassificar ocorrências das linhas existentes importadas do arquivo "CELNET AGUAS CLARAS.xlsx"
    // a partir do valor original preservado no JSON 'dados' de cada registro.
    // Regra:
    // 1. Procurar nas chaves do JSON por uma chave que contenha 'ocorren' (ou fallback status/situacao)
    // 2. Classificar valor da célula:
    //    - "paga" / "pago" / "quitad" / "liquidad" -> "Fatura(s) Paga(s)"
    //    - "enviad" / "envio" / "2 via" -> "Enviado Fatura(s)"
    //    - "contato" / "atendid" / "falou" -> "Contato Realizado"
    //    - "promessa" -> "Promessa de Pagto."
    //    - "sem contato" / "nao atende" -> "Sem Contato"
    //    - "cancel" / "fraude" / "desist" -> "Cancelados"
    //    - "pendente" -> "Pendente"
    //    - vazio / não tratado -> "Não Tratados"

    function normalizeText(str) {
      if (!str) return ''
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\r\n\t_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function classifyVal(rawVal) {
      const norm = normalizeText(rawVal)
      if (!norm) return 'Não Tratados'

      if (
        norm.includes('enviad') ||
        norm.includes('envio') ||
        norm.includes('2 via') ||
        norm.includes('2a via')
      ) {
        return 'Enviado Fatura(s)'
      }

      if (norm.includes('promessa')) {
        return 'Promessa de Pagto.'
      }

      if (
        norm.includes('paga') ||
        norm.includes('pago') ||
        norm.includes('quitad') ||
        norm.includes('liquidad')
      ) {
        return 'Fatura(s) Paga(s)'
      }

      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('caixa postal')
      ) {
        return 'Sem Contato'
      }

      if (
        norm.includes('cancel') ||
        norm.includes('fraude') ||
        norm.includes('desist') ||
        norm.includes('devolv')
      ) {
        return 'Cancelados'
      }

      if (
        norm.includes('pendente') ||
        norm.includes('em analise') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando')
      ) {
        return 'Pendente'
      }

      if (
        norm.includes('contato') ||
        norm.includes('atendid') ||
        norm.includes('falou') ||
        norm.includes('recado')
      ) {
        return 'Contato Realizado'
      }

      if (
        norm.includes('nao tratado') ||
        norm.includes('nao trabalh') ||
        norm.includes('a tratar')
      ) {
        return 'Não Tratados'
      }

      return 'Outros Motivos'
    }

    function extractOcorrenciaValueFromDados(dadosObj) {
      if (!dadosObj || typeof dadosObj !== 'object') return null

      const keys = Object.keys(dadosObj)
      // 1. Procurar chave que contenha "ocorren" com prioridade de exatidão
      let bestKey = null
      let bestScore = -1

      for (const k of keys) {
        const normKey = normalizeText(k)
        if (normKey.includes('ocorren')) {
          let score = 1
          if (normKey === 'ocorrencias' || normKey === 'ocorrencia') {
            score = 3
          } else if (normKey.startsWith('ocorrencias') || normKey.startsWith('ocorrencia')) {
            score = 2
          }
          if (score > bestScore) {
            bestScore = score
            bestKey = k
          }
        }
      }

      if (bestKey && dadosObj[bestKey] !== undefined && dadosObj[bestKey] !== null) {
        return String(dadosObj[bestKey])
      }

      // 2. Fallbacks: status cobranca, substatus, situacao, status, motivo
      const fallbackKeys = ['status cobranca', 'substatus', 'situacao', 'status', 'motivo']
      for (const fk of fallbackKeys) {
        for (const k of keys) {
          const normKey = normalizeText(k)
          if (normKey === fk) {
            return String(dadosObj[k])
          }
        }
      }

      return null
    }

    // Processar tabela movel
    if (app.hasTable('movel')) {
      const recordsMovel = app.findRecordsByFilter(
        'movel',
        "arquivo ~ 'CELNET AGUAS CLARAS'",
        'linha',
        500,
        0,
      )

      for (const record of recordsMovel) {
        let dadosObj = record.get('dados')
        if (typeof dadosObj === 'string') {
          try {
            dadosObj = JSON.parse(dadosObj)
          } catch (_) {}
        }

        const rawOcorrencia = extractOcorrenciaValueFromDados(dadosObj)
        if (rawOcorrencia !== null) {
          const novaOcorrencia = classifyVal(rawOcorrencia)
          record.set('ocorrencias', novaOcorrencia)
          app.save(record)
        }
      }
    }

    // Processar tabela residencial
    if (app.hasTable('residencial')) {
      const recordsResidencial = app.findRecordsByFilter(
        'residencial',
        "arquivo ~ 'CELNET AGUAS CLARAS'",
        'linha',
        500,
        0,
      )

      for (const record of recordsResidencial) {
        let dadosObj = record.get('dados')
        if (typeof dadosObj === 'string') {
          try {
            dadosObj = JSON.parse(dadosObj)
          } catch (_) {}
        }

        const rawOcorrencia = extractOcorrenciaValueFromDados(dadosObj)
        if (rawOcorrencia !== null) {
          const novaOcorrencia = classifyVal(rawOcorrencia)
          record.set('ocorrencias', novaOcorrencia)
          app.save(record)
        }
      }
    }
  },
  (_app) => {
    // Reversão não necessária para correção de classificação de dados
  },
)
