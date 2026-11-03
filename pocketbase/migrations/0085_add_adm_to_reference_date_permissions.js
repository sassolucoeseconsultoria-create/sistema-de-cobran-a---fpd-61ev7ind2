/**
 * 0085 — Adiciona o campo bool `adm` à coleção reference_date_permissions.
 *
 * Contexto: a tela de Controle de Apresentação exibia o perfil ADM como coluna,
 * mas não existia campo onde gravar esse estado no banco. As telas tratavam
 * "usuário sem registro de permissão para a referência" como "não pode ver",
 * o que esvaziava o seletor de referências para logons ADM.
 *
 * up:
 *  - Garante o campo bool `adm` (não required — bool required no PocketBase
 *    significa "deve ser true", o que rejeitaria registros com adm=false).
 *  - Backfill idempotente: registros existentes passam a ter adm=true quando
 *    os demais perfis estão habilitados (gerente/supervisor/coordenador true)
 *    e adm=false quando os demais estão desabilitados.
 *
 * down: remove o campo `adm` (os valores gravados são perdidos, comportamento
 * padrão de revert de campo).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reference_date_permissions')

    if (!col.fields.getByName('adm')) {
      col.fields.add(new BoolField({ name: 'adm' }))
      app.save(col)
    }

    // Backfill idempotente: alinha o valor de `adm` ao estado atual dos demais perfis.
    // 10/2026 (todos os perfis true) => adm=true; 09/2026 e 08/2026 (perfis false) => adm=false.
    try {
      const records = app.findRecordsByFilter('reference_date_permissions', '', '', 0, 0)
      for (const rec of records) {
        const desired =
          rec.getBool('gerente') === true &&
          rec.getBool('supervisor') === true &&
          rec.getBool('coordenador') === true
        if (rec.getBool('adm') !== desired) {
          rec.set('adm', desired)
          app.save(rec)
        }
      }
    } catch (err) {
      console.log('[Migration 0085] Aviso no backfill de adm:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('reference_date_permissions')
      if (col.fields.getByName('adm')) {
        col.fields.removeByName('adm')
        app.save(col)
      }
    } catch (_) {}
  },
)
