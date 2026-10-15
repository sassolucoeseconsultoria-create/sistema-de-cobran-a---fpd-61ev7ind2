/// <reference types="pocketbase" />

/**
 * Migration 0082: Conversão da data 26/08/2026 -> 08/2026
 *
 * Regras (mesmas da 0081, para '26/08/2026' -> '08/2026'):
 * - Coleções `movel` e `residencial`: campo `data_referencia` de '26/08/2026' -> '08/2026'.
 * - `imported_files`: campo `reference_date` -> '08/2026'.
 * - `fpd_records` (campo `referente`, chave loja+referência): ao colidir com consolidado já existente
 *   da mesma loja em '08/2026', SOMAR todos os campos quantitativos (total_linhas, fatura_paga, envio_fatura,
 *   promessa_pagto, sem_contato, cancelados, pendente, contato_realizado, nao_tratados, outros) e expurgar
 *   a duplicata, preservando um único registro por loja.
 * - `vendor_consolidations` (campo `data_referencia`): mesmo tratamento de colisão por vendedor+loja,
 *   somando e expurgando duplicatas.
 * - `reference_date_permissions` (campo `referente`): mesclar as permissões por perfil de '26/08/2026'
 *   em '08/2026', removendo o registro antigo e preservando habilitações existentes (gerente, supervisor, coordenador).
 * - Idempotente: se não houver registros com '26/08/2026', não faz nada. Reexecutar não falha nem duplica.
 * - Preserva todos os históricos de linhas analíticas (sem apagar registros de movel e residencial).
 */
