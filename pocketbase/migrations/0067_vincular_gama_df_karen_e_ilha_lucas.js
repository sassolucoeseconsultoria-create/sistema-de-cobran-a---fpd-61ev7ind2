/// <reference types="pocketbase" />

/**
 * Migração 0067: Vincular CELNET ILHA RESIDENCIAL GAMA DF a Karen e CELNET ILHA RESIDENCIAL a Lucas Diniz
 *
 * Requisitos:
 * 1. Loja 9bg4enlqaqqw3z8 (CELNET ILHA RESIDENCIAL GAMA DF):
 *    - coordenacao = "Karen", supervisao = "Karen"
 *    - Gerente Raquel Ribeiro da Silva (uk6jgbo4pn8iutx) permanece intacta, NÃO mexer nela.
 * 2. Loja 7h4cx9x5t35v6l2 (CELNET ILHA RESIDENCIAL):
 *    - coordenacao = "Lucas Diniz", supervisao = "Lucas Diniz"
 * 3. Usuários:
 *    - Karen Natasha do nascimento dias (y6n77x6pnudiuv6, karennatashacelnet@gmail.com):
 *      Garantir que possui a loja 9bg4enlqaqqw3z8 em seu array 'lojas' sem remover os outros vínculos existentes.
 *    - Lucas Diniz (8il32cupxt7ov7a, lucasdiniz@celnet.com.br):
 *      Garantir que possui a loja 7h4cx9x5t35v6l2 em seu array 'lojas' sem remover outros eventuais vínculos.
 * 4. vendor_consolidations:
 *    - Atualizar registros de ranking por vendedor existentes:
 *      * 'CELNET ILHA RESIDENCIAL GAMA DF' => supervisao = 'Karen'
 *      * 'CELNET ILHA RESIDENCIAL' => supervisao = 'Lucas Diniz'
 * 5. Totalmente idempotente:
 *    - Executar novamente não duplica nem corrompe os vínculos ou dados.
 */
