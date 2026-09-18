import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeClientDeduplicationKey,
  normalizeReferenceDateForDedup,
  buildCompositeDeduplicationKey,
  extractResidencialDeduplicationKey,
  extractMovelDeduplicationKey,
} from './clientDeduplication'
import {
  deduplicateMovelBatchItems,
  deduplicateResidencialBatchItems,
  insertMovelBatch,
  insertResidencialBatch,
  type MovelInsertItem,
  type ResidencialInsertItem,
} from '@/services/relacionamentoService'
import pb from '@/lib/pocketbase/client'

// Mocks do PocketBase para testar insertMovelBatch e insertResidencialBatch
vi.mock('@/lib/pocketbase/client', () => {
  const collectionMock = vi.fn()
  return {
    default: {
      collection: collectionMock,
      authStore: {
        clear: vi.fn(),
      },
      autoCancellation: vi.fn(),
    },
    pb: {
      collection: collectionMock,
      authStore: {
        clear: vi.fn(),
      },
      autoCancellation: vi.fn(),
    },
  }
})

describe('Validação Anti-Duplicidade de Importação e Regressão', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Item 2.(e): Normalização de chaves de clientes', () => {
    it('deve normalizar contratos e números eliminando espaços, pontos, barras e separadores', () => {
      // Regra explícita da tarefa: ("22043752" = " 22043752 " = "2.2043752")
      const base = '22043752'
      expect(normalizeClientDeduplicationKey('22043752')).toBe(base)
      expect(normalizeClientDeduplicationKey(' 22043752 ')).toBe(base)
      expect(normalizeClientDeduplicationKey('2.2043752')).toBe(base)
      expect(normalizeClientDeduplicationKey('220-43752')).toBe(base)
      expect(normalizeClientDeduplicationKey('220/43752')).toBe(base)
      expect(normalizeClientDeduplicationKey(' 2.204.375-2 ')).toBe(base)
      expect(normalizeClientDeduplicationKey(' (61) 99315-9460 ')).toBe('61993159460')
    })

    it('deve retornar vazio para valores nulos, indefinidos ou em branco', () => {
      expect(normalizeClientDeduplicationKey(null)).toBe('')
      expect(normalizeClientDeduplicationKey(undefined)).toBe('')
      expect(normalizeClientDeduplicationKey('')).toBe('')
      expect(normalizeClientDeduplicationKey('   ')).toBe('')
    })

    it('extrai corretamente chave de deduplicação no Residencial a partir de nr_contrato direto ou em dados', () => {
      expect(
        extractResidencialDeduplicationKey({
          nr_contrato: '2.2043752',
        }),
      ).toBe('22043752')

      expect(
        extractResidencialDeduplicationKey({
          typedFields: { nr_contrato: ' 22043752 ' },
        }),
      ).toBe('22043752')

      expect(
        extractResidencialDeduplicationKey({
          dados: { NR_CONTRATO: '22043752' },
        }),
      ).toBe('22043752')
    })

    it('extrai corretamente chave de deduplicação no Móvel a partir da primeira coluna ou campos de número', () => {
      // Campo Numero / Coluna_1
      expect(
        extractMovelDeduplicationKey({
          dados: { Numero: ' 6199315-9460 ' },
        }),
      ).toBe('61993159460')

      // Primeira coluna do arquivo
      expect(
        extractMovelDeduplicationKey({
          dados: { Coluna_1: '61993300880', CPF: '7477069130' },
        }),
      ).toBe('61993300880')

      expect(
        extractMovelDeduplicationKey({
          dados: { Telefone: '(62) 98888-7777' },
        }),
      ).toBe('62988887777')
    })
  })

  describe('Item 2.(a): Mesmo contrato em duas linhas do mesmo arquivo → 1 registro', () => {
    it('Residencial: colapsa intra-batch 2 linhas com mesmo contrato na mesma referência em 1 registro, preservando comentários/promessa', () => {
      const items: ResidencialInsertItem[] = [
        {
          arquivo: 'BASE_RESIDENCIAL.xlsx',
          linha: 2,
          nr_contrato: '22043752',
          data_referencia: '08/09/2026',
          ocorrencias: 'Não Tratados',
          comentarios: 'Comentário original linha 2',
          data_promessa_de_pagto: '20/09/2026',
        },
        {
          arquivo: 'BASE_RESIDENCIAL.xlsx',
          linha: 3,
          nr_contrato: ' 2.2043752 ',
          data_referencia: '08/09/2026',
          ocorrencias: 'Pendente',
          comentarios: '',
          data_promessa_de_pagto: '',
        },
      ]

      const deduplicated = deduplicateResidencialBatchItems(items)
      expect(deduplicated).toHaveLength(1)
      expect(deduplicated[0].data_referencia).toBe('08/09/2026')
      expect(deduplicated[0].ocorrencias).toBe('Pendente')
      // Preservou comentários e data_promessa da linha anterior
      expect(deduplicated[0].comentarios).toBe('Comentário original linha 2')
      expect(deduplicated[0].data_promessa_de_pagto).toBe('20/09/2026')
    })

    it('Móvel: colapsa intra-batch 2 linhas com mesmo número na mesma referência em 1 registro', () => {
      const items: MovelInsertItem[] = [
        {
          arquivo: 'CELNET PLANALTINA.xlsx',
          linha: 2,
          dados: { Numero: '61993300880' },
          data_referencia: '26/08/2026',
          ocorrencias: 'Enviado Fatura(s)',
          comentarios: 'Enviado por WhatsApp',
          data_promessa_de_pagto: '28/08/2026',
        },
        {
          arquivo: 'CELNET PLANALTINA.xlsx',
          linha: 5,
          dados: { Numero: ' 61.99330.0880 ' },
          data_referencia: '26/08/2026',
          ocorrencias: 'Enviado Fatura(s)',
          comentarios: '',
          data_promessa_de_pagto: '',
        },
      ]

      const deduplicated = deduplicateMovelBatchItems(items)
      expect(deduplicated).toHaveLength(1)
      expect(deduplicated[0].comentarios).toBe('Enviado por WhatsApp')
      expect(deduplicated[0].data_promessa_de_pagto).toBe('28/08/2026')
    })
  })

  describe('Item 2.(b): Mesmo contrato em arquivo renomeado na mesma referência → UPDATE, não CREATE', () => {
    it('Residencial: quando já existe registro no banco com mesmo contrato na mesma referência, executa update e preserva manuais', async () => {
      const existingId = 'rec-res-existente-123'
      const mockGetList = vi.fn().mockResolvedValue({
        items: [
          {
            id: existingId,
            arquivo: 'ARQUIVO_ANTIGO.xlsx',
            linha: 10,
            nr_contrato: '22043752',
            data_referencia: '08/09/2026',
            ocorrencias: 'Promessa de Pagto.',
            data_promessa_de_pagto: '25/09/2026',
            comentarios: 'Prometeu pagar sexta-feira',
          },
        ],
        totalPages: 1,
      })
      const mockUpdate = vi.fn().mockResolvedValue({ id: existingId })
      const mockCreate = vi.fn().mockResolvedValue({ id: 'new-id' })

      ;(pb.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        getList: mockGetList,
        update: mockUpdate,
        create: mockCreate,
      })

      const itemsToImport: ResidencialInsertItem[] = [
        {
          arquivo: 'ARQUIVO_NOVO_RENOMEADO.xlsx',
          linha: 4,
          nr_contrato: ' 2.2043752 ',
          data_referencia: '08/09/2026',
          loja: 'CELNET INHUMAS',
          vendedor: 'MARIA FERNANDA',
          cliente: 'FERNANDO PEREIRA',
          ocorrencias: 'Não Tratados', // planilha nova veio Não Tratados
          comentarios: '',
          data_promessa_de_pagto: '',
        },
      ]

      const count = await insertResidencialBatch(itemsToImport)
      expect(count).toBe(1)
      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        existingId,
        expect.objectContaining({
          arquivo: 'ARQUIVO_NOVO_RENOMEADO.xlsx',
          linha: 4,
          data_referencia: '08/09/2026',
          // Preservou os campos manuais que já existiam!
          ocorrencias: 'Promessa de Pagto.',
          data_promessa_de_pagto: '25/09/2026',
          comentarios: 'Prometeu pagar sexta-feira',
        }),
        expect.anything(),
      )
    })

    it('Móvel: reimportação com nome de arquivo diferente na mesma referência realiza update preservando manuais', async () => {
      const existingId = 'rec-mov-existente-456'
      const mockGetList = vi.fn().mockResolvedValue({
        items: [
          {
            id: existingId,
            arquivo: 'BASE_MOVEL_V1.xlsx',
            linha: 8,
            dados: { Coluna_1: '61992242421' },
            data_referencia: '26/08/2026',
            ocorrencias: 'Contato Realizado',
            data_promessa_de_pagto: '27/08/2026',
            comentarios: 'Cliente ciente',
          },
        ],
        totalPages: 1,
      })
      const mockUpdate = vi.fn().mockResolvedValue({ id: existingId })
      const mockCreate = vi.fn().mockResolvedValue({ id: 'new-id' })

      ;(pb.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        getList: mockGetList,
        update: mockUpdate,
        create: mockCreate,
      })

      const itemsToImport: MovelInsertItem[] = [
        {
          arquivo: 'BASE_MOVEL_V2_RENOMEADA.xlsx',
          linha: 15,
          dados: { Coluna_1: ' (61) 99224-2421 ' },
          data_referencia: '26/08/2026',
          loja: 'CELNET SHOPPING JK',
          vendedor: 'SUELLEN SILVA',
          cliente: 'CLIENTE JK',
          ocorrencias: 'Não Tratados',
          comentarios: '',
          data_promessa_de_pagto: '',
        },
      ]

      const count = await insertMovelBatch(itemsToImport)
      expect(count).toBe(1)
      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        existingId,
        expect.objectContaining({
          arquivo: 'BASE_MOVEL_V2_RENOMEADA.xlsx',
          linha: 15,
          data_referencia: '26/08/2026',
          ocorrencias: 'Contato Realizado',
          data_promessa_de_pagto: '27/08/2026',
          comentarios: 'Cliente ciente',
        }),
        expect.anything(),
      )
    })
  })

  describe('Item 2.(c): Mesmo contrato em referências diferentes → 2 registros distintos', () => {
    it('Residencial: mesmo contrato em safras/referências diferentes gera 2 registros e não sobrescreve', () => {
      const items: ResidencialInsertItem[] = [
        {
          arquivo: 'BASE_AGOSTO.xlsx',
          linha: 2,
          nr_contrato: '22043752',
          data_referencia: '26/08/2026',
          ocorrencias: 'Fatura(s) Paga(s)',
        },
        {
          arquivo: 'BASE_SETEMBRO.xlsx',
          linha: 2,
          nr_contrato: '22043752',
          data_referencia: '08/09/2026',
          ocorrencias: 'Pendente',
        },
      ]

      // Intra-batch não colapsa referências distintas
      const deduplicated = deduplicateResidencialBatchItems(items)
      expect(deduplicated).toHaveLength(2)
      expect(deduplicated[0].data_referencia).toBe('26/08/2026')
      expect(deduplicated[1].data_referencia).toBe('08/09/2026')
    })

    it('Móvel: mesmo número de telefone em safras/referências distintas mantém ambos', () => {
      const items: MovelInsertItem[] = [
        {
          arquivo: 'BASE_AGOSTO.xlsx',
          linha: 2,
          dados: { Numero: '61993300880' },
          data_referencia: '26/08/2026',
        },
        {
          arquivo: 'BASE_SETEMBRO.xlsx',
          linha: 2,
          dados: { Numero: '61993300880' },
          data_referencia: '08/09/2026',
        },
      ]

      const deduplicated = deduplicateMovelBatchItems(items)
      expect(deduplicated).toHaveLength(2)
      expect(deduplicated[0].data_referencia).toBe('26/08/2026')
      expect(deduplicated[1].data_referencia).toBe('08/09/2026')
    })
  })

  describe('Item 2.(d): Chave vazia → comportamento atual por arquivo + linha', () => {
    it('Residencial: linhas com nr_contrato vazio não são colapsadas entre si no lote', () => {
      const items: ResidencialInsertItem[] = [
        {
          arquivo: 'PLANILHA.xlsx',
          linha: 2,
          nr_contrato: '',
          data_referencia: '08/09/2026',
          cliente: 'Cliente Sem Contrato A',
        },
        {
          arquivo: 'PLANILHA.xlsx',
          linha: 3,
          nr_contrato: '   ',
          data_referencia: '08/09/2026',
          cliente: 'Cliente Sem Contrato B',
        },
      ]

      const deduplicated = deduplicateResidencialBatchItems(items)
      expect(deduplicated).toHaveLength(2)
      expect(deduplicated[0].cliente).toBe('Cliente Sem Contrato A')
      expect(deduplicated[1].cliente).toBe('Cliente Sem Contrato B')
    })

    it('Móvel: linhas com número vazio não são colapsadas entre si no lote', () => {
      const items: MovelInsertItem[] = [
        {
          arquivo: 'MOVEL.xlsx',
          linha: 2,
          dados: {},
          data_referencia: '26/08/2026',
          cliente: 'Cliente A',
        },
        {
          arquivo: 'MOVEL.xlsx',
          linha: 3,
          dados: {},
          data_referencia: '26/08/2026',
          cliente: 'Cliente B',
        },
      ]

      const deduplicated = deduplicateMovelBatchItems(items)
      expect(deduplicated).toHaveLength(2)
    })

    it('Fallback por arquivo + linha no banco: se não há chave de negócio mas coincide arquivo e linha, executa update', async () => {
      const existingId = 'rec-linha-5'
      const mockGetList = vi.fn().mockResolvedValue({
        items: [
          {
            id: existingId,
            arquivo: 'PLANILHA_ESPECIFICA.xlsx',
            linha: 5,
            nr_contrato: '',
            data_referencia: '08/09/2026',
            ocorrencias: 'Enviado Fatura(s)',
            comentarios: 'Comentário manual da linha 5',
          },
        ],
        totalPages: 1,
      })
      const mockUpdate = vi.fn().mockResolvedValue({ id: existingId })
      const mockCreate = vi.fn().mockResolvedValue({ id: 'new-id' })

      ;(pb.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        getList: mockGetList,
        update: mockUpdate,
        create: mockCreate,
      })

      const items: ResidencialInsertItem[] = [
        {
          arquivo: 'PLANILHA_ESPECIFICA.xlsx',
          linha: 5,
          nr_contrato: '',
          data_referencia: '08/09/2026',
          ocorrencias: 'Não Tratados',
        },
      ]

      await insertResidencialBatch(items)
      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        existingId,
        expect.objectContaining({
          arquivo: 'PLANILHA_ESPECIFICA.xlsx',
          linha: 5,
          ocorrencias: 'Enviado Fatura(s)',
          comentarios: 'Comentário manual da linha 5',
        }),
        expect.anything(),
      )
    })

    it('REGRA DE ISOLAMENTO: mesma chave em referências DIFERENTES resulta em 2 registros independentes no batch', () => {
      const rowsResidencial: ResidencialInsertItem[] = [
        {
          arquivo: 'lote_agosto.xlsx',
          linha: 2,
          loja: 'CELNET NOVA SUIÇA',
          data_referencia: '26/08/2026',
          typedFields: { nr_contrato: '56543211', ocorrencias: 'Pendente' },
        },
        {
          arquivo: 'lote_setembro.xlsx',
          linha: 2,
          loja: 'CELNET NOVA SUIÇA',
          data_referencia: '08/09/2026',
          typedFields: { nr_contrato: '56543211', ocorrencias: 'Fatura Paga' },
        },
      ]

      const dedupedRes = deduplicateResidencialBatchItems(rowsResidencial)
      // DEVEM ser 2 registros distintos preservados, pois as referências são distintas
      expect(dedupedRes).toHaveLength(2)
      expect(dedupedRes.map((r) => r.data_referencia)).toEqual(['26/08/2026', '08/09/2026'])

      const rowsMovel: MovelInsertItem[] = [
        {
          arquivo: 'movel_agosto.xlsx',
          linha: 10,
          loja: 'PARK SHOPPING',
          data_referencia: '26/08/2026',
          dados: { '0': '61999990000', '1': 'CLIENTE TESTE' },
          ocorrencias: 'Contato Realizado',
        },
        {
          arquivo: 'movel_setembro.xlsx',
          linha: 10,
          loja: 'PARK SHOPPING',
          data_referencia: '08/09/2026',
          dados: { '0': '61999990000', '1': 'CLIENTE TESTE' },
          ocorrencias: 'Promessa de Pagto',
        },
      ]

      const dedupedMovel = deduplicateMovelBatchItems(rowsMovel)
      // DEVEM ser 2 registros distintos
      expect(dedupedMovel).toHaveLength(2)
      expect(dedupedMovel.map((r) => r.data_referencia)).toEqual(['26/08/2026', '08/09/2026'])
    })

    it('REGRA DE ISOLAMENTO: importação da ref. X nunca altera nem sobrescreve registros da ref. Y no banco', async () => {
      const idAgosto = 'rec-agosto-26-08'
      // No banco existe o contrato '56543211' para 26/08/2026
      const mockGetList = vi.fn().mockImplementation((page, perPage, options) => {
        const filterStr = options?.filter || ''
        // Se a query pede '08/09/2026', o registro de 26/08 NÃO deve vir!
        if (filterStr.includes('08/09/2026') && !filterStr.includes('26/08/2026')) {
          return Promise.resolve({ items: [], totalPages: 1 })
        }
        return Promise.resolve({
          items: [
            {
              id: idAgosto,
              nr_contrato: '56543211',
              data_referencia: '26/08/2026',
              ocorrencias: 'Pendente',
              comentarios: 'Histórico original de agosto',
            },
          ],
          totalPages: 1,
        })
      })

      const mockUpdate = vi.fn().mockResolvedValue({ id: 'dummy' })
      const mockCreate = vi.fn().mockResolvedValue({ id: 'rec-setembro-novo' })

      ;(pb.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        getList: mockGetList,
        update: mockUpdate,
        create: mockCreate,
      })

      // Importar lote para referência 08/09/2026 com o MESMO contrato 56543211
      const loteSetembro: ResidencialInsertItem[] = [
        {
          arquivo: 'setembro_import.xlsx',
          linha: 4,
          data_referencia: '08/09/2026',
          loja: 'CELNET NOVA SUIÇA',
          typedFields: {
            nr_contrato: '56543211',
            ocorrencias: 'Fatura Paga',
          },
        },
      ]

      await insertResidencialBatch(loteSetembro)

      // O registro de agosto NUNCA deve sofrer update
      expect(mockUpdate).not.toHaveBeenCalled()
      // Um novo registro para setembro deve ser criado
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data_referencia: '08/09/2026',
          nr_contrato: '56543211',
          ocorrencias: 'Fatura Paga',
        }),
        expect.anything(),
      )
    })
  })
})
