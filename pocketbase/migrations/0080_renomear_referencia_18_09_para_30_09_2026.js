/// <reference types="pocketbase" />

/**
 * Migration 0080: Renomear referência '18/09/2026' para '30/09/2026'
 *
 * O usuário solicitou alterar a referência de Clientes Móvel de 18/09/2026 para 30/09/2026.
 * Esta migração atualiza de forma consistente e idempotente todas as 5 coleções:
 * 1. movel.data_referencia: '18/09/2026' -> '30/09/2026'
 * 2. fpd_records.referente: '18/09/2026' -> '30/09/2026' (fazendo merge somando totais caso já exista a loja em 30/09/2026)
 * 3. imported_files.reference_date: '18/09/2026' -> '30/09/2026'
 * 4. vendor_consolidations.data_referencia: '18/09/2026' -> '30/09/2026' (fazendo merge por vendedor+loja caso já exista em 30/09/2026)
 * 5. reference_date_permissions.referente: '18/09/2026' -> '30/09/2026' (respeitando unicidade; se 30/09/2026 já existir, apaga 18/09/2026; se não existir, atualiza mantendo os flags atuais)
 *
 * Idempotente: pode ser reexecutada sem falhas e sem duplicar registros.
 */
migrate(
  (app) => {
    var OLD_REF = '18/09/2026'
    var NEW_REF = '30/09/2026'

    console.log(
      '[Migration 0080] Iniciando renomeação da referência ' + OLD_REF + ' para ' + NEW_REF + '...',
    )

    // -------------------------------------------------------------------------
    // 1. movel.data_referencia
    // -------------------------------------------------------------------------
    if (app.hasTable('movel')) {
      try {
        app
          .db()
          .newQuery(
            'UPDATE movel SET data_referencia = {:newRef} WHERE TRIM(data_referencia) = {:oldRef} OR data_referencia = {:oldRef}',
          )
          .bind({ newRef: NEW_REF, oldRef: OLD_REF })
          .execute()
        console.log('[Migration 0080] movel.data_referencia atualizado via SQL.')
      } catch (errMovel) {
        console.log('[Migration 0080] Erro ao atualizar movel via SQL:', errMovel)
      }
    }

    // -------------------------------------------------------------------------
    // 2. imported_files.reference_date
    // -------------------------------------------------------------------------
    if (app.hasTable('imported_files')) {
      try {
        app
          .db()
          .newQuery(
            'UPDATE imported_files SET reference_date = {:newRef} WHERE TRIM(reference_date) = {:oldRef} OR reference_date = {:oldRef}',
          )
          .bind({ newRef: NEW_REF, oldRef: OLD_REF })
          .execute()
        console.log('[Migration 0080] imported_files.reference_date atualizado via SQL.')
      } catch (errImp) {
        console.log('[Migration 0080] Erro ao atualizar imported_files via SQL:', errImp)
      }
    }

    // -------------------------------------------------------------------------
    // 3. reference_date_permissions.referente (campo com índice UNIQUE)
    // -------------------------------------------------------------------------
    if (app.hasTable('reference_date_permissions')) {
      try {
        var existingNewPerm = null
        try {
          existingNewPerm = app.findFirstRecordByData(
            'reference_date_permissions',
            'referente',
            NEW_REF,
          )
        } catch (_) {}

        var existingOldPerm = null
        try {
          existingOldPerm = app.findFirstRecordByData(
            'reference_date_permissions',
            'referente',
            OLD_REF,
          )
        } catch (_) {}

        if (existingOldPerm && existingNewPerm) {
          // Já existe 30/09/2026 e ainda existe 18/09/2026: remove o registro antigo de 18/09/2026
          app.delete(existingOldPerm)
          console.log(
            '[Migration 0080] Permissão antiga 18/09/2026 removida pois 30/09/2026 já existia.',
          )
        } else if (existingOldPerm && !existingNewPerm) {
          // Atualiza o registro existente de 18/09/2026 para 30/09/2026
          existingOldPerm.set('referente', NEW_REF)
          app.save(existingOldPerm)
          console.log(
            '[Migration 0080] Permissão 18/09/2026 renomeada para 30/09/2026 com sucesso.',
          )
        } else if (!existingOldPerm && !existingNewPerm) {
          // Se nenhum existir (ex: rodando em base limpa), cria 30/09/2026 com padrão false
          var permCol = app.findCollectionByNameOrId('reference_date_permissions')
          var newPermRec = new Record(permCol)
          newPermRec.set('referente', NEW_REF)
          newPermRec.set('gerente', false)
          newPermRec.set('supervisor', false)
          newPermRec.set('coordenador', false)
          app.save(newPermRec)
          console.log('[Migration 0080] Permissão 30/09/2026 criada.')
        }
      } catch (errPerm) {
        console.log('[Migration 0080] Erro ao atualizar reference_date_permissions:', errPerm)
      }
    }

    // -------------------------------------------------------------------------
    // 4. fpd_records.referente
    // Se a loja já tiver um registro em 30/09/2026 (por exemplo de residencial),
    // somamos os totais do registro de 18/09/2026 ao de 30/09/2026 e removemos o de 18/09/2026.
    // Caso contrário, apenas atualizamos o referente para 30/09/2026.
    // -------------------------------------------------------------------------
    if (app.hasTable('fpd_records')) {
      try {
        var oldFpdRecords = []
        try {
          oldFpdRecords = app.findRecordsByFilter(
            'fpd_records',
            "referente = '" + OLD_REF + "' || referente = '" + OLD_REF + " '",
            'id',
            500,
            0,
          )
        } catch (eFpdFetch) {
          console.log('[Migration 0080] Erro ao buscar fpd_records antigos:', eFpdFetch)
        }

        console.log(
          '[Migration 0080] Total fpd_records para ' + OLD_REF + ': ' + oldFpdRecords.length,
        )

        for (var i = 0; i < oldFpdRecords.length; i++) {
          var oldFpd = oldFpdRecords[i]
          var storeId = oldFpd.getString('store')

          var existingNewFpd = null
          if (storeId) {
            try {
              var matches = app.findRecordsByFilter(
                'fpd_records',
                "store = '" +
                  storeId +
                  "' && (referente = '" +
                  NEW_REF +
                  "' || referente = '" +
                  NEW_REF +
                  " ')",
                'id',
                1,
                0,
              )
              if (matches && matches.length > 0) {
                existingNewFpd = matches[0]
              }
            } catch (_) {}
          }

          if (existingNewFpd && existingNewFpd.id !== oldFpd.id) {
            // Merge somando totais
            existingNewFpd.set(
              'total_linhas',
              (existingNewFpd.getInt('total_linhas') || 0) + (oldFpd.getInt('total_linhas') || 0),
            )
            existingNewFpd.set(
              'fatura_paga',
              (existingNewFpd.getInt('fatura_paga') || 0) + (oldFpd.getInt('fatura_paga') || 0),
            )
            existingNewFpd.set(
              'envio_fatura',
              (existingNewFpd.getInt('envio_fatura') || 0) + (oldFpd.getInt('envio_fatura') || 0),
            )
            existingNewFpd.set(
              'promessa_pagto',
              (existingNewFpd.getInt('promessa_pagto') || 0) +
                (oldFpd.getInt('promessa_pagto') || 0),
            )
            existingNewFpd.set(
              'sem_contato',
              (existingNewFpd.getInt('sem_contato') || 0) + (oldFpd.getInt('sem_contato') || 0),
            )
            existingNewFpd.set(
              'cancelados',
              (existingNewFpd.getInt('cancelados') || 0) + (oldFpd.getInt('cancelados') || 0),
            )
            existingNewFpd.set(
              'pendente',
              (existingNewFpd.getInt('pendente') || 0) + (oldFpd.getInt('pendente') || 0),
            )
            existingNewFpd.set(
              'contato_realizado',
              (existingNewFpd.getInt('contato_realizado') || 0) +
                (oldFpd.getInt('contato_realizado') || 0),
            )
            existingNewFpd.set(
              'nao_tratados',
              (existingNewFpd.getInt('nao_tratados') || 0) + (oldFpd.getInt('nao_tratados') || 0),
            )
            existingNewFpd.set(
              'outros',
              (existingNewFpd.getInt('outros') || 0) + (oldFpd.getInt('outros') || 0),
            )
            app.save(existingNewFpd)
            app.delete(oldFpd)
          } else {
            // Apenas atualiza a data referente
            oldFpd.set('referente', NEW_REF)
            app.save(oldFpd)
          }
        }
        console.log('[Migration 0080] fpd_records atualizados/mesclados com sucesso.')
      } catch (errFpd) {
        console.log('[Migration 0080] Erro no processamento de fpd_records:', errFpd)
      }
    }

    // -------------------------------------------------------------------------
    // 5. vendor_consolidations.data_referencia
    // Se o vendedor na mesma loja já tiver um registro em 30/09/2026,
    // somamos os totais ao de 30/09/2026 e removemos o de 18/09/2026.
    // Caso contrário, apenas atualizamos data_referencia para 30/09/2026.
    // -------------------------------------------------------------------------
    if (app.hasTable('vendor_consolidations')) {
      try {
        var oldVendorRecords = []
        try {
          var vPageSize = 2000
          var vOffset = 0
          while (true) {
            var vChunk = app.findRecordsByFilter(
              'vendor_consolidations',
              "data_referencia = '" + OLD_REF + "' || data_referencia = '" + OLD_REF + " '",
              'id',
              vPageSize,
              vOffset,
            )
            if (!vChunk || vChunk.length === 0) break
            for (var vi = 0; vi < vChunk.length; vi++) {
              oldVendorRecords.push(vChunk[vi])
            }
            if (vChunk.length < vPageSize) break
            vOffset += vPageSize
          }
        } catch (eVendorFetch) {
          console.log(
            '[Migration 0080] Erro ao buscar vendor_consolidations antigos:',
            eVendorFetch,
          )
        }

        console.log(
          '[Migration 0080] Total vendor_consolidations para ' +
            OLD_REF +
            ': ' +
            oldVendorRecords.length,
        )

        for (var j = 0; j < oldVendorRecords.length; j++) {
          var oldVend = oldVendorRecords[j]
          var vendName = oldVend.getString('vendedor') || ''
          var lojaName = oldVend.getString('loja') || ''

          var existingNewVend = null
          if (vendName && lojaName) {
            try {
              var escapedVend = vendName.replace(/'/g, "\\'")
              var escapedLoja = lojaName.replace(/'/g, "\\'")
              var vMatches = app.findRecordsByFilter(
                'vendor_consolidations',
                "vendedor = '" +
                  escapedVend +
                  "' && loja = '" +
                  escapedLoja +
                  "' && (data_referencia = '" +
                  NEW_REF +
                  "' || data_referencia = '" +
                  NEW_REF +
                  " ')",
                'id',
                1,
                0,
              )
              if (vMatches && vMatches.length > 0) {
                existingNewVend = vMatches[0]
              }
            } catch (_) {}
          }

          if (existingNewVend && existingNewVend.id !== oldVend.id) {
            // Merge somando totais
            existingNewVend.set(
              'total_linhas',
              (existingNewVend.getInt('total_linhas') || 0) + (oldVend.getInt('total_linhas') || 0),
            )
            existingNewVend.set(
              'fatura_paga',
              (existingNewVend.getInt('fatura_paga') || 0) + (oldVend.getInt('fatura_paga') || 0),
            )
            existingNewVend.set(
              'envio_fatura',
              (existingNewVend.getInt('envio_fatura') || 0) + (oldVend.getInt('envio_fatura') || 0),
            )
            existingNewVend.set(
              'promessa_pagto',
              (existingNewVend.getInt('promessa_pagto') || 0) +
                (oldVend.getInt('promessa_pagto') || 0),
            )
            existingNewVend.set(
              'sem_contato',
              (existingNewVend.getInt('sem_contato') || 0) + (oldVend.getInt('sem_contato') || 0),
            )
            existingNewVend.set(
              'cancelados',
              (existingNewVend.getInt('cancelados') || 0) + (oldVend.getInt('cancelados') || 0),
            )
            existingNewVend.set(
              'pendente',
              (existingNewVend.getInt('pendente') || 0) + (oldVend.getInt('pendente') || 0),
            )
            existingNewVend.set(
              'contato_realizado',
              (existingNewVend.getInt('contato_realizado') || 0) +
                (oldVend.getInt('contato_realizado') || 0),
            )
            existingNewVend.set(
              'nao_tratados',
              (existingNewVend.getInt('nao_tratados') || 0) + (oldVend.getInt('nao_tratados') || 0),
            )
            existingNewVend.set(
              'outros',
              (existingNewVend.getInt('outros') || 0) + (oldVend.getInt('outros') || 0),
            )
            if (!existingNewVend.getString('supervisao') && oldVend.getString('supervisao')) {
              existingNewVend.set('supervisao', oldVend.getString('supervisao'))
            }
            app.save(existingNewVend)
            app.delete(oldVend)
          } else {
            // Apenas atualiza data_referencia
            oldVend.set('data_referencia', NEW_REF)
            app.save(oldVend)
          }
        }
        console.log('[Migration 0080] vendor_consolidations atualizados/mesclados com sucesso.')
      } catch (errVend) {
        console.log('[Migration 0080] Erro no processamento de vendor_consolidations:', errVend)
      }
    }

    console.log(
      '[Migration 0080] Concluída com sucesso: referência 18/09/2026 renomeada para 30/09/2026.',
    )
  },
  (_app) => {},
)
