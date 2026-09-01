migrate(
  (app) => {
    // 1. Collection 'movel'
    const movel = new Collection({
      name: 'movel',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'arquivo', type: 'text' },
        { name: 'linha', type: 'number', onlyInt: true },
        { name: 'loja', type: 'text' },
        { name: 'vendedor', type: 'text' },
        { name: 'cliente', type: 'text' },
        { name: 'dados', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_movel_loja ON movel (loja)',
        'CREATE INDEX idx_movel_vendedor ON movel (vendedor)',
        'CREATE INDEX idx_movel_cliente ON movel (cliente)',
        'CREATE INDEX idx_movel_arquivo ON movel (arquivo)',
        'CREATE INDEX idx_movel_linha ON movel (linha)',
      ],
    })
    app.save(movel)

    // 2. Collection 'residencial'
    const residencial = new Collection({
      name: 'residencial',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        // Campos fixos
        { name: 'arquivo', type: 'text' },
        { name: 'linha', type: 'number', onlyInt: true },
        { name: 'loja', type: 'text' },
        { name: 'vendedor', type: 'text' },
        { name: 'cliente', type: 'text' },
        { name: 'dados', type: 'json' },

        // Colunas tipadas da aba RESIDENCIAL normalizadas para snake_case
        { name: 'nr_ano_mes', type: 'text' },
        { name: 'data_instalacao', type: 'text' },
        { name: 'nm_mercado', type: 'text' },
        { name: 'nm_marca', type: 'text' },
        { name: 'cod_municipio', type: 'text' },
        { name: 'canal', type: 'text' },
        { name: 'produto_atual', type: 'text' },
        { name: 'nm_indicador_negocio', type: 'text' },
        { name: 'nm_tipo_ass_domicilio', type: 'text' },
        { name: 'uf', type: 'text' },
        { name: 'nm_visao_analise', type: 'text' },
        { name: 'nm_linha_negocio', type: 'text' },
        { name: 'nm_cidade', type: 'text' },
        { name: 'nm_bairro', type: 'text' },
        { name: 'parceiro_resumido', type: 'text' },
        { name: 'cod_amx', type: 'text' },
        { name: 'coordenador', type: 'text' },
        { name: 'executivo', type: 'text' },
        { name: 'nr_contrato', type: 'text' },
        { name: 'dsc_status_contrato', type: 'text' },
        { name: 'dat_vencimento', type: 'text' },
        { name: 'dat_pagamento', type: 'text' },
        { name: 'vlr_total', type: 'text' },
        { name: 'vlr_pago', type: 'text' },
        { name: 'vlr_aberto', type: 'text' },
        { name: 'nm_forma_pagamento', type: 'text' },
        { name: 'nr_cep', type: 'text' },
        { name: 'qtde_instalada', type: 'text' },
        { name: 'fatura', type: 'text' },
        { name: 'devendo', type: 'text' },
        { name: 'data_relatorio', type: 'text' },
        { name: 'qtd_dias_pag_x_venc', type: 'text' },
        { name: 'indicador', type: 'text' },
        { name: 'pago', type: 'text' },
        { name: 'preventiva_fpd', type: 'text' },
        { name: 'virou_fpd', type: 'text' },
        { name: 'nao_vencidas', type: 'text' },
        { name: 'indefinido', type: 'text' },
        { name: 'desprezar', type: 'text' },
        { name: 'qtd_dias_venc_x_data_atual', type: 'text' },
        { name: 'canal_2', type: 'text' },
        { name: 'bcc_tipo_rede', type: 'text' },
        { name: 'coordenador_2', type: 'text' },
        { name: 'cpf', type: 'text' },
        { name: 'fone', type: 'text' },
        { name: 'ocorrencias', type: 'text' },
        { name: 'data_promessa_de_pagto', type: 'text' },
        { name: 'comentarios', type: 'text' },

        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_residencial_loja ON residencial (loja)',
        'CREATE INDEX idx_residencial_vendedor ON residencial (vendedor)',
        'CREATE INDEX idx_residencial_cliente ON residencial (cliente)',
        'CREATE INDEX idx_residencial_arquivo ON residencial (arquivo)',
        'CREATE INDEX idx_residencial_linha ON residencial (linha)',
        'CREATE INDEX idx_residencial_cpf ON residencial (cpf)',
        'CREATE INDEX idx_residencial_nr_contrato ON residencial (nr_contrato)',
      ],
    })
    app.save(residencial)
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      app.delete(colMovel)
    } catch (_) {}

    try {
      const colResidencial = app.findCollectionByNameOrId('residencial')
      app.delete(colResidencial)
    } catch (_) {}
  },
)
