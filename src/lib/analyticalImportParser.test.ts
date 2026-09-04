import { describe, it, expect } from 'vitest'
import { normalizeColumnToSnakeCase, KNOWN_RESIDENCIAL_FIELDS } from './analyticalImportParser'

describe('analyticalImportParser', () => {
  it('normalizes column headers to snake_case correctly', () => {
    expect(normalizeColumnToSnakeCase('PARCEIRO RESUMIDO')).toBe('parceiro_resumido')
    expect(normalizeColumnToSnakeCase('COD_ AMX')).toBe('cod_amx')
    expect(normalizeColumnToSnakeCase('QTDE INSTALADA')).toBe('qtde_instalada')
    expect(normalizeColumnToSnakeCase('Data Promessa de Pagto.')).toBe('data_promessa_de_pagto')
    expect(normalizeColumnToSnakeCase('Não Vencidas')).toBe('nao_vencidas')
    expect(normalizeColumnToSnakeCase('QTD DIAS VENC x Data atual')).toBe(
      'qtd_dias_venc_x_data_atual',
    )
    expect(normalizeColumnToSnakeCase('CANAL 2')).toBe('canal_2')
    expect(normalizeColumnToSnakeCase('BCC TIPO REDE')).toBe('bcc_tipo_rede')
    expect(normalizeColumnToSnakeCase('COORDENADOR 2')).toBe('coordenador_2')
  })

  it('matches all required residential fields in the known fields set', () => {
    const expectedCols = [
      'NR_ANO_MES',
      'DATA_INSTALACAO',
      'NM_MERCADO',
      'NM_MARCA',
      'COD_MUNICIPIO',
      'CANAL',
      'PRODUTO_ATUAL',
      'NM_INDICADOR_NEGOCIO',
      'NM_TIPO_ASS_DOMICILIO',
      'UF',
      'NM_VISAO_ANALISE',
      'NM_LINHA_NEGOCIO',
      'NM_CIDADE',
      'NM_BAIRRO',
      'PARCEIRO RESUMIDO',
      'COD_ AMX',
      'COORDENADOR',
      'EXECUTIVO',
      'NR_CONTRATO',
      'DSC_STATUS_CONTRATO',
      'DAT_VENCIMENTO',
      'DAT_PAGAMENTO',
      'VLR_TOTAL',
      'VLR_PAGO',
      'VLR_ABERTO',
      'NM_FORMA_PAGAMENTO',
      'NR_CEP',
      'QTDE INSTALADA',
      'FATURA',
      'DEVENDO',
      'DATA RELATÓRIO',
      'QTD DIAS PAG x VENC',
      'INDICADOR',
      'Pago',
      'Preventiva FPD',
      'Virou FPD',
      'Não Vencidas',
      'Indefinido',
      'Desprezar',
      'QTD DIAS VENC x Data atual',
      'CANAL 2',
      'BCC TIPO REDE',
      'COORDENADOR 2',
      'CPF',
      'CLIENTE',
      'FONE',
      'LOJA',
      'VENDEDOR',
      'Ocorrências',
      'Data Promessa de Pagto.',
      'Comentários',
    ]

    for (const col of expectedCols) {
      const normalized = normalizeColumnToSnakeCase(col)
      expect(
        KNOWN_RESIDENCIAL_FIELDS.has(normalized),
        `Column "${col}" -> "${normalized}" should be in KNOWN_RESIDENCIAL_FIELDS`,
      ).toBe(true)
    }
  })

  it('preserves exact cell text when occurrence is outside official categories', async () => {
    const { parseAnalyticalWorksheet } = await import('./analyticalImportParser')
    const XLSX = await import('xlsx')

    const rows = [
      ['LOJA', 'CLIENTE', 'Ocorrências', 'VENDEDOR'],
      ['CELNET CENTRO', 'CLIENTE TESTE 1', 'Texto livre preenchido na loja', 'JOAO'],
      ['CELNET CENTRO', 'CLIENTE TESTE 2', '', 'MARIA'],
      ['CELNET CENTRO', 'CLIENTE TESTE 3', 'Fatura Paga', 'JOSE'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const parsed = parseAnalyticalWorksheet(ws, 'Residencial', 'residencial')

    expect(parsed.rows[0].ocorrencias).toBe('Texto livre preenchido na loja')
    expect(parsed.rows[1].ocorrencias).toBe('Não Tratados')
    expect(parsed.rows[2].ocorrencias).toBe('Fatura(s) Paga(s)')
  })
})
