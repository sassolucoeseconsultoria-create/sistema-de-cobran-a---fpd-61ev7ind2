migrate(
  (app) => {
    const colMovel = app.findCollectionByNameOrId('movel')

    if (!colMovel.fields.getByName('data_promessa_de_pagto')) {
      colMovel.fields.add(new TextField({ name: 'data_promessa_de_pagto' }))
    }

    if (!colMovel.fields.getByName('comentarios')) {
      colMovel.fields.add(new TextField({ name: 'comentarios' }))
    }

    app.save(colMovel)
  },
  (app) => {
    try {
      const colMovel = app.findCollectionByNameOrId('movel')
      const f1 = colMovel.fields.getByName('data_promessa_de_pagto')
      if (f1) colMovel.fields.remove(f1)
      const f2 = colMovel.fields.getByName('comentarios')
      if (f2) colMovel.fields.remove(f2)
      app.save(colMovel)
    } catch (_) {}
  },
)
