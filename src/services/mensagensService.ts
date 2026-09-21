import pb from '@/lib/pocketbase/client'
import { executeWithRateLimitRetry } from '@/lib/pocketbase/rateLimiter'
import type { MensagemClienteRecord, FaixaAtrasoMensagem } from '@/types/fpd'

/**
 * Busca todas as mensagens cadastradas no sistema, ordenadas pelo número de ordem crescente.
 */
export async function fetchMensagens(): Promise<MensagemClienteRecord[]> {
  return await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').getFullList<MensagemClienteRecord>({
      sort: 'ordem',
      requestKey: null,
    }),
  )
}

/**
 * Busca mensagens filtradas por faixa de atraso específica, ordenadas pelo número de ordem crescente.
 */
export async function fetchMensagensPorFaixa(
  faixa: FaixaAtrasoMensagem,
): Promise<MensagemClienteRecord[]> {
  const escaped = faixa.replace(/"/g, '\\"')
  return await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').getFullList<MensagemClienteRecord>({
      filter: `faixa_atraso = "${escaped}"`,
      sort: 'ordem',
      requestKey: null,
    }),
  )
}

/**
 * Calcula o próximo número de ordem sequencial de criação.
 * Se não houver mensagens ainda, o próximo é 1.
 * Caso contrário, é o maior número de ordem existente + 1.
 */
export async function getNextMensagemOrdem(): Promise<number> {
  const list = await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').getList<MensagemClienteRecord>(1, 1, {
      sort: '-ordem',
      requestKey: null,
    }),
  )
  if (list.items.length === 0) {
    return 1
  }
  const maxOrdem = Number(list.items[0].ordem)
  return Number.isFinite(maxOrdem) && maxOrdem >= 1 ? maxOrdem + 1 : 1
}

/**
 * Cria uma nova mensagem com ordem calculada automaticamente se não informada.
 */
export async function createMensagem(data: {
  texto: string
  faixa_atraso: FaixaAtrasoMensagem
  ordem?: number
}): Promise<MensagemClienteRecord> {
  const textoLimpo = (data.texto || '').trim()
  if (!textoLimpo) {
    throw new Error('O texto da mensagem é obrigatório.')
  }
  if (!data.faixa_atraso) {
    throw new Error('A faixa de atraso é obrigatória.')
  }

  const ordem =
    typeof data.ordem === 'number' && data.ordem > 0 ? data.ordem : await getNextMensagemOrdem()

  const payload = {
    texto: textoLimpo,
    faixa_atraso: data.faixa_atraso,
    ordem,
  }

  return await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').create<MensagemClienteRecord>(payload, {
      requestKey: null,
    }),
  )
}

/**
 * Atualiza uma mensagem existente (texto e/ou faixa de atraso e/ou ordem).
 */
export async function updateMensagem(
  id: string,
  data: {
    texto?: string
    faixa_atraso?: FaixaAtrasoMensagem
    ordem?: number
  },
): Promise<MensagemClienteRecord> {
  if (!id) {
    throw new Error('ID da mensagem é obrigatório para atualização.')
  }

  const payload: Record<string, unknown> = {}
  if (data.texto !== undefined) {
    const textoLimpo = data.texto.trim()
    if (!textoLimpo) {
      throw new Error('O texto da mensagem não pode ficar vazio.')
    }
    payload.texto = textoLimpo
  }
  if (data.faixa_atraso !== undefined) {
    payload.faixa_atraso = data.faixa_atraso
  }
  if (data.ordem !== undefined) {
    payload.ordem = data.ordem
  }

  return await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').update<MensagemClienteRecord>(id, payload, {
      requestKey: null,
    }),
  )
}

/**
 * Exclui uma mensagem pelo ID.
 */
export async function deleteMensagem(id: string): Promise<boolean> {
  if (!id) {
    throw new Error('ID da mensagem é obrigatório para exclusão.')
  }

  return await executeWithRateLimitRetry(() =>
    pb.collection('mensagens').delete(id, { requestKey: null }),
  )
}
