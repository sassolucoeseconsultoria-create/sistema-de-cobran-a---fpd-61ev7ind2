import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUserStoreAccess } from './useUserStoreAccess'
import * as AuthContext from '@/contexts/AuthContext'
import type { StoreRecord } from '@/types/fpd'

describe('useUserStoreAccess', () => {
  const mockStores: StoreRecord[] = [
    {
      id: 'store_aguas_claras',
      collectionId: 'stores',
      collectionName: 'stores',
      name: 'Águas Claras',
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
      name: 'Taguatinga Shopping',
      status: 'active',
      total_sales: 0,
      total_debt: 0,
      fpd_rate: 0,
      created: '2025-01-01',
      updated: '2025-01-01',
    },
  ]

  it('permite todas as lojas para perfil ADM', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_adm',
        collectionId: 'users',
        collectionName: 'users',
        email: 'adm@example.com',
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

    const { result } = renderHook(() => useUserStoreAccess())

    expect(result.current.isAdm).toBe(true)
    expect(result.current.isStoreNameAllowed('Aguas Claras', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('Águas Claras', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('Qualquer Loja', mockStores)).toBe(true)
    expect(result.current.getAllowedStoreNames(mockStores)).toEqual([
      'Águas Claras',
      'Taguatinga Shopping',
    ])
  })

  it('permite correspondência normalizada (acentos, maiúsculas) para Gerente vinculado à loja Águas Claras', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente@example.com',
        name: 'Gerente Aguas Claras',
        role: 'Gerente',
        lojas: ['store_aguas_claras'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result } = renderHook(() => useUserStoreAccess())

    expect(result.current.isAdm).toBe(false)
    expect(result.current.isGerente).toBe(true)
    expect(result.current.managerStoreId).toBe('store_aguas_claras')
    expect(result.current.hasNoStoreAssigned).toBe(false)
    expect(result.current.isStoreIdAllowed('store_aguas_claras')).toBe(true)
    expect(result.current.isStoreIdAllowed('store_taguatinga')).toBe(false)

    // Variations of store names should all match Águas Claras
    expect(result.current.isStoreNameAllowed('Águas Claras', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('Aguas Claras', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('AGUAS CLARAS', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('LOJA AGUAS CLARAS', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARAS', mockStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('store_aguas_claras', mockStores)).toBe(true)

    // Other stores must not be allowed
    expect(result.current.isStoreNameAllowed('Taguatinga Shopping', mockStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('Taguatinga', mockStores)).toBe(false)

    // List of allowed store names
    expect(result.current.getAllowedStoreNames(mockStores)).toEqual(['Águas Claras'])
  })

  it('bloqueia acesso para usuário não-ADM sem nenhuma loja vinculada', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente_sem_loja',
        collectionId: 'users',
        collectionName: 'users',
        email: 'semloja@example.com',
        name: 'Gerente Sem Loja',
        role: 'Gerente',
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

    const { result } = renderHook(() => useUserStoreAccess())

    expect(result.current.isAdm).toBe(false)
    expect(result.current.isGerente).toBe(true)
    expect(result.current.managerStoreId).toBe(null)
    expect(result.current.hasNoStoreAssigned).toBe(true)
    expect(result.current.isStoreNameAllowed('Águas Claras', mockStores)).toBe(false)
    expect(result.current.getAllowedStoreNames(mockStores)).toEqual([])
  })

  it('Caso Concreto: Supervisora Jéssica NÃO deve ver "CELNET CALL NOVA SUIÇA" nem lojas de Luana', () => {
    const realStores: StoreRecord[] = [
      // Lojas de Jéssica
      {
        id: 'st_planaltina_go',
        name: 'CELNET PLANALTINA GO',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_jk',
        name: 'CELNET JK SHOPPING',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_manhattan',
        name: 'CELNET MANHATTAN SHOPPING',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_df_plaza',
        name: 'CELNET DF PLAZA',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_santa_maria',
        name: 'CELNET SANTA MARIA',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_terraco',
        name: 'CELNET TERRAÇO SHOPPING',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_park',
        name: 'CELNET PARK SHOPPING',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      // Lojas de Luana
      {
        id: 'st_aguas',
        name: 'CELNET AGUAS CLARA',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_boulevard',
        name: 'CELNET BOULEVARD SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_brasilia',
        name: 'CELNET BRASILIA SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_gama',
        name: 'CELNET GAMA SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_luziania',
        name: 'CELNET LUZIANIA',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_matriz_df',
        name: 'CELNET MATRIZ PLANALTINA DF',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      // Lojas CALL / ILHA sem supervisão
      {
        id: 'st_call_arniqueiras',
        name: 'CELNET CALL ARNIQUEIRAS',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_jk',
        name: 'CELNET CALL JK',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_ns',
        name: 'CELNET CALL NOVA SUIÇA',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_up',
        name: 'CELNET CALL UP',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_ilha_res',
        name: 'CELNET ILHA RESIDENCIAL',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_ilha_gama',
        name: 'CELNET ILHA RESIDENCIAL GAMA DF',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      // Loja física Nova Suíça
      {
        id: 'st_nova_suica',
        name: 'CELNET NOVA SUIÇA',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ] as StoreRecord[]

    // Usuária Jéssica
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: '9c4wgk0dup9yoko',
        collectionId: 'users',
        collectionName: 'users',
        email: 'jessica@celnet.com.br',
        name: 'Jessica',
        role: 'Supervisor',
        lojas: [
          'st_planaltina_go',
          'st_jk',
          'st_manhattan',
          'st_df_plaza',
          'st_santa_maria',
          'st_terraco',
          'st_park',
        ],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result } = renderHook(() => useUserStoreAccess())

    // Jéssica DEVE ver suas 7 lojas
    expect(result.current.isStoreNameAllowed('CELNET PLANALTINA GO', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET JK SHOPPING', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET SHOPPING JK', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET PARK SHOPPING', realStores)).toBe(true)

    // Jéssica NÃO DEVE ver "CELNET CALL NOVA SUIÇA" (sem supervisão)
    expect(result.current.isStoreNameAllowed('CELNET CALL NOVA SUIÇA', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET CALL JK', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET CALL ARNIQUEIRAS', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET ILHA RESIDENCIAL', realStores)).toBe(false)

    // Jéssica NÃO DEVE ver lojas de Luana (ex: Águas Claras, Planaltina DF)
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARA', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARAS', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET MATRIZ PLANALTINA DF', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET PLANALTINA DF', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET BOULEVARD SHOPPING', realStores)).toBe(false)
  })

  it('Caso Concreto: Supervisora Luana NÃO deve ver "CELNET PLANALTINA GO" nem lojas CALL', () => {
    const realStores: StoreRecord[] = [
      {
        id: 'st_planaltina_go',
        name: 'CELNET PLANALTINA GO',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_jk',
        name: 'CELNET JK SHOPPING',
        coordenacao: 'Coord 1',
        supervisao: 'Jessica',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_aguas',
        name: 'CELNET AGUAS CLARA',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_boulevard',
        name: 'CELNET BOULEVARD SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_brasilia',
        name: 'CELNET BRASILIA SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_gama',
        name: 'CELNET GAMA SHOPPING',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_luziania',
        name: 'CELNET LUZIANIA',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_matriz_df',
        name: 'CELNET MATRIZ PLANALTINA DF',
        coordenacao: 'Coord 2',
        supervisao: 'Luana Patricia',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_ns',
        name: 'CELNET CALL NOVA SUIÇA',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_jk',
        name: 'CELNET CALL JK',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ] as StoreRecord[]

    // Usuária Luana Patricia
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'qfsv7rq9ddvi8i5',
        collectionId: 'users',
        collectionName: 'users',
        email: 'luana@celnet.com.br',
        name: 'Luana Patricia',
        role: 'Supervisor',
        lojas: [
          'st_aguas',
          'st_boulevard',
          'st_brasilia',
          'st_gama',
          'st_luziania',
          'st_matriz_df',
        ],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result } = renderHook(() => useUserStoreAccess())

    // Luana DEVE ver suas lojas
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARA', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARAS', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET MATRIZ PLANALTINA DF', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET PLANALTINA DF', realStores)).toBe(true)

    // Luana NÃO DEVE ver Planaltina GO (loja de Jessica)
    expect(result.current.isStoreNameAllowed('CELNET PLANALTINA GO', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET JK SHOPPING', realStores)).toBe(false)

    // Luana NÃO DEVE ver lojas CALL / ILHA sem supervisão
    expect(result.current.isStoreNameAllowed('CELNET CALL NOVA SUIÇA', realStores)).toBe(false)
    expect(result.current.isStoreNameAllowed('CELNET CALL JK', realStores)).toBe(false)
  })

  it('Caso Concreto: Supervisora Karen DEVE ter acesso às lojas CALL e às suas lojas vinculadas', () => {
    const realStores: StoreRecord[] = [
      {
        id: 'st_call_arniqueiras',
        name: 'CELNET CALL ARNIQUEIRAS',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_jk',
        name: 'CELNET CALL JK',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_ns',
        name: 'CELNET CALL NOVA SUIÇA',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_up',
        name: 'CELNET CALL UP',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_nova_suica',
        name: 'CELNET NOVA SUIÇA',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_ilha_res',
        name: 'CELNET ILHA RESIDENCIAL',
        coordenacao: '',
        supervisao: 'Lucas Diniz',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ] as StoreRecord[]

    // Usuária Karen
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'y6n77x6pnudiuv6',
        collectionId: 'users',
        collectionName: 'users',
        email: 'karennatashacelnet@gmail.com',
        name: 'Karen Natasha do nascimento dias',
        role: 'Supervisor',
        lojas: ['st_call_arniqueiras', 'st_call_jk', 'st_call_ns', 'st_call_up', 'st_nova_suica'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result } = renderHook(() => useUserStoreAccess())

    // Karen DEVE ver todas as lojas CELNET CALL
    expect(result.current.isStoreNameAllowed('CELNET CALL NOVA SUIÇA', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET CALL JK', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET CALL ARNIQUEIRAS', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET CALL UP', realStores)).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET NOVA SUIÇA', realStores)).toBe(true)

    // Karen NÃO DEVE ver CELNET ILHA RESIDENCIAL (loja de Lucas Diniz)
    expect(result.current.isStoreNameAllowed('CELNET ILHA RESIDENCIAL', realStores)).toBe(false)
  })

  it('Caso Concreto: Supervisor Lucas Diniz DEVE ter acesso a CELNET ILHA RESIDENCIAL e NÃO às lojas CALL', () => {
    const realStores: StoreRecord[] = [
      {
        id: 'st_ilha_res',
        name: 'CELNET ILHA RESIDENCIAL',
        coordenacao: '',
        supervisao: 'Lucas Diniz',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_ilha_gama',
        name: 'CELNET ILHA RESIDENCIAL GAMA DF',
        coordenacao: '',
        supervisao: '',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
      {
        id: 'st_call_ns',
        name: 'CELNET CALL NOVA SUIÇA',
        coordenacao: 'Karen',
        supervisao: 'Karen',
        collectionId: 'stores',
        collectionName: 'stores',
        created: '',
        updated: '',
      },
    ] as StoreRecord[]

    // Usuário Lucas Diniz
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: '8il32cupxt7ov7a',
        collectionId: 'users',
        collectionName: 'users',
        email: 'lucasdiniz@celnet.com.br',
        name: 'Lucas Diniz',
        role: 'Supervisor',
        lojas: ['st_ilha_res'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    const { result } = renderHook(() => useUserStoreAccess())

    // Lucas DEVE ver CELNET ILHA RESIDENCIAL
    expect(result.current.isStoreNameAllowed('CELNET ILHA RESIDENCIAL', realStores)).toBe(true)

    // Lucas NÃO DEVE ver CELNET ILHA RESIDENCIAL GAMA DF nem lojas CALL
    expect(result.current.isStoreNameAllowed('CELNET ILHA RESIDENCIAL GAMA DF', realStores)).toBe(
      false,
    )
    expect(result.current.isStoreNameAllowed('CELNET CALL NOVA SUIÇA', realStores)).toBe(false)
  })

  it('Caso Concreto: ADM vê todas as lojas incluindo CALL/ILHA e lojas de todas as supervisões', () => {
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

    const { result } = renderHook(() => useUserStoreAccess())

    expect(result.current.isAdm).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET CALL NOVA SUIÇA')).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET CALL JK')).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET PLANALTINA GO')).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET MATRIZ PLANALTINA DF')).toBe(true)
    expect(result.current.isStoreNameAllowed('CELNET AGUAS CLARA')).toBe(true)
  })
})
