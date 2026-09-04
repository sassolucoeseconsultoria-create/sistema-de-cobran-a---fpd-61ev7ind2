import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TopOfensores } from './TopOfensores'
import * as AuthContext from '@/contexts/AuthContext'
import * as xlsxExport from '@/lib/xlsxExport'
import type { StoreRecord, VendorConsolidationRecord } from '@/types/fpd'

// Mock fpdService
const mockStores: StoreRecord[] = [
  {
    id: 'store_aguas',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET AGUAS CLARAS',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'store_taguatinga',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET TAGUATINGA',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
  {
    id: 'store_ceilandia',
    collectionId: 'stores',
    collectionName: 'stores',
    name: 'CELNET CEILANDIA',
    status: 'active',
    total_sales: 0,
    total_debt: 0,
    fpd_rate: 0,
    created: '2025-01-01',
    updated: '2025-01-01',
  },
]

// Generate test vendor records
// 10 vendors in Aguas Claras, 10 in Taguatinga, 10 in Ceilandia
const createMockVendors = (): VendorConsolidationRecord[] => {
  const vendors: VendorConsolidationRecord[] = []

  // Store 1: Aguas Claras (10 vendedores, 100 to 10 lines)
  for (let i = 1; i <= 10; i++) {
    vendors.push({
      id: `v_aguas_${i}`,
      collectionId: 'vendor_consolidations',
      collectionName: 'vendor_consolidations',
      vendedor: `Vendedor Aguas ${i}`,
      loja: 'CELNET AGUAS CLARAS',
      supervisao: 'Supervisão Centro-Sul',
      data_referencia: '10/2024',
      total_linhas: 100 - i * 5, // 95, 90, 85, ...
      fatura_paga: 10,
      envio_fatura: 5,
      promessa_pagto: 5,
      sem_contato: 2,
      cancelados: 1,
      pendente: 5,
      contato_realizado: 3,
      outros: 0,
      nao_tratados: 4,
      created: '2025-01-01',
      updated: '2025-01-01',
    })
  }

  // Store 2: Taguatinga (10 vendedores, 80 to 35 lines)
  for (let i = 1; i <= 10; i++) {
    vendors.push({
      id: `v_tag_${i}`,
      collectionId: 'vendor_consolidations',
      collectionName: 'vendor_consolidations',
      vendedor: `Vendedor Taguatinga ${i}`,
      loja: 'CELNET TAGUATINGA',
      supervisao: 'Supervisão Centro-Sul',
      data_referencia: '10/2024',
      total_linhas: 80 - i * 4,
      fatura_paga: 8,
      envio_fatura: 4,
      promessa_pagto: 3,
      sem_contato: 1,
      cancelados: 0,
      pendente: 2,
      contato_realizado: 2,
      outros: 0,
      nao_tratados: 1,
      created: '2025-01-01',
      updated: '2025-01-01',
    })
  }

  // Store 3: Ceilandia (10 vendedores, 60 to 15 lines)
  for (let i = 1; i <= 10; i++) {
    vendors.push({
      id: `v_cei_${i}`,
      collectionId: 'vendor_consolidations',
      collectionName: 'vendor_consolidations',
      vendedor: `Vendedor Ceilandia ${i}`,
      loja: 'CELNET CEILANDIA',
      supervisao: 'Supervisão Oeste',
      data_referencia: '10/2024',
      total_linhas: 60 - i * 3,
      fatura_paga: 5,
      envio_fatura: 2,
      promessa_pagto: 2,
      sem_contato: 1,
      cancelados: 0,
      pendente: 1,
      contato_realizado: 1,
      outros: 0,
      nao_tratados: 1,
      created: '2025-01-01',
      updated: '2025-01-01',
    })
  }

  return vendors
}

vi.mock('@/services/fpdService', () => ({
  fetchVendorConsolidations: vi.fn().mockImplementation(() => Promise.resolve(createMockVendors())),
  fetchStores: vi.fn().mockImplementation(() => Promise.resolve(mockStores)),
  fetchDistinctReferenceDates: vi.fn().mockResolvedValue(['10/2024']),
  matchStore: vi.fn((name: string, stores: StoreRecord[]) => {
    return stores.find((s) => s.name.toLowerCase() === (name || '').toLowerCase()) || null
  }),
}))

vi.mock('@/hooks/use-realtime', () => ({
  default: vi.fn(),
}))

describe('TopOfensores - Regras de Limite de Ranking por Perfil', () => {
  let exportVendorsSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    exportVendorsSpy = vi.spyOn(xlsxExport, 'exportVendorsToXlsx').mockImplementation(vi.fn())
  })

  it('Cenário 1: Perfil Gerente traz os 3 principais da loja vinculada a ele (trava seletor e exporta 3)', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente.aguas@celnet.com.br',
        name: 'Gerente Águas Claras',
        role: 'Gerente',
        lojas: ['store_aguas'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TopOfensores />
      </MemoryRouter>,
    )

    // Título dinâmico: "Principais Ofensores (Top 3)"
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Principais Ofensores \(Top 3\)/i })).toBeDefined()
    })

    // Badges / Informação textual de limite
    const limitInfo = screen.getByTestId('profile-limit-info')
    expect(limitInfo.textContent).toContain(
      'Exibindo 3 de 10 possíveis — limite do perfil Gerente: 3',
    )

    // Seletor de loja deve estar travado/fixo para a loja vinculada
    const lockedDisplay = screen.getByTestId('locked-store-display')
    expect(lockedDisplay.textContent).toMatch(/CELNET AGUAS CLARAS/i)
    // Não deve existir dropdown editável de loja
    expect(screen.queryByRole('combobox', { name: /selecionar loja/i })).toBeNull()

    // Tabela deve conter exatamente 3 linhas no tbody (Top 3)
    // Vendedores rankeados de Águas Claras: Vendedor Aguas 1 (90 linhas), 2 (85 linhas), 3 (80 linhas)
    await waitFor(() => {
      expect(screen.getByText('Vendedor Aguas 1')).toBeDefined()
      expect(screen.getByText('Vendedor Aguas 2')).toBeDefined()
      expect(screen.getByText('Vendedor Aguas 3')).toBeDefined()
    })

    // 4º não deve estar visível
    expect(screen.queryByText('Vendedor Aguas 4')).toBeNull()
    // Lojas de outros locais não devem aparecer
    expect(screen.queryByText('Vendedor Taguatinga 1')).toBeNull()

    // Rodapé deve exibir TOTAL
    expect(screen.getByText('TOTAL')).toBeDefined()
    expect(screen.getByText(/TOTAL \(3\)/i)).toBeDefined()

    // Exportação para Excel: deve exportar apenas os 3 registros com totals calculados dos 3 itens
    const exportBtn = screen.getByRole('button', { name: /Exportar Principais Ofensores/i })
    expect(exportBtn).toBeDefined()
    await user.click(exportBtn)

    expect(exportVendorsSpy).toHaveBeenCalledTimes(1)
    const exportedRows = exportVendorsSpy.mock.calls[0][0]
    expect(exportedRows).toHaveLength(3)
    expect(exportedRows.map((r: any) => r.vendedor)).toEqual([
      'Vendedor Aguas 1',
      'Vendedor Aguas 2',
      'Vendedor Aguas 3',
    ])
    // Verifica que os totais passados para o exportador somam exatamente os 3 itens visíveis:
    // 95 + 90 + 85 = 270 totalLinhas
    // 10 + 10 + 10 = 30 faturaPaga
    // 5 + 5 + 5 = 15 envioFatura, etc.
    const exportedTotals = exportVendorsSpy.mock.calls[0][1]
    expect(exportedTotals.totalLinhas).toBe(270)
    expect(exportedTotals.faturaPaga).toBe(30)
    expect(exportedTotals.envioFatura).toBe(15)

    const exportOptions = exportVendorsSpy.mock.calls[0][3]
    expect(exportOptions).toEqual({
      sheetName: 'Principais_3_Ofensores',
      filePrefix: 'Ranking_3_Principais_Ofensores_FPD',
    })
  })

  it('Cenário 2: Perfil Supervisor traz os 10 principais das lojas vinculadas a ele', async () => {
    // Supervisor com acesso a Águas Claras e Taguatinga (20 vendedores disponíveis)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_sup',
        collectionId: 'users',
        collectionName: 'users',
        email: 'supervisor@celnet.com.br',
        name: 'Supervisor Centro-Sul',
        role: 'Supervisor',
        lojas: ['store_aguas', 'store_taguatinga'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TopOfensores />
      </MemoryRouter>,
    )

    // Título dinâmico: "Principais Ofensores (Top 10)"
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Principais Ofensores \(Top 10\)/i }),
      ).toBeDefined()
    })

    // Badges / Informação textual de limite: 10 de 20 possíveis — limite do perfil Supervisor: 10
    const limitInfo = screen.getByTestId('profile-limit-info')
    expect(limitInfo.textContent).toContain(
      'Exibindo 10 de 20 possíveis — limite do perfil Supervisor: 10',
    )

    // Supervisor tem dropdown de loja (para filtrar entre suas lojas vinculadas ou todas as suas lojas)
    const storeSelect = screen.getByRole('combobox', { name: /selecionar loja/i })
    expect(storeSelect).toBeDefined()

    // Ceilândia não está vinculada ao Supervisor, então nunca deve aparecer
    expect(screen.queryByText('Vendedor Ceilandia 1')).toBeNull()

    // Rodapé deve exibir TOTAL
    expect(screen.getByText('TOTAL')).toBeDefined()
    expect(screen.getByText(/TOTAL \(10\)/i)).toBeDefined()

    // Exportação deve exportar apenas os 10 itens com totals correspondentes aos 10 itens
    const exportBtn = screen.getByRole('button', { name: /Exportar Principais Ofensores/i })
    await user.click(exportBtn)

    expect(exportVendorsSpy).toHaveBeenCalledTimes(1)
    const exportedRows = exportVendorsSpy.mock.calls[0][0]
    expect(exportedRows).toHaveLength(10)
    const exportedTotals = exportVendorsSpy.mock.calls[0][1]
    // Top 10 são os maiores entre Águas (95, 90, 85, 80, 75, 70, 65, 60, 55, 50) e Taguatinga (76, 72, 68...)
    const expectedSum = exportedRows.reduce((acc: number, r: any) => acc + r.totalLinhas, 0)
    expect(exportedTotals.totalLinhas).toBe(expectedSum)
    expect(exportedTotals.totalLinhas).toBeGreaterThan(0)

    const exportOptions = exportVendorsSpy.mock.calls[0][3]
    expect(exportOptions).toEqual({
      sheetName: 'Principais_10_Ofensores',
      filePrefix: 'Ranking_10_Principais_Ofensores_FPD',
    })
  })

  it('Cenário 3: Perfil Coordenador traz os 20 principais das lojas vinculadas a ele', async () => {
    // Coordenador com acesso a todas as 3 lojas (30 vendedores no total)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_coord',
        collectionId: 'users',
        collectionName: 'users',
        email: 'coordenador@celnet.com.br',
        name: 'Coordenador Geral',
        role: 'Coordenador',
        lojas: ['store_aguas', 'store_taguatinga', 'store_ceilandia'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TopOfensores />
      </MemoryRouter>,
    )

    // Título dinâmico: "Principais Ofensores (Top 20)"
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Principais Ofensores \(Top 20\)/i }),
      ).toBeDefined()
    })

    // Badges / Informação textual de limite: 20 de 30 possíveis — limite do perfil Coordenador: 20
    const limitInfo = screen.getByTestId('profile-limit-info')
    expect(limitInfo.textContent).toContain(
      'Exibindo 20 de 30 possíveis — limite do perfil Coordenador: 20',
    )

    // Rodapé deve exibir TOTAL
    expect(screen.getByText('TOTAL')).toBeDefined()
    expect(screen.getByText(/TOTAL \(20\)/i)).toBeDefined()

    // Exportação deve exportar 20 itens
    const exportBtn = screen.getByRole('button', { name: /Exportar Principais Ofensores/i })
    await user.click(exportBtn)

    expect(exportVendorsSpy).toHaveBeenCalledTimes(1)
    const exportedRows = exportVendorsSpy.mock.calls[0][0]
    expect(exportedRows).toHaveLength(20)
    const exportedTotals = exportVendorsSpy.mock.calls[0][1]
    const expectedSum = exportedRows.reduce((acc: number, r: any) => acc + r.totalLinhas, 0)
    expect(exportedTotals.totalLinhas).toBe(expectedSum)
    expect(exportedTotals.totalLinhas).toBeGreaterThan(0)

    const exportOptions = exportVendorsSpy.mock.calls[0][3]
    expect(exportOptions).toEqual({
      sheetName: 'Principais_20_Ofensores',
      filePrefix: 'Ranking_20_Principais_Ofensores_FPD',
    })
  })

  it('Cenário 4: Perfil ADM traz os 20 principais e calcula o total correto', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_adm',
        collectionId: 'users',
        collectionName: 'users',
        email: 'adm@celnet.com.br',
        name: 'Administrador Geral',
        role: 'ADM',
        lojas: [],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TopOfensores />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Principais Ofensores \(Top 20\)/i }),
      ).toBeDefined()
    })

    expect(screen.getByText('TOTAL')).toBeDefined()
    expect(screen.getByText(/TOTAL \(20\)/i)).toBeDefined()

    const exportBtn = screen.getByRole('button', { name: /Exportar Principais Ofensores/i })
    await user.click(exportBtn)

    expect(exportVendorsSpy).toHaveBeenCalledTimes(1)
    const exportedRows = exportVendorsSpy.mock.calls[0][0]
    expect(exportedRows).toHaveLength(20)
    const exportedTotals = exportVendorsSpy.mock.calls[0][1]
    const expectedSum = exportedRows.reduce((acc: number, r: any) => acc + r.totalLinhas, 0)
    expect(exportedTotals.totalLinhas).toBe(expectedSum)
  })

  it('Cenário 5: Não deve exibir linha de TOTAL quando não houver ofensores', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_adm',
        collectionId: 'users',
        collectionName: 'users',
        email: 'adm@celnet.com.br',
        name: 'Administrador',
        role: 'ADM',
        lojas: [],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TopOfensores />
      </MemoryRouter>,
    )

    // Digita busca que não corresponde a ninguém
    const searchInput = screen.getByPlaceholderText(/buscar ofensor/i)
    await user.type(searchInput, 'vendedor_que_nao_existe_xyz')

    await waitFor(() => {
      expect(screen.getByText('Nenhum ofensor encontrado')).toBeDefined()
    })

    // Linha de total não deve aparecer
    expect(screen.queryByText('TOTAL')).toBeNull()
  })
})
