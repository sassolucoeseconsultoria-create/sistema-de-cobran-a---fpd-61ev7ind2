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

    // Linha 2 com célula vazia na coluna de ocorrências deve ser EXPURGADA (não aparece em nenhuma categoria)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].ocorrencias).toBe('Texto livre preenchido na loja')
    expect(parsed.rows[1].ocorrencias).toBe('Fatura(s) Paga(s)')
  })

  it('recognizes INDICADOR or PREVENTIVA FPD or DSC_STATUS_CONTRATO column when OCORRENCIAS is absent', async () => {
    const { parseAnalyticalWorksheet } = await import('./analyticalImportParser')
    const XLSX = await import('xlsx')

    const rows = [
      ['LOJA', 'CLIENTE', 'INDICADOR', 'VENDEDOR'],
      ['CELNET CENTRO', 'CLIENTE TESTE 1', 'Fatura Paga', 'JOAO'],
      ['CELNET CENTRO', 'CLIENTE TESTE 2', '', 'MARIA'], // empty -> expurgada
      ['CELNET CENTRO', 'CLIENTE TESTE 3', 'Promessa de Pagto', 'JOSE'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const parsed = parseAnalyticalWorksheet(ws, 'Residencial', 'residencial')

    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].ocorrencias).toBe('Fatura(s) Paga(s)')
    expect(parsed.rows[1].ocorrencias).toBe('Promessa de Pagto.')
  })

  it('correctly handles Preventiva FPD Residencial layout with multi-field derivation (Preventiva FPD, Virou FPD, PAGO, FATURA)', async () => {
    const { parseAnalyticalWorksheet } = await import('./analyticalImportParser')
    const XLSX = await import('xlsx')

    // Typical Preventiva FPD Residencial spreadsheet structure without dedicated "OCORRÊNCIAS" column
    const headers = [
      'NR ANO MES',
      'NM LOJA',
      'NM VENDEDOR',
      'CLIENTE',
      'CPF',
      'FATURA',
      'PAGO',
      'VLR PAGO',
      'INDICADOR',
      'PREVENTIVA FPD',
      'VIROU FPD',
      'DSC_STATUS_CONTRATO',
    ]

    const dataRows = [
      // Line 1: Virou FPD, Em Aberto, PAGO=0 -> Pendente
      [
        202605,
        'CELNET MATRIZ PLANALTINA DF',
        'GIULIA DANIELLY',
        'CLIENTE A',
        '12345678900',
        'Em Aberto',
        0,
        '',
        'Virou FPD',
        0,
        1,
        'CONECTADO',
      ],
      // Line 2: Preventiva FPD, PAGO=1 -> Fatura(s) Paga(s)
      [
        202605,
        'CELNET MATRIZ PLANALTINA DF',
        'GLEISSON',
        'CLIENTE B',
        '23456789011',
        'Paga',
        1,
        '122.40',
        'Preventiva FPD',
        1,
        0,
        'CONECTADO',
      ],
      // Line 3: Preventiva FPD, fatura Em Aberto, PAGO=0 -> Pendente
      [
        202605,
        'CELNET DF PLAZA',
        'VENDEDOR C',
        'CLIENTE C',
        '34567890122',
        'Em Aberto',
        0,
        0,
        'Preventiva FPD',
        1,
        0,
        'CONECTADO',
      ],
      // Line 4: DSC_STATUS_CONTRATO = DESCONECTADO -> Cancelados
      [
        202605,
        'CELNET DF PLAZA',
        'VENDEDOR D',
        'CLIENTE D',
        '45678901233',
        'Em Aberto',
        0,
        '',
        '',
        0,
        0,
        'DESCONECTADO',
      ],
      // Line 5: Empty line / no occurrences -> should be purged
      ['', '', '', '', '', '', '', '', '', '', '', ''],
    ]

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
    const parsed = parseAnalyticalWorksheet(ws, 'Residencial', 'residencial')

    // Lines 1 to 4 should be retained; line 5 purged
    expect(parsed.rows).toHaveLength(4)

    expect(parsed.rows[0].cliente).toBe('CLIENTE A')
    expect(parsed.rows[0].ocorrencias).toBe('Pendente')

    expect(parsed.rows[1].cliente).toBe('CLIENTE B')
    expect(parsed.rows[1].ocorrencias).toBe('Fatura(s) Paga(s)')

    expect(parsed.rows[2].cliente).toBe('CLIENTE C')
    expect(parsed.rows[2].ocorrencias).toBe('Pendente')

    expect(parsed.rows[3].cliente).toBe('CLIENTE D')
    expect(parsed.rows[3].ocorrencias).toBe('Cancelados')
  })

  it('regression: residential line with existing "Não Tratados" status column but virou_fpd=1 and fatura="Em Aberto" classifies as Pendente', async () => {
    const { parseAnalyticalWorksheet } = await import('./analyticalImportParser')
    const XLSX = await import('xlsx')

    const headers = [
      'NM LOJA',
      'NM VENDEDOR',
      'CLIENTE',
      'Ocorrências',
      'FATURA',
      'PAGO',
      'VLR PAGO',
      'INDICADOR',
      'VIROU FPD',
    ]

    const dataRows = [
      [
        'CELNET SHOPPING JK',
        'ADELMA VIEIRA',
        'JAKSON RODRIGUES',
        'Não Tratados', // Coluna de ocorrências veio como 'Não Tratados'
        'Em Aberto',
        0,
        0,
        'Virou FPD',
        1,
      ],
      [
        'CELNET SHOPPING JK',
        'ADELMA VIEIRA',
        'MARIA SILVA',
        'Não Tratados', // Coluna de ocorrências veio como 'Não Tratados'
        'Paga',
        1,
        200,
        'Virou FPD',
        1,
      ],
      [
        'CELNET SHOPPING JK',
        'ADELMA VIEIRA',
        'JOAO PEREIRA',
        'Não Tratados',
        'Em Aberto',
        0,
        0,
        'Cancelado',
        0,
      ],
    ]

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
    const parsed = parseAnalyticalWorksheet(ws, 'Residencial', 'residencial')

    expect(parsed.rows).toHaveLength(3)
    // Virou FPD + Em Aberto deve prevalecer sobre "Não Tratados" -> "Pendente"
    expect(parsed.rows[0].ocorrencias).toBe('Pendente')
    // PAGO=1 / Fatura Paga deve prevalecer -> "Fatura(s) Paga(s)"
    expect(parsed.rows[1].ocorrencias).toBe('Fatura(s) Paga(s)')
    // Cancelado deve prevalecer -> "Cancelados"
    expect(parsed.rows[2].ocorrencias).toBe('Cancelados')
  })
})
