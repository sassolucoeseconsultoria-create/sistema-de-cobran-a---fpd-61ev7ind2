/// <reference types="pocketbase" />

/**
 * Migration 0081: Alterar conceito de data de referência para MM/AAAA
 *
 * Regras:
 * - '08/09/2026' e '14/09/2026' passam a ser '09/2026'
 * - '30/09/2026' passa a ser '10/2026'
 * - Manter todos os históricos
 * - Nas coleções fpd_records e vendor_consolidations:
 *     quando houver colisão (mesma loja em fpd_records, mesmo vendedor+loja em vendor_consolidations),
 *     somar todos os campos quantitativos (total_linhas, fatura_paga, envio_fatura, promessa_pagto,
 *     sem_contato, cancelados, pendente, contato_realizado, outros, nao_tratados) num único registro
 *     e excluir a duplicata.
 * - Em reference_date_permissions:
 *     preservar as habilitações por perfil (se o destino já existir, combina com OR ou mantém;
 *     se 08/09 e 14/09 colidirem em 09/2026, mescla os flags).
 * - Em movel, residencial e imported_files:
 *     atualizar diretamente via SQL / transação.
 * - Idempotente: ao final nenhum registro restará com '08/09/2026', '14/09/2026' ou '30/09/2026'.
 */
