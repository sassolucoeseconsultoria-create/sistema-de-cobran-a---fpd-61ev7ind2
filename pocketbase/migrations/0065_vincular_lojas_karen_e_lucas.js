migrate(
  (app) => {
    // =========================================================================
    // Migração 0065: Vincular lojas CELNET CALL a Karen Natasha e CELNET ILHA RESIDENCIAL a Lucas Diniz
    // 1. Atualizar campos supervisao e coordenacao no cadastro das lojas (stores)
    // 2. Vincular lojas aos usuários correspondentes (users.lojas)
    // 3. Atualizar supervisao em vendor_consolidations para as lojas afetadas
    // =========================================================================

    // 1. Localizar registros de lojas
    var storesCol = app.findCollectionByNameOrId('stores')
    var usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Buscar lojas que contenham 'CELNET CALL'
    var callStores = app.findRecordsByFilter('stores', "name ~ 'CELNET CALL'", 'name', 100, 0)
    var callStoreIds = []
    for (var i = 0; i < callStores.length; i++) {
      var cs = callStores[i]
      var csName = cs.getString('name')
      // Garantir que contenha CELNET CALL
      if (csName.toUpperCase().indexOf('CELNET CALL') !== -1) {
        callStoreIds.push(cs.id)
        // Atualizar campos no cadastro da loja:
        // supervisao = 'Karen' (padrão do sistema nas stores e vendor_consolidations)
        // coordenacao = 'Karen' (mesmo padrão já adotado para Celnet Alexania, Ceilandia, Nova Suiça)
        cs.set('supervisao', 'Karen')
        if (!cs.getString('coordenacao')) {
          cs.set('coordenacao', 'Karen')
        }
        app.save(cs)
        console.log('[Migration 0065] Loja CALL atualizada:', csName, cs.id)
      }
    }

    // Buscar loja 'CELNET ILHA RESIDENCIAL' (exatamente CELNET ILHA RESIDENCIAL, NÃO GAMA DF)
    var ilhaResidencialStores = app.findRecordsByFilter(
      'stores',
      "name = 'CELNET ILHA RESIDENCIAL'",
      'name',
      10,
      0,
    )
    var ilhaResidencialId = null
    if (ilhaResidencialStores.length > 0) {
      var irs = ilhaResidencialStores[0]
      ilhaResidencialId = irs.id
      irs.set('supervisao', 'Lucas Diniz')
      app.save(irs)
      console.log(
        '[Migration 0065] Loja ILHA RESIDENCIAL atualizada:',
        irs.getString('name'),
        irs.id,
      )
    }

    // 2. Atualizar vínculos nos usuários (users.lojas)

    // Localizar usuária Karen Natasha do nascimento dias
    var karenRecords = app.findRecordsByFilter(
      'users',
      "email = 'karennatashacelnet@gmail.com' || name ~ 'Karen Natasha'",
      '',
      10,
      0,
    )
    if (karenRecords.length > 0) {
      var karen = karenRecords[0]
      var existingLojasKaren = []
      try {
        var rawLojas = karen.get('lojas')
        if (Array.isArray(rawLojas)) {
          existingLojasKaren = rawLojas.slice()
        } else if (rawLojas) {
          existingLojasKaren = JSON.parse(rawLojas)
        }
      } catch (_) {
        existingLojasKaren = []
      }

      // Adicionar todas as lojas CELNET CALL encontradas
      for (var k = 0; k < callStoreIds.length; k++) {
        var sId = callStoreIds[k]
        if (existingLojasKaren.indexOf(sId) === -1) {
          existingLojasKaren.push(sId)
        }
      }

      karen.set('lojas', existingLojasKaren)
      app.save(karen)
      console.log('[Migration 0065] Lojas vinculadas a Karen:', JSON.stringify(existingLojasKaren))
    } else {
      console.log('[Migration 0065] Usuária Karen não encontrada')
    }

    // Localizar usuário Lucas Diniz
    var lucasRecords = app.findRecordsByFilter(
      'users',
      "email = 'lucasdiniz@celnet.com.br' || name ~ 'Lucas Diniz'",
      '',
      10,
      0,
    )
    if (lucasRecords.length > 0 && ilhaResidencialId) {
      var lucas = lucasRecords[0]
      var existingLojasLucas = []
      try {
        var rawLojasLucas = lucas.get('lojas')
        if (Array.isArray(rawLojasLucas)) {
          existingLojasLucas = rawLojasLucas.slice()
        } else if (rawLojasLucas) {
          existingLojasLucas = JSON.parse(rawLojasLucas)
        }
      } catch (_) {
        existingLojasLucas = []
      }

      if (existingLojasLucas.indexOf(ilhaResidencialId) === -1) {
        existingLojasLucas.push(ilhaResidencialId)
      }

      lucas.set('lojas', existingLojasLucas)
      app.save(lucas)
      console.log(
        '[Migration 0065] Lojas vinculadas a Lucas Diniz:',
        JSON.stringify(existingLojasLucas),
      )
    } else {
      console.log('[Migration 0065] Usuário Lucas Diniz ou loja Ilha Residencial não encontrada')
    }

    // 3. Atualizar vendor_consolidations para as lojas afetadas
    // Lojas CALL: supervisao = 'Karen'
    app
      .db()
      .newQuery(
        "UPDATE vendor_consolidations SET supervisao = 'Karen' WHERE loja LIKE '%CELNET CALL%'",
      )
      .execute()

    // CELNET ILHA RESIDENCIAL: supervisao = 'Lucas Diniz' (NÃO afetar CELNET ILHA RESIDENCIAL GAMA DF)
    app
      .db()
      .newQuery(
        "UPDATE vendor_consolidations SET supervisao = 'Lucas Diniz' WHERE loja = 'CELNET ILHA RESIDENCIAL'",
      )
      .execute()

    console.log('[Migration 0065] Concluída com sucesso!')
  },
  (app) => {
    // Reversão
    try {
      app
        .db()
        .newQuery(
          "UPDATE vendor_consolidations SET supervisao = '' WHERE loja LIKE '%CELNET CALL%' OR loja = 'CELNET ILHA RESIDENCIAL'",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE stores SET supervisao = '', coordenacao = '' WHERE name LIKE '%CELNET CALL%'",
        )
        .execute()
      app
        .db()
        .newQuery("UPDATE stores SET supervisao = '' WHERE name = 'CELNET ILHA RESIDENCIAL'")
        .execute()
    } catch (_) {}
  },
)