migrate(
  (app) => {
    console.log('[Migration 0082] Iniciando conversão de 26/08/2026 para 08/2026...')

    var oldRef = '26/08/2026'
    var newRef = '08/2026'

    // -------------------------------------------------------------------------
    // 1. movel.data_referencia
    // -------------------------------------------------------------------------
    if (app.hasTable('movel')) {
      try {
        app
          .db()
          .newQuery(
            "UPDATE movel SET data_referencia = '08/2026' WHERE TRIM(data_referencia) = '26/08/2026' OR data_referencia = '26/08/2026'",
          )
          .execute()
        console.log('[Migration 0082] movel.data_referencia atualizado com sucesso.')
      } catch (errMovel) {
        console.log('[Migration 0082] Erro ao atualizar movel:', errMovel)
      }
    }

    // -------------------------------------------------------------------------
    // 2. residencial.data_referencia
    // -------------------------------------------------------------------------
    if (app.hasTable('residencial')) {
      try {
        app
          .db()
          .newQuery(
            "UPDATE residencial SET data_referencia = '08/2026' WHERE TRIM(data_referencia) = '26/08/2026' OR data_referencia = '26/08/2026'",
          )
          .execute()
        console.log('[Migration 0082] residencial.data_referencia atualizado com sucesso.')
      } catch (errRes) {
        console.log('[Migration 0082] Erro ao atualizar residencial:', errRes)
      }
    }

    // -------------------------------------------------------------------------
    // 3. imported_files.reference_date
    // -------------------------------------------------------------------------
    if (app.hasTable('imported_files')) {
      try {
        app
          .db()
          .newQuery(
            "UPDATE imported_files SET reference_date = '08/2026' WHERE TRIM(reference_date) = '26/08/2026' OR reference_date = '26/08/2026'",
          )
          .execute()
        console.log('[Migration 0082] imported_files.reference_date atualizado com sucesso.')
      } catch (errImp) {
        console.log('[Migration 0082] Erro ao atualizar imported_files:', errImp)
      }
    }

    // -------------------------------------------------------------------------
    // 4. reference_date_permissions.referente (UNIQUE index)
    // -------------------------------------------------------------------------
    if (app.hasTable('reference_date_permissions')) {
      try {
        var existingTarget = null
        try {
          existingTarget = app.findFirstRecordByData(
            'reference_date_permissions',
            'referente',
            newRef,
          )
        } catch (_) {}

        var mergedGerente = existingTarget ? existingTarget.getBool('gerente') : false
        var mergedSupervisor = existingTarget ? existingTarget.getBool('supervisor') : false
        var mergedCoordenador = existingTarget ? existingTarget.getBool('coordenador') : false

        var oldRec = null
        try {
          oldRec = app.findFirstRecordByData('reference_date_permissions', 'referente', oldRef)
        } catch (_) {}

        if (oldRec) {
          if (oldRec.getBool('gerente')) mergedGerente = true
          if (oldRec.getBool('supervisor')) mergedSupervisor = true
          if (oldRec.getBool('coordenador')) mergedCoordenador = true
          app.delete(oldRec)

          if (existingTarget) {
            existingTarget.set('gerente', mergedGerente)
            existingTarget.set('supervisor', mergedSupervisor)
            existingTarget.set('coordenador', mergedCoordenador)
            app.save(existingTarget)
          } else {
            var permCol = app.findCollectionByNameOrId('reference_date_permissions')
            var newPermRec = new Record(permCol)
            newPermRec.set('referente', newRef)
            newPermRec.set('gerente', mergedGerente)
            newPermRec.set('supervisor', mergedSupervisor)
            newPermRec.set('coordenador', mergedCoordenador)
            app.save(newPermRec)
          }
        }
        console.log('[Migration 0082] reference_date_permissions atualizado com sucesso.')
      } catch (errPerm) {
        console.log('[Migration 0082] Erro ao atualizar reference_date_permissions:', errPerm)
      }
    }

    // -------------------------------------------------------------------------
    // 5. fpd_records.referente (Consolidação com soma em colisão por LOJA)
    // -------------------------------------------------------------------------
    if (app.hasTable('fpd_records')) {
      try {
        var oldRecords = []
        try {
          var fpdPageSize = 500
          var fpdOffset = 0
          while (true) {
            var fpdChunk = app.findRecordsByFilter(
              'fpd_records',
              "referente = '" + oldRef + "' || referente = '" + oldRef + " '",
              'id',
              fpdPageSize,
              fpdOffset,
            )
            if (!fpdChunk || fpdChunk.length === 0) break
            for (var fi = 0; fi < fpdChunk.length; fi++) {
              oldRecords.push(fpdChunk[fi])
            }
            if (fpdChunk.length < fpdPageSize) break
            fpdOffset += fpdPageSize
          }
        } catch (eFpdFetch) {
          console.log('[Migration 0082] Erro ao buscar fpd_records para ' + oldRef + ':', eFpdFetch)
        }

        console.log(
          '[Migration 0082] fpd_records para ' +
            oldRef +
            ': ' +
            oldRecords.length +
            ' encontrados.',
        )

        for (var i = 0; i < oldRecords.length; i++) {
          var oldFpdRec = oldRecords[i]
          var storeId = oldFpdRec.getString('store')

          var existingNewRec = null
          if (storeId) {
            try {
              var matches = app.findRecordsByFilter(
                'fpd_records',
                "store = '" +
                  storeId +
                  "' && (referente = '" +
                  newRef +
                  "' || referente = '" +
                  newRef +
                  " ')",
                'id',
                1,
                0,
              )
              if (matches && matches.length > 0) {
                existingNewRec = matches[0]
              }
            } catch (_) {}
          }

          if (existingNewRec && existingNewRec.id !== oldFpdRec.id) {
            // Colisão: somar totais quantitativos no registro de destino e apagar o antigo
            existingNewRec.set(
              'total_linhas',
              (existingNewRec.getInt('total_linhas') || 0) +
                (oldFpdRec.getInt('total_linhas') || 0),
            )
            existingNewRec.set(
              'fatura_paga',
              (existingNewRec.getInt('fatura_paga') || 0) + (oldFpdRec.getInt('fatura_paga') || 0),
            )
            existingNewRec.set(
              'envio_fatura',
              (existingNewRec.getInt('envio_fatura') || 0) +
                (oldFpdRec.getInt('envio_fatura') || 0),
            )
            existingNewRec.set(
              'promessa_pagto',
              (existingNewRec.getInt('promessa_pagto') || 0) +
                (oldFpdRec.getInt('promessa_pagto') || 0),
            )
            existingNewRec.set(
              'sem_contato',
              (existingNewRec.getInt('sem_contato') || 0) + (oldFpdRec.getInt('sem_contato') || 0),
            )
            existingNewRec.set(
              'cancelados',
              (existingNewRec.getInt('cancelados') || 0) + (oldFpdRec.getInt('cancelados') || 0),
            )
            existingNewRec.set(
              'pendente',
              (existingNewRec.getInt('pendente') || 0) + (oldFpdRec.getInt('pendente') || 0),
            )
            existingNewRec.set(
              'contato_realizado',
              (existingNewRec.getInt('contato_realizado') || 0) +
                (oldFpdRec.getInt('contato_realizado') || 0),
            )
            existingNewRec.set(
              'nao_tratados',
              (existingNewRec.getInt('nao_tratados') || 0) +
                (oldFpdRec.getInt('nao_tratados') || 0),
            )
            existingNewRec.set(
              'outros',
              (existingNewRec.getInt('outros') || 0) + (oldFpdRec.getInt('outros') || 0),
            )
            app.save(existingNewRec)
            app.delete(oldFpdRec)
          } else {
            // Sem colisão: renomear referente para newRef
            oldFpdRec.set('referente', newRef)
            app.save(oldFpdRec)
          }
        }
        console.log('[Migration 0082] fpd_records renomeados e colididos com sucesso.')
      } catch (errFpd) {
        console.log('[Migration 0082] Erro ao consolidar fpd_records:', errFpd)
      }
    }

    // -------------------------------------------------------------------------
    // 6. vendor_consolidations.data_referencia (Consolidação com soma em colisão por VENDEDOR + LOJA)
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
              "data_referencia = '" + oldRef + "' || data_referencia = '" + oldRef + " '",
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
            '[Migration 0082] Erro ao buscar vendor_consolidations para ' + oldRef + ':',
            eVendorFetch,
          )
        }

        console.log(
          '[Migration 0082] vendor_consolidations para ' +
            oldRef +
            ': ' +
            oldVendorRecords.length +
            ' encontrados.',
        )

        for (var j = 0; j < oldVendorRecords.length; j++) {
          var oldVend = oldVendorRecords[j]
          var rawVendName = (oldVend.getString('vendedor') || '').trim()
          var rawLojaName = (oldVend.getString('loja') || '').trim()

          var existingNewVend = null
          if (rawVendName && rawLojaName) {
            try {
              var escapedVend = rawVendName.replace(/'/g, "\\'")
              var escapedLoja = rawLojaName.replace(/'/g, "\\'")
              var vMatches = app.findRecordsByFilter(
                'vendor_consolidations',
                "vendedor = '" +
                  escapedVend +
                  "' && loja = '" +
                  escapedLoja +
                  "' && (data_referencia = '" +
                  newRef +
                  "' || data_referencia = '" +
                  newRef +
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
            // Sem colisão: atualiza data_referencia
            oldVend.set('data_referencia', newRef)
            app.save(oldVend)
          }
        }
        console.log('[Migration 0082] vendor_consolidations renomeados e colididos com sucesso.')
      } catch (errVend) {
        console.log('[Migration 0082] Erro ao consolidar vendor_consolidations:', errVend)
      }
    }

    console.log('[Migration 0082] Migração 0082 concluída com sucesso.')
  },
  (_app) => {},
)
