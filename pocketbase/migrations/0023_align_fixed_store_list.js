// 0023 — Garante que a tabela `stores` contenha EXATAMENTE a lista fixa de 31 lojas
// (nomes canônicos, na ordem definida abaixo). Lojas já existentes são renomeadas
// para o nome canônico preservando o ID; faltantes são criadas; nomes fora da lista
// são removidos. Vínculos user.lojas são re-apontados para os IDs da lista fixa.
//
// A lista canônica também vive no frontend em `src/services/fixedStores.ts` —
// mantenha os dois lados em sincronia.

const FIXED_STORE_NAMES = [
  'CELNET AGUAS CLARA',
  'CELNET ALEXANIA',
  'CELNET APARECIDA SHOPPING',
  'CELNET ARAGUAIA',
  'CELNET AV. MANGALO',
  'CELNET BOULEVARD SHOPPING',
  'CELNET BRASILIA SHOPPING',
  'CELNET CALL ARNIQUEIRAS',
  'CELNET CALL JK',
  'CELNET CALL NOVA SUIÇA',
  'CELNET CALL UP',
  'CELNET CEILANDIA',
  'CELNET CIDADE LIVRE',
  'CELNET DF PLAZA',
  'CELNET GAMA SHOPPING',
  'CELNET GARAVELO',
  'CELNET GOIANIA FLAMBOYANT',
  'CELNET ILHA RESIDENCIAL',
  'CELNET ILHA RESIDENCIAL GAMA DF',
  'CELNET INHUMAS',
  'CELNET LUZIANIA',
  'CELNET MANHATTAN SHOPPING',
  'CELNET MATRIZ PLANALTINA DF',
  'CELNET NEROPOLIS',
  'CELNET NOVA SUIÇA',
  'CELNET PARK SHOPPING',
  'CELNET PLANALTINA GO',
  'CELNET SANTA MARIA',
  'CELNET SHOPPING BENTIVI',
  'CELNET SHOPPING JK',
  'CELNET TERRAÇO SHOPPING',
  'CELNET TRINDADE',
]

migrate(
  (app) => {
    const storesCol = app.findCollectionByNameOrId('stores')

    const allRecords = app.findRecordsByFilter('stores', '', '', 0, 0)
    const byName = {}
    allRecords.forEach((rec) => {
      const name = rec.getString('name')
      if (name && !byName[name]) {
        byName[name] = rec
      }
    })

    // 1. Renomear lojas existentes para o nome canônico (mesma loja, mesmo ID)
    const renames = [
      { from: 'CELNET AGUAS CLARAS', to: 'CELNET AGUAS CLARA' },
      { from: 'CELNET ARAGUAIA SHOPPING', to: 'CELNET ARAGUAIA' },
      { from: 'CELNET BOULLEVARD', to: 'CELNET BOULEVARD SHOPPING' },
      { from: 'CELNET CEILÂNDIA', to: 'CELNET CEILANDIA' },
      { from: 'CELNET FLAMBOYANT', to: 'CELNET GOIANIA FLAMBOYANT' },
      { from: 'CELNET JK SHOPPING', to: 'CELNET SHOPPING JK' },
      { from: 'CELNET NERÓPOLIS', to: 'CELNET NEROPOLIS' },
      { from: 'CELNET PLANALTINA DF', to: 'CELNET MATRIZ PLANALTINA DF' },
    ]
    renames.forEach(({ from, to }) => {
      const rec = byName[from]
      if (rec && !byName[to]) {
        rec.set('name', to)
        app.save(rec)
        byName[to] = rec
        delete byName[from]
      }
    })

    // 2. Criar as lojas da lista fixa que ainda não existem
    FIXED_STORE_NAMES.forEach((name) => {
      if (byName[name]) return
      try {
        app.findFirstRecordByData('stores', 'name', name)
        byName[name] = app.findFirstRecordByData('stores', 'name', name)
        return // já existe
      } catch (_) {
        const record = new Record(storesCol)
        record.set('name', name)
        app.save(record)
        byName[name] = record
      }
    })

    // Mapa final: nome fixo -> registro (somente nomes da lista fixa)
    const fixedByName = {}
    FIXED_STORE_NAMES.forEach((n) => {
      if (byName[n]) fixedByName[n] = byName[n]
    })
    const fixedIds = new Set(Object.values(fixedByName).map((r) => r.id))

    // 3. Reapontar user.lojas para os IDs da lista fixa
    const allUsers = app.findRecordsByFilter('users', '', '', 0, 0)
    allUsers.forEach((user) => {
      const current = user.get('lojas')
      const currentIds = Array.isArray(current) ? current : []
      if (currentIds.length === 0) return

      const resolvedIds = []
      currentIds.forEach((id) => {
        if (fixedIds.has(id)) {
          if (!resolvedIds.includes(id)) resolvedIds.push(id)
          return
        }
        try {
          const storeRecord = app.findRecordById('stores', id)
          const storeName = storeRecord.getString('name')
          const mapped = storeName && fixedByName[storeName] ? fixedByName[storeName].id : null
          if (mapped && !resolvedIds.includes(mapped)) resolvedIds.push(mapped)
        } catch (_) {
          // loja inexistente: descarta o vínculo
        }
      })

      // manter a ordem da lista fixa
      const ordered = FIXED_STORE_NAMES.map((n) => fixedByName[n] && fixedByName[n].id).filter(
        (id) => resolvedIds.includes(id),
      )

      const changed =
        ordered.length !== currentIds.length || ordered.some((id, i) => id !== currentIds[i])
      if (changed) {
        user.set('lojas', ordered)
        app.save(user)
      }
    })

    // 4. Remover registros de loja cujo nome não está na lista fixa
    const phNames = FIXED_STORE_NAMES.map((_, i) => 'n' + i)
    const ph = phNames.map((n) => '{:' + n + '}').join(', ')
    const binds = {}
    FIXED_STORE_NAMES.forEach((name, i) => {
      binds['n' + i] = name
    })

    app
      .db()
      .newQuery('DELETE FROM stores WHERE name NOT IN (' + ph + ')')
      .bind(binds)
      .execute()
  },
  (app) => {
    // Revert: nada a fazer — a lista fixa é o novo estado padrão
  },
)
