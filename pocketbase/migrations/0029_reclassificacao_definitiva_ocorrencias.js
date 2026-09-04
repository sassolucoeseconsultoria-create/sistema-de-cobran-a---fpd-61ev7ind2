migrate(
  (app) => {
    // 0029: Reclassificação DEFINITIVA de ocorrências em Móvel e Residencial
    // para registros de "CELNET AGUAS CLARAS.xlsx" (e lojas correlatas).
    // Suporta 'dados' como byte array (goja slice), string JSON ou objeto JS.
    // Procura por valor nos campos do JSON casando frases de status conhecidas:
    // - "FATURA PAGA" / "FATURA(S) PAGA(S)" -> "Fatura(s) Paga(s)"
    // - "ENVIADO FATURA" / "ENVIADO FATURA(S)" -> "Enviado Fatura(s)"
    // - "CONTATO REALIZADO" -> "Contato Realizado"
    // - "PROMESSA DE PAGTO" -> "Promessa de Pagto."
    // - "SEM CONTATO" -> "Sem Contato"
    // - "CANCELADOS" / "CANCELADO" -> "Cancelados"
    // - "PENDENTE" -> "Pendente"
    // - "NÃO TRATADOS" -> "Não Tratados"

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

    function parseDadosValue(raw) {
      if (!raw) return {}
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw
      }
      let str = ''
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          str += String.fromCharCode(raw[i])
        }
      } else if (typeof raw === 'string') {
        str = raw
      } else {
        str = String(raw)
      }

      try {
        const parsed = JSON.parse(str)
        if (parsed && typeof parsed === 'object') {
          return parsed
        }
      } catch (_) {}

      return { __raw_string__: str }
    }

    function classifyValueOrString(rawVal) {
      const norm = normalizeText(rawVal)
      if (!norm) return null

      // 1. Enviado fatura
      if (
        norm.includes('enviado fatura') ||
        norm.includes('enviada fatura') ||
        norm.includes('fatura enviada') ||
        norm.includes('envio de fatura') ||
        norm.includes('envio fatura') ||
        norm.includes('2 via') ||
        norm.includes('2a via')
      ) {
        return 'Enviado Fatura(s)'
      }

      // 2. Promessa de Pagto.
      if (norm.includes('promessa')) {
        return 'Promessa de Pagto.'
      }

      // 3. Fatura Paga (frases de status com 'fatura paga', 'pago', 'quitad', 'liquidad')
      if (
        norm.includes('fatura paga') ||
        norm.includes('faturas pagas') ||
        norm.includes('fatura(s) paga(s)') ||
        norm.includes('boleto pago') ||
        norm.includes('fatura quitada') ||
        norm.includes('fatura liquidada') ||
        norm === 'paga' ||
        norm === 'pago' ||
        norm === 'quitado' ||
        norm === 'liquidado'
      ) {
        return 'Fatura(s) Paga(s)'
      }

      // 4. Sem Contato
      if (
        norm.includes('sem contato') ||
        norm.includes('nao atende') ||
        norm.includes('caixa postal') ||
        norm.includes('telefone incorreto') ||
        norm.includes('numero incorreto')
      ) {
        return 'Sem Contato'
      }

      // 5. Cancelados
      if (
        norm.includes('cancelad') ||
        norm.includes('desist') ||
        norm.includes('devolv') ||
        norm.includes('fraude')
      ) {
        return 'Cancelados'
      }

      // 6. Pendente
      if (
        norm.includes('em analise') ||
        norm.includes('em andamento') ||
        norm.includes('em tratativa') ||
        norm.includes('aguardando retorno') ||
        norm === 'pendente'
      ) {
        return 'Pendente'
      }

      // 7. Contato Realizado
      if (
        norm.includes('contato realizado') ||
        norm.includes('contato efetuado') ||
        norm.includes('contato feito') ||
        norm.includes('cliente atendid') ||
        norm.includes('atendimento realizado') ||
        norm.includes('falou com cliente') ||
        norm.includes('falou com titular') ||
        norm.includes('deixou recado')
      ) {
        return 'Contato Realizado'
      }

      // 8. Não Tratados
      if (
        norm.includes('nao tratado') ||
        norm.includes('nao trabalh') ||
        norm.includes('a tratar')
      ) {
        return 'Não Tratados'
      }

      return null
    }

    function determineRecordOcorrencia(record) {
      const rawDados = record.get('dados')
      const dadosObj = parseDadosValue(rawDados)

      // 1. Verificar se alguma chave contém "ocorren"
      const keys = Object.keys(dadosObj)
      for (const k of keys) {
        const normKey = normalizeText(k)
        if (normKey.includes('ocorren')) {
          const val = dadosObj[k]
          const classified = classifyValueOrString(val)
          if (classified) {
            return classified
          }
        }
      }

      // 2. Verificar valores em chaves de fallback (status, situacao, substatus, motivo)
      const fallbackKeys = ['status cobranca', 'substatus', 'situacao', 'status', 'motivo']
      for (const fk of fallbackKeys) {
        for (const k of keys) {
          const normKey = normalizeText(k)
          if (normKey === fk) {
            const val = dadosObj[k]
            const classified = classifyValueOrString(val)
            if (classified) {
              return classified
            }
          }
        }
      }

      // 3. Escanear TODOS os valores de todas as chaves do objeto JSON
      for (const k of keys) {
        const val = dadosObj[k]
        if (val !== null && val !== undefined) {
          const classified = classifyValueOrString(val)
          if (classified) {
            return classified
          }
        }
      }

      // 4. Se dadosObj tiver a string bruta, pesquisar diretamente por regex
      const rawString = dadosObj.__raw_string__ || JSON.stringify(dadosObj)
      if (rawString) {
        if (/FATURA\s+PAGA|FATURA\(S\)\s+PAGA\(S\)|PAGAMENTO\s+CONFIRMADO/i.test(rawString)) {
          return 'Fatura(s) Paga(s)'
        }
        if (/ENVIADO\s+FATURA|ENVIADA\s+FATURA|ENVIO\s+DE\s+FATURA/i.test(rawString)) {
          return 'Enviado Fatura(s)'
        }
        if (/CONTATO\s+REALIZADO|CONTATO\s+EFETUADO|CLIENTE\s+ATENDIDO/i.test(rawString)) {
          return 'Contato Realizado'
        }
        if (/PROMESSA\s+DE\s+PAG/i.test(rawString)) {
          return 'Promessa de Pagto.'
        }
        if (/SEM\s+CONTATO|NAO\s+ATENDE|CAIXA\s+POSTAL/i.test(rawString)) {
          return 'Sem Contato'
        }
      }

      return null
    }

    // Processar tabela movel
    if (app.hasTable('movel')) {
      const recordsMovel = app.findRecordsByFilter(
        'movel',
        "arquivo ~ 'CELNET AGUAS CLARAS' || loja ~ 'AGUAS CLARA'",
        'linha',
        500,
        0,
      )

      for (const record of recordsMovel) {
        const novaOcorrencia = determineRecordOcorrencia(record)
        if (novaOcorrencia) {
          record.set('ocorrencias', novaOcorrencia)
          // Limpar comentários ou data_promessa_de_pagto residuais de diagnósticos se houver
          const c = record.get('comentarios')
          if (c && String(c).startsWith('KEYS:')) {
            record.set('comentarios', '')
          }
          const d = record.get('data_promessa_de_pagto')
          if (d && (String(d).startsWith('FOUND') || String(d).startsWith(',97,'))) {
            record.set('data_promessa_de_pagto', '')
          }
          app.save(record)
        }
      }
    }

    // Processar tabela residencial
    if (app.hasTable('residencial')) {
      const recordsResidencial = app.findRecordsByFilter(
        'residencial',
        "arquivo ~ 'CELNET AGUAS CLARAS' || loja ~ 'AGUAS CLARA'",
        'linha',
        500,
        0,
      )

      for (const record of recordsResidencial) {
        const novaOcorrencia = determineRecordOcorrencia(record)
        if (novaOcorrencia) {
          record.set('ocorrencias', novaOcorrencia)
          app.save(record)
        }
      }
    }
  },
  (_app) => {},
)