migrate(
  (app) => {
    var gamaDfId = '9bg4enlqaqqw3z8'
    var ilhaResId = '7h4cx9x5t35v6l2'
    var karenUserId = 'y6n77x6pnudiuv6'
    var lucasUserId = '8il32cupxt7ov7a'

    // 1. Atualizar lojas (stores)
    try {
      var gamaStore = app.findFirstRecordByData('stores', 'id', gamaDfId)
      gamaStore.set('supervisao', 'Karen')
      gamaStore.set('coordenacao', 'Karen')
      app.save(gamaStore)
      console.log('[Migration 0067] GAMA DF atualizada: coord=Karen, sup=Karen')
    } catch (e1) {
      // Tentar por nome caso ID não bata
      try {
        var foundGama = app.findRecordsByFilter(
          'stores',
          "name = 'CELNET ILHA RESIDENCIAL GAMA DF'",
          '',
          1,
          0,
        )
        if (foundGama.length > 0) {
          var gs = foundGama[0]
          gs.set('supervisao', 'Karen')
          gs.set('coordenacao', 'Karen')
          app.save(gs)
          gamaDfId = gs.id
          console.log('[Migration 0067] GAMA DF atualizada por nome:', gs.id)
        }
      } catch (errGama) {
        console.log('[Migration 0067] Erro ao atualizar GAMA DF:', errGama)
      }
    }

    try {
      var ilhaStore = app.findFirstRecordByData('stores', 'id', ilhaResId)
      ilhaStore.set('supervisao', 'Lucas Diniz')
      ilhaStore.set('coordenacao', 'Lucas Diniz')
      app.save(ilhaStore)
      console.log(
        '[Migration 0067] ILHA RESIDENCIAL atualizada: coord=Lucas Diniz, sup=Lucas Diniz',
      )
    } catch (e2) {
      // Tentar por nome caso ID não bata
      try {
        var foundIlha = app.findRecordsByFilter(
          'stores',
          "name = 'CELNET ILHA RESIDENCIAL'",
          '',
          1,
          0,
        )
        if (foundIlha.length > 0) {
          var isRec = foundIlha[0]
          isRec.set('supervisao', 'Lucas Diniz')
          isRec.set('coordenacao', 'Lucas Diniz')
          app.save(isRec)
          ilhaResId = isRec.id
          console.log('[Migration 0067] ILHA RESIDENCIAL atualizada por nome:', isRec.id)
        }
      } catch (errIlha) {
        console.log('[Migration 0067] Erro ao atualizar ILHA RESIDENCIAL:', errIlha)
      }
    }

    // 2. Garantir vínculos de lojas em users.lojas (idempotente e sem remover vínculos existentes)
    // Karen Natasha
    try {
      var karenUser = null
      try {
        karenUser = app.findFirstRecordByData('users', 'id', karenUserId)
      } catch (_) {
        var foundKaren = app.findRecordsByFilter(
          'users',
          "email = 'karennatashacelnet@gmail.com' || name ~ 'Karen Natasha'",
          '',
          1,
          0,
        )
        if (foundKaren.length > 0) {
          karenUser = foundKaren[0]
        }
      }

      if (karenUser) {
        var existingLojasKaren = []
        try {
          var rawLojasKaren = karenUser.get('lojas')
          if (Array.isArray(rawLojasKaren)) {
            existingLojasKaren = rawLojasKaren.slice()
          } else if (rawLojasKaren) {
            existingLojasKaren = JSON.parse(rawLojasKaren)
          }
        } catch (_) {
          existingLojasKaren = []
        }

        if (existingLojasKaren.indexOf(gamaDfId) === -1) {
          existingLojasKaren.push(gamaDfId)
        }

        karenUser.set('lojas', existingLojasKaren)
        app.save(karenUser)
        console.log(
          '[Migration 0067] Lojas vinculadas a Karen:',
          JSON.stringify(existingLojasKaren),
        )
      }
    } catch (errKaren) {
      console.log('[Migration 0067] Erro ao atualizar vínculos de Karen:', errKaren)
    }

    // Lucas Diniz
    try {
      var lucasUser = null
      try {
        lucasUser = app.findFirstRecordByData('users', 'id', lucasUserId)
      } catch (_) {
        var foundLucas = app.findRecordsByFilter(
          'users',
          "email = 'lucasdiniz@celnet.com.br' || name ~ 'Lucas Diniz'",
          '',
          1,
          0,
        )
        if (foundLucas.length > 0) {
          lucasUser = foundLucas[0]
        }
      }

      if (lucasUser) {
        var existingLojasLucas = []
        try {
          var rawLojasLucas = lucasUser.get('lojas')
          if (Array.isArray(rawLojasLucas)) {
            existingLojasLucas = rawLojasLucas.slice()
          } else if (rawLojasLucas) {
            existingLojasLucas = JSON.parse(rawLojasLucas)
          }
        } catch (_) {
          existingLojasLucas = []
        }

        if (existingLojasLucas.indexOf(ilhaResId) === -1) {
          existingLojasLucas.push(ilhaResId)
        }

        lucasUser.set('lojas', existingLojasLucas)
        app.save(lucasUser)
        console.log(
          '[Migration 0067] Lojas vinculadas a Lucas Diniz:',
          JSON.stringify(existingLojasLucas),
        )
      }
    } catch (errLucas) {
      console.log('[Migration 0067] Erro ao atualizar vínculos de Lucas:', errLucas)
    }

    // 3. Atualizar vendor_consolidations para as lojas afetadas
    // GAMA DF => supervisao = 'Karen'
    app
      .db()
      .newQuery(
        "UPDATE vendor_consolidations SET supervisao = 'Karen' WHERE loja = 'CELNET ILHA RESIDENCIAL GAMA DF'",
      )
      .execute()

    // CELNET ILHA RESIDENCIAL => supervisao = 'Lucas Diniz'
    app
      .db()
      .newQuery(
        "UPDATE vendor_consolidations SET supervisao = 'Lucas Diniz' WHERE loja = 'CELNET ILHA RESIDENCIAL'",
      )
      .execute()

    console.log('[Migration 0067] Concluída com sucesso!')
  },
  (app) => {
    // Reversão
    try {
      app
        .db()
        .newQuery(
          "UPDATE vendor_consolidations SET supervisao = '' WHERE loja = 'CELNET ILHA RESIDENCIAL GAMA DF'",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE stores SET supervisao = '', coordenacao = '' WHERE name = 'CELNET ILHA RESIDENCIAL GAMA DF'",
        )
        .execute()
      app
        .db()
        .newQuery("UPDATE stores SET coordenacao = '' WHERE name = 'CELNET ILHA RESIDENCIAL'")
        .execute()
    } catch (_) {}
  },
)
