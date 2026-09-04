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
})
