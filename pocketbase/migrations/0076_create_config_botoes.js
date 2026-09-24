migrate(
  (app) => {
    // Idempotência: verificar se collection config_botoes já existe
    let collection
    try {
      collection = app.findCollectionByNameOrId('config_botoes')
    } catch (_) {
      collection = new Collection({
        name: 'config_botoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.role = 'ADM'",
        updateRule: "@request.auth.role = 'ADM'",
        deleteRule: "@request.auth.role = 'ADM'",
        fields: [
          { name: 'tela_id', type: 'text', required: true },
          { name: 'tela_nome', type: 'text', required: true },
          { name: 'botao_id', type: 'text', required: true },
          { name: 'botao_nome', type: 'text', required: true },
          { name: 'adm', type: 'bool' },
          { name: 'coordenador', type: 'bool' },
          { name: 'supervisor', type: 'bool' },
          { name: 'gerente', type: 'bool' },
          { name: 'ordem', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_config_botoes_tela_botao ON config_botoes (tela_id, botao_id)',
        ],
      })
      app.save(collection)
    }

    // Seed com os 7 botões do sistema
    // Todos adm=true, coordenador=false, supervisor=false, gerente=false
    const seeds = [
      {
        tela_id: 'ranking_vendedores',
        tela_nome: 'Ranking por Vendedor',
        botao_id: 'limpar_vendedores',
        botao_nome: 'Limpar Vendedores',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 1,
      },
      {
        tela_id: 'ranking_vendedores',
        tela_nome: 'Ranking por Vendedor',
        botao_id: 'exportar_xlsx',
        botao_nome: 'Exportar .xlsx',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 2,
      },
      {
        tela_id: 'top_ofensores',
        tela_nome: 'Principais Ofensores',
        botao_id: 'exportar_principais_ofensores',
        botao_nome: 'Exportar Principais Ofensores (.xlsx)',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 3,
      },
      {
        tela_id: 'painel_lojas',
        tela_nome: 'Painel de Lojas',
        botao_id: 'limpar_dados',
        botao_nome: 'Limpar dados',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 4,
      },
      {
        tela_id: 'painel_lojas',
        tela_nome: 'Painel de Lojas',
        botao_id: 'exportar_xlsx',
        botao_nome: 'Exportar .xlsx',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 5,
      },
      {
        tela_id: 'inadimplencia',
        tela_nome: 'Inadimplência',
        botao_id: 'limpar_dados',
        botao_nome: 'Limpar dados',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 6,
      },
      {
        tela_id: 'inadimplencia',
        tela_nome: 'Inadimplência',
        botao_id: 'exportar_xlsx',
        botao_nome: 'Exportar .xlsx',
        adm: true,
        coordenador: false,
        supervisor: false,
        gerente: false,
        ordem: 7,
      },
    ]

    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]
      try {
        const existing = app.findRecordsByFilter(
          'config_botoes',
          `tela_id = '${s.tela_id}' && botao_id = '${s.botao_id}'`,
          '',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          continue
        }
      } catch (_) {}

      const record = new Record(collection)
      record.set('tela_id', s.tela_id)
      record.set('tela_nome', s.tela_nome)
      record.set('botao_id', s.botao_id)
      record.set('botao_nome', s.botao_nome)
      record.set('adm', s.adm)
      record.set('coordenador', s.coordenador)
      record.set('supervisor', s.supervisor)
      record.set('gerente', s.gerente)
      record.set('ordem', s.ordem)
      app.save(record)
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('config_botoes')
      app.delete(collection)
    } catch (_) {}
  },
)
