/// <reference types="pocketbase" />

/**
 * Migration 0066: Remover lojas-lixo ("34", "LOJA NÃO IDENTIFICADA", "INADIMPLÊNCIA DE JULHO 2026 DATA BASE 23.08")
 *
 * Verificações de segurança:
 * 1. Confirma que a loja não possui registros de clientes em 'movel' e 'residencial'.
 * 2. Confirma que a loja não possui registros consolidados reais com dados em 'fpd_records'.
 * 3. Remove registros em 'imported_files' vinculados a essas lojas sem dados reais.
 * 4. Remove o registro em 'stores'.
 * 5. Garante idempotência: se a loja não existir, não faz nada.
 */
migrate(
  (app) => {
    var storesToRemove = [
      '34',
      'LOJA NÃO IDENTIFICADA',
      'INADIMPLÊNCIA DE JULHO 2026 DATA BASE 23.08',
    ]

    for (var i = 0; i < storesToRemove.length; i++) {
      var storeName = storesToRemove[i]

      // Buscar registro da loja na coleção 'stores'
      var foundStores = []
      try {
        foundStores = app.findRecordsByFilter('stores', 'name = {:name}', 'id', 10, 0, {
          name: storeName,
        })
      } catch (err) {
        console.log('[Migration 0066] Erro ao buscar loja "' + storeName + '":', err)
      }

      if (!foundStores || foundStores.length === 0) {
        console.log('[Migration 0066] Loja "' + storeName + '" já não existe em stores. Pulando.')
        continue
      }

      for (var s = 0; s < foundStores.length; s++) {
        var storeRecord = foundStores[s]
        var storeId = storeRecord.id

        // 1. Verificar registros em movel
        var movelCount = 0
        if (app.hasTable('movel')) {
          try {
            var movelRecords = app.findRecordsByFilter('movel', 'loja = {:name}', 'id', 1, 0, {
              name: storeName,
            })
            movelCount = movelRecords.length
          } catch (_) {}
        }

        // 2. Verificar registros em residencial
        var residencialCount = 0
        if (app.hasTable('residencial')) {
          try {
            var resRecords = app.findRecordsByFilter('residencial', 'loja = {:name}', 'id', 1, 0, {
              name: storeName,
            })
            residencialCount = resRecords.length
          } catch (_) {}
        }

        // 3. Verificar registros em fpd_records com dados reais
        var fpdCount = 0
        if (app.hasTable('fpd_records')) {
          try {
            var fpdRecords = app.findRecordsByFilter(
              'fpd_records',
              'store = {:storeId} && total_linhas > 0',
              'id',
              1,
              0,
              { storeId: storeId },
            )
            fpdCount = fpdRecords.length
          } catch (_) {}
        }

        // Se tiver linhas reais de clientes ou consolidados com dados, NÃO apagar
        if (movelCount > 0 || residencialCount > 0 || fpdCount > 0) {
          console.log(
            '[Migration 0066] ALERTA: Loja "' +
              storeName +
              '" (' +
              storeId +
              ') possui dados reais (movel=' +
              movelCount +
              ', residencial=' +
              residencialCount +
              ', fpd=' +
              fpdCount +
              '). Preservando registro!',
          )
          continue
        }

        // Sem dados reais: seguro remover
        console.log(
          '[Migration 0066] Removendo loja sem dados: "' + storeName + '" (' + storeId + ')',
        )

        // Limpar fpd_records vazios/zerados se houver
        try {
          app
            .db()
            .newQuery('DELETE FROM fpd_records WHERE store = {:storeId}')
            .bind({ storeId: storeId })
            .execute()
        } catch (eFpd) {
          console.log(
            '[Migration 0066] Erro ao deletar fpd_records para loja ' + storeId + ':',
            eFpd,
          )
        }

        // Limpar imported_files associados
        try {
          app
            .db()
            .newQuery('DELETE FROM imported_files WHERE store = {:storeId} OR store_name = {:name}')
            .bind({ storeId: storeId, name: storeName })
            .execute()
        } catch (eImp) {
          console.log(
            '[Migration 0066] Erro ao deletar imported_files para loja ' + storeId + ':',
            eImp,
          )
        }

        // Limpar relacionamentos em users.lojas se houver
        try {
          var usersWithStore = app.findRecordsByFilter(
            'users',
            'lojas ~ {:storeId}',
            'id',
            100,
            0,
            { storeId: storeId },
          )
          for (var u = 0; u < usersWithStore.length; u++) {
            var user = usersWithStore[u]
            var rawLojas = user.get('lojas')
            var userLojas = []
            if (Array.isArray(rawLojas)) {
              userLojas = rawLojas.filter(function (id) {
                return id !== storeId
              })
            }
            user.set('lojas', userLojas)
            app.save(user)
          }
        } catch (eUser) {
          console.log('[Migration 0066] Erro ao desvincular loja de usuários:', eUser)
        }

        // Excluir a loja
        try {
          app.delete(storeRecord)
          console.log('[Migration 0066] Loja "' + storeName + '" removida de stores com sucesso!')
        } catch (eDel) {
          console.log('[Migration 0066] Erro ao deletar loja de stores:', eDel)
        }
      }
    }
  },
  (app) => {
    // Down migration - lojas-lixo removidas não precisam ser restauradas
  },
)