migrate(
  (app) => {
    console.log('[Migration 0081] Iniciando conversão de referências para MM/AAAA...')

    var mapping = [
      { oldRefs: ['08/09/2026', '14/09/2026'], newRef: '09/2026' },
      { oldRefs: ['30/09/2026'], newRef: '10/2026' },
    ]

    // -------------------------------------------------------------------------
    // 1. movel.data_referencia
    // -------------------------------------------------------------------------
    if (app.hasTable('movel')) {
      try {
        app
          .db()
          .newQuery(
            "UPDATE movel SET data_referencia = '09/2026' WHERE TRIM(data_referencia) IN ('08/09/2026', '14/09/2026') OR data_referencia IN ('08/09/2026', '14/09/2026')",
          )
          .execute()
        app
          .db()
          .newQuery(
            "UPDATE movel SET data_referencia = '10/2026' WHERE TRIM(data_referencia) = '30/09/2026' OR data_referencia = '30/09/2026'",
          )
          .execute()
        console.log('[Migration 0081] movel.data_referencia atualizado com sucesso.')
      } catch (errMovel) {
        console.log('[Migration 0081] Erro ao atualizar movel:', errMovel)
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
            "UPDATE residencial SET data_referencia = '09/2026' WHERE TRIM(data_referencia) IN ('08/09/2026', '14/09/2026') OR data_referencia IN ('08/09/2026', '14/09/2026')",
          )
          .execute()
        app
          .db()
          .newQuery(
            "UPDATE residencial SET data_referencia = '10/2026' WHERE TRIM(data_referencia) = '30/09/2026' OR data_referencia = '30/09/2026'",
          )
          .execute()
        console.log('[Migration 0081] residencial.data_referencia atualizado com sucesso.')
      } catch (errRes) {
        console.log('[Migration 0081] Erro ao atualizar residencial:', errRes)
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
            "UPDATE imported_files SET reference_date = '09/2026' WHERE TRIM(reference_date) IN ('08/09/2026', '14/09/2026') OR reference_date IN ('08/09/2026', '14/09/2026')",
          )
          .execute()
        app
          .db()
          .newQuery(
            "UPDATE imported_files SET reference_date = '10/2026' WHERE TRIM(reference_date) = '30/09/2026' OR reference_date = '30/09/2026'",
          )
          .execute()
        console.log('[Migration 0081] imported_files.reference_date atualizado com sucesso.')
      } catch (errImp) {
        console.log('[Migration 0081] Erro ao atualizar imported_files:', errImp)
      }
    }

    // -------------------------------------------------------------------------
    // 4. reference_date_permissions.referente (UNIQUE index)
    // -------------------------------------------------------------------------
    if (app.hasTable('reference_date_permissions')) {
      try {
        for (var m = 0; m < mapping.length; m++) {
          var oldList = mapping[m].oldRefs
          var targetRef = mapping[m].newRef

          var existingTarget = null
          try {
            existingTarget = app.findFirstRecordByData(
              'reference_date_permissions',
              'referente',
              targetRef,
            )
          } catch (_) {}

          var mergedGerente = existingTarget ? existingTarget.getBool('gerente') : false
          var mergedSupervisor = existingTarget ? existingTarget.getBool('supervisor') : false
          var mergedCoordenador = existingTarget ? existingTarget.getBool('coordenador') : false
          var hadOldRecords = false

          for (var o = 0; o < oldList.length; o++) {
            var oldVal = oldList[o]
            var oldRec = null
            try {
              oldRec = app.findFirstRecordByData('reference_date_permissions', 'referente', oldVal)
            } catch (_) {}

            if (oldRec) {
              hadOldRecords = true
              if (oldRec.getBool('gerente')) mergedGerente = true
              if (oldRec.getBool('supervisor')) mergedSupervisor = true
              if (oldRec.getBool('coordenador')) mergedCoordenador = true
              app.delete(oldRec)
            }
          }

          if (existingTarget) {
            existingTarget.set('gerente', mergedGerente)
            existingTarget.set('supervisor', mergedSupervisor)
            existingTarget.set('coordenador', mergedCoordenador)
            app.save(existingTarget)
          } else if (hadOldRecords) {
            var permCol = app.findCollectionByNameOrId('reference_date_permissions')
            var newPermRec = new Record(permCol)
            newPermRec.set('referente', targetRef)
            newPermRec.set('gerente', mergedGerente)
            newPermRec.set('supervisor', mergedSupervisor)
            newPermRec.set('coordenador', mergedCoordenador)
            app.save(newPermRec)
          }
        }
        console.log('[Migration 0081] reference_date_permissions atualizado com sucesso.')
      } catch (errPerm) {
        console.log('[Migration 0081] Erro ao atualizar reference_date_permissions:', errPerm)
      }
    }

    // -------------------------------------------------------------------------
    // 5. fpd_records.referente (Consolidação com soma em colisão por LOJA)
    // -------------------------------------------------------------------------
    if (app.hasTable('fpd_records')) {
      try {
        for (var mf = 0; mf < mapping.length; mf++) {
          var oldRefsFpd = mapping[mf].oldRefs
          var newRefFpd = mapping[mf].newRef

          // Buscar todos os registros com as datas antigas
          for (var ofIdx = 0; ofIdx < oldRefsFpd.length; ofIdx++) {
            var oldRefName = oldRefsFpd[ofIdx]
            var oldRecords = []
            try {
              oldRecords = app.findRecordsByFilter(
                'fpd_records',
                "referente = '" + oldRefName + "' || referente = '" + oldRefName + " '",
                'id',
                500,
                0,
              )
            } catch (eFpdFetch) {
              console.log(
                '[Migration 0081] Erro ao buscar fpd_records para ' + oldRefName + ':',
                eFpdFetch,
              )
            }

            console.log(
              '[Migration 0081] fpd_records para ' +
                oldRefName +
                ': ' +
                oldRecords.length +
                ' encontrados.',
            )

            for (var i = 0; i < oldRecords.length; i++) {
              var oldRec = oldRecords[i]
              var storeId = oldRec.getString('store')

              var existingNewRec = null
              if (storeId) {
                try {
                  var matches = app.findRecordsByFilter(
                    'fpd_records',
                    "store = '" +
                      storeId +
                      "' && (referente = '" +
                      newRefFpd +
                      "' || referente = '" +
                      newRefFpd +
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

              if (existingNewRec && existingNewRec.id !== oldRec.id) {
                // Colisão: somar totais quantitativos no registro de destino e apagar o antigo
                existingNewRec.set(
                  'total_linhas',
                  (existingNewRec.getInt('total_linhas') || 0) +
                    (oldRec.getInt('total_linhas') || 0),
                )
                existingNewRec.set(
                  'fatura_paga',
                  (existingNewRec.getInt('fatura_paga') || 0) + (oldRec.getInt('fatura_paga') || 0),
                )
                existingNewRec.set(
                  'envio_fatura',
                  (existingNewRec.getInt('envio_fatura') || 0) +
                    (oldRec.getInt('envio_fatura') || 0),
                )
                existingNewRec.set(
                  'promessa_pagto',
                  (existingNewRec.getInt('promessa_pagto') || 0) +
                    (oldRec.getInt('promessa_pagto') || 0),
                )
                existingNewRec.set(
                  'sem_contato',
                  (existingNewRec.getInt('sem_contato') || 0) + (oldRec.getInt('sem_contato') || 0),
                )
                existingNewRec.set(
                  'cancelados',
                  (existingNewRec.getInt('cancelados') || 0) + (oldRec.getInt('cancelados') || 0),
                )
                existingNewRec.set(
                  'pendente',
                  (existingNewRec.getInt('pendente') || 0) + (oldRec.getInt('pendente') || 0),
                )
                existingNewRec.set(
                  'contato_realizado',
                  (existingNewRec.getInt('contato_realizado') || 0) +
                    (oldRec.getInt('contato_realizado') || 0),
                )
                existingNewRec.set(
                  'nao_tratados',
                  (existingNewRec.getInt('nao_tratados') || 0) +
                    (oldRec.getInt('nao_tratados') || 0),
                )
                existingNewRec.set(
                  'outros',
                  (existingNewRec.getInt('outros') || 0) + (oldRec.getInt('outros') || 0),
                )
                app.save(existingNewRec)
                app.delete(oldRec)
              } else {
                // Sem colisão: renomear referente para newRefFpd
                oldRec.set('referente', newRefFpd)
                app.save(oldRec)
              }
            }
          }
        }
        console.log('[Migration 0081] fpd_records renomeados e colididos com sucesso.')
      } catch (errFpd) {
        console.log('[Migration 0081] Erro ao consolidar fpd_records:', errFpd)
      }
    }

    // -------------------------------------------------------------------------
    // 6. vendor_consolidations.data_referencia (Consolidação com soma em colisão por VENDEDOR + LOJA)
    // -------------------------------------------------------------------------
    if (app.hasTable('vendor_consolidations')) {
      try {
        for (var mv = 0; mv < mapping.length; mv++) {
          var oldRefsVend = mapping[mv].oldRefs
          var newRefVend = mapping[mv].newRef

          for (var ovIdx = 0; ovIdx < oldRefsVend.length; ovIdx++) {
            var oldVendRef = oldRefsVend[ovIdx]
            var oldVendorRecords = []
            try {
              var vPageSize = 2000
              var vOffset = 0
              while (true) {
                var vChunk = app.findRecordsByFilter(
                  'vendor_consolidations',
                  "data_referencia = '" +
                    oldVendRef +
                    "' || data_referencia = '" +
                    oldVendRef +
                    " '",
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
                '[Migration 0081] Erro ao buscar vendor_consolidations para ' + oldVendRef + ':',
                eVendorFetch,
              )
            }

            console.log(
              '[Migration 0081] vendor_consolidations para ' +
                oldVendRef +
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
                      newRefVend +
                      "' || data_referencia = '" +
                      newRefVend +
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
                  (existingNewVend.getInt('total_linhas') || 0) +
                    (oldVend.getInt('total_linhas') || 0),
                )
                existingNewVend.set(
                  'fatura_paga',
                  (existingNewVend.getInt('fatura_paga') || 0) +
                    (oldVend.getInt('fatura_paga') || 0),
                )
                existingNewVend.set(
                  'envio_fatura',
                  (existingNewVend.getInt('envio_fatura') || 0) +
                    (oldVend.getInt('envio_fatura') || 0),
                )
                existingNewVend.set(
                  'promessa_pagto',
                  (existingNewVend.getInt('promessa_pagto') || 0) +
                    (oldVend.getInt('promessa_pagto') || 0),
                )
                existingNewVend.set(
                  'sem_contato',
                  (existingNewVend.getInt('sem_contato') || 0) +
                    (oldVend.getInt('sem_contato') || 0),
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
                  (existingNewVend.getInt('nao_tratados') || 0) +
                    (oldVend.getInt('nao_tratados') || 0),
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
                oldVend.set('data_referencia', newRefVend)
                app.save(oldVend)
              }
            }
          }
        }
        console.log('[Migration 0081] vendor_consolidations renomeados e colididos com sucesso.')
      } catch (errVend) {
        console.log('[Migration 0081] Erro ao consolidar vendor_consolidations:', errVend)
      }
    }

    console.log('[Migration 0081] Migração concluída com sucesso.')
  },
  (_app) => {},
)
