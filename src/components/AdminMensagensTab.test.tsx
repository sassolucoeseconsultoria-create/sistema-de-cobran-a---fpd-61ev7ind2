import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminMensagensTab } from './AdminMensagensTab'
import { FAIXAS_ATRASO_MENSAGEM } from '@/types/fpd'
import * as mensagensService from '@/services/mensagensService'

vi.mock('@/services/mensagensService', () => ({
  fetchMensagens: vi.fn(),
  createMensagem: vi.fn(),
  updateMensagem: vi.fn(),
  deleteMensagem: vi.fn(),
}))

vi.mock('@/hooks/use-realtime', () => ({
  useRealtime: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

describe('AdminMensagensTab - Novas Faixas de Atraso', () => {
  const mockMensagens = [
    {
      id: 'm1',
      collectionId: 'pbc_mensagens',
      collectionName: 'mensagens',
      ordem: 1,
      texto: 'Mensagem para faixa >15 dias',
      faixa_atraso: '>15 dias' as const,
      created: '2026-09-21',
      updated: '2026-09-21',
    },
    {
      id: 'm2',
      collectionId: 'pbc_mensagens',
      collectionName: 'mensagens',
      ordem: 2,
      texto: 'Mensagem para faixa 16 a 30 dias',
      faixa_atraso: '16 a 30 dias' as const,
      created: '2026-09-21',
      updated: '2026-09-21',
    },
    {
      id: 'm3',
      collectionId: 'pbc_mensagens',
      collectionName: 'mensagens',
      ordem: 3,
      texto: 'Mensagem para faixa >30 dias',
      faixa_atraso: '>30 dias' as const,
      created: '2026-09-21',
      updated: '2026-09-21',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mensagensService.fetchMensagens).mockResolvedValue(mockMensagens)
  })

  it('as constantes de faixas possuem exatamente os novos valores', () => {
    expect(FAIXAS_ATRASO_MENSAGEM).toEqual(['>15 dias', '16 a 30 dias', '>30 dias'])
  })

  it('exibe cards de métricas e botões de filtro com as novas faixas', async () => {
    render(<AdminMensagensTab />)

    await waitFor(() => {
      expect(screen.getByText('Mensagens para Clientes')).toBeDefined()
    })

    // Badges / cards das faixas
    expect(screen.getAllByText('>15 dias').length).toBeGreaterThan(0)
    expect(screen.getAllByText('16 a 30 dias').length).toBeGreaterThan(0)
    expect(screen.getAllByText('>30 dias').length).toBeGreaterThan(0)

    // Valores antigos não devem aparecer na tela
    expect(screen.queryByText('Menos de 30 dias')).toBeNull()
    expect(screen.queryByText('31 a 60 dias')).toBeNull()
    expect(screen.queryByText('Maior que 90 dias')).toBeNull()
  })

  it('ao abrir o modal de nova mensagem, o valor padrão é ">15 dias" e lista as novas opções no select', async () => {
    const user = userEvent.setup()
    render(<AdminMensagensTab />)

    await waitFor(() => {
      expect(screen.getByText('Nova Mensagem')).toBeDefined()
    })

    await user.click(screen.getByText('Nova Mensagem'))

    await waitFor(() => {
      expect(screen.getByText('Faixa de Atraso:')).toBeDefined()
    })

    // O select exibe o valor padrão ">15 dias"
    const triggers = screen.getAllByRole('combobox')
    expect(triggers.length).toBeGreaterThan(0)
    expect(triggers[0].textContent).toContain('>15 dias')
  })
})
