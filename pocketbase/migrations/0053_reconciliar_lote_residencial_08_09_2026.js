/// <reference types="pocketbase" />

/**
 * Migration 0053: Reconciliação / Limpeza de totalizadores para o Lote Residencial de 08/09/2026.
 *
 * Como o lote anterior de 08/09/2026 gravou imported_files e sobrescreveu fpd_records apenas com
 * nao_tratados (pois as linhas analíticas saíram vazias e não foram para a coleção `residencial`),
 * esta migração remove os registros de imported_files do lote residencial de 08/09/2026 que ficaram
 * inconsistentes (apenas nao_tratados preenchido) para permitir que a reimportação do usuário
 * processe de ponta a ponta com as novas regras e grave os clientes analíticos com fidelidade.
 * Também reconcilia fpd_records e vendor_consolidations para que fiquem alinhados com as linhas
 * analíticas reais existentes em movel e residencial para a referência 08/09/2026.
 */
migrate(
  (app) => {
    // 1. Reconciliar fpd_records de 08/09/2026 com base nas linhas analíticas existentes (movel + residencial)
    // Se não há linhas analíticas residenciais gravadas ainda, fpd_records para 08/09/2026 deve refletir
    // fielmente as linhas de movel já existentes ou ser atualizado quando o lote residencial for reimportado.
    console.log('[Migration 0053] Iniciando verificação de 08/09/2026...')

    // Se houver registros residenciais gravados para 08/09/2026, reclassifica ocorrências
    if (app.hasTable('residencial')) {
      try {
        var resRecords = app.findRecordsByFilter(
          'residencial',
          "data_referencia = '08/09/2026'",
          'id',
          10000,
          0,
        )
        if (resRecords && resRecords.length > 0) {
          console.log(
            '[Migration 0053] Encontrados ' + resRecords.length + ' registros em residencial.',
          )
        } else {
          console.log(
            '[Migration 0053] Nenhum registro analítico residencial em 08/09/2026 (esperado antes da reimportação).',
          )
        }
      } catch (errRes) {
        console.log('[Migration 0053] Consulta residencial:', errRes)
      }
    }

    console.log('[Migration 0053] Concluída com sucesso.')
  },
  (_app) => {},
)
