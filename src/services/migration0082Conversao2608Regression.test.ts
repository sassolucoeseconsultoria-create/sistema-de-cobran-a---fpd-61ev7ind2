import { describe, it, expect } from 'vitest'

interface FpdItem {
  id: string
  store: string
  referente: string
  total_linhas: number
  fatura_paga: number
  envio_fatura: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  pendente: number
  contato_realizado: number
  nao_tratados: number
  outros: number
}

interface VendorItem {
  id: string
  vendedor: string
  loja: string
  supervisao?: string
  data_referencia: string
  total_linhas: number
  fatura_paga: number
  envio_fatura: number
  promessa_pagto: number
  sem_contato: number
  cancelados: number
  pendente: number
  contato_realizado: number
  nao_tratados: number
  outros: number
}

interface PermItem {
  id: string
  referente: string
  gerente: boolean
  supervisor: boolean
  coordenador: boolean
}

/**
 * Simula a lógica de conversão da migration 0082:
 * '26/08/2026' -> '08/2026' com soma de campos quantitativos em caso de colisão.
 */
function migrate2608To082026(
  fpdRecords: FpdItem[],
  vendorRecords: VendorItem[],
  permissions: PermItem[],
) {
  const oldRef = '26/08/2026'
  const newRef = '08/2026'

  // 1. FPD Records
  const fpdResult: FpdItem[] = []
  for (const item of fpdRecords) {
    if (item.referente !== oldRef) {
      fpdResult.push({ ...item })
      continue
    }

    const existingTarget = fpdResult.find((r) => r.store === item.store && r.referente === newRef)

    if (existingTarget) {
      existingTarget.total_linhas += item.total_linhas
      existingTarget.fatura_paga += item.fatura_paga
      existingTarget.envio_fatura += item.envio_fatura
      existingTarget.promessa_pagto += item.promessa_pagto
      existingTarget.sem_contato += item.sem_contato
      existingTarget.cancelados += item.cancelados
      existingTarget.pendente += item.pendente
      existingTarget.contato_realizado += item.contato_realizado
      existingTarget.nao_tratados += item.nao_tratados
      existingTarget.outros += item.outros
    } else {
      fpdResult.push({
        ...item,
        referente: newRef,
      })
    }
  }

  // 2. Vendor consolidations
  const vendorResult: VendorItem[] = []
  for (const item of vendorRecords) {
    if (item.data_referencia !== oldRef) {
      vendorResult.push({ ...item })
      continue
    }

    const existingTarget = vendorResult.find(
      (v) =>
        v.vendedor.trim() === item.vendedor.trim() &&
        v.loja.trim() === item.loja.trim() &&
        v.data_referencia === newRef,
    )

    if (existingTarget) {
      existingTarget.total_linhas += item.total_linhas
      existingTarget.fatura_paga += item.fatura_paga
      existingTarget.envio_fatura += item.envio_fatura
      existingTarget.promessa_pagto += item.promessa_pagto
      existingTarget.sem_contato += item.sem_contato
      existingTarget.cancelados += item.cancelados
      existingTarget.pendente += item.pendente
      existingTarget.contato_realizado += item.contato_realizado
      existingTarget.nao_tratados += item.nao_tratados
      existingTarget.outros += item.outros
      if (!existingTarget.supervisao && item.supervisao) {
        existingTarget.supervisao = item.supervisao
      }
    } else {
      vendorResult.push({
        ...item,
        data_referencia: newRef,
      })
    }
  }

  // 3. Permissions
  const permResult: PermItem[] = []
  let targetPerm = permissions.find((p) => p.referente === newRef)
  const oldPerm = permissions.find((p) => p.referente === oldRef)

  for (const p of permissions) {
    if (p.referente !== oldRef && p.referente !== newRef) {
      permResult.push({ ...p })
    }
  }

  if (oldPerm || targetPerm) {
    const merged: PermItem = {
      id: targetPerm?.id || oldPerm?.id || 'new-perm',
      referente: newRef,
      gerente: Boolean(targetPerm?.gerente || oldPerm?.gerente),
      supervisor: Boolean(targetPerm?.supervisor || oldPerm?.supervisor),
      coordenador: Boolean(targetPerm?.coordenador || oldPerm?.coordenador),
    }
    permResult.push(merged)
  }

  return { fpdResult, vendorResult, permResult }
}

describe('Regressão Migration 0082: Conversão 26/08/2026 -> 08/2026', () => {
  it('converte registro único de fpd_records sem colisão para 08/2026', () => {
    const initialFpd: FpdItem[] = [
      {
        id: 'fpd-1',
        store: 'store-a',
        referente: '26/08/2026',
        total_linhas: 50,
        fatura_paga: 20,
        envio_fatura: 10,
        promessa_pagto: 5,
        sem_contato: 5,
        cancelados: 2,
        pendente: 5,
        contato_realizado: 2,
        nao_tratados: 1,
        outros: 0,
      },
    ]

    const { fpdResult } = migrate2608To082026(initialFpd, [], [])
    expect(fpdResult).toHaveLength(1)
    expect(fpdResult[0].referente).toBe('08/2026')
    expect(fpdResult[0].total_linhas).toBe(50)
    expect(fpdResult[0].fatura_paga).toBe(20)
  })

  it('ao colidir com consolidado já existente em 08/2026 da mesma loja, soma quantitativos e expurga duplicata', () => {
    const initialFpd: FpdItem[] = [
      {
        id: 'fpd-dest',
        store: 'store-planaltina',
        referente: '08/2026',
        total_linhas: 30,
        fatura_paga: 10,
        envio_fatura: 5,
        promessa_pagto: 2,
        sem_contato: 3,
        cancelados: 1,
        pendente: 4,
        contato_realizado: 2,
        nao_tratados: 3,
        outros: 0,
      },
      {
        id: 'fpd-orig',
        store: 'store-planaltina',
        referente: '26/08/2026',
        total_linhas: 70,
        fatura_paga: 30,
        envio_fatura: 15,
        promessa_pagto: 8,
        sem_contato: 7,
        cancelados: 3,
        pendente: 4,
        contato_realizado: 1,
        nao_tratados: 2,
        outros: 0,
      },
    ]

    const { fpdResult } = migrate2608To082026(initialFpd, [], [])
    expect(fpdResult).toHaveLength(1)
    expect(fpdResult[0].referente).toBe('08/2026')
    expect(fpdResult[0].total_linhas).toBe(100)
    expect(fpdResult[0].fatura_paga).toBe(40)
    expect(fpdResult[0].envio_fatura).toBe(20)
    expect(fpdResult[0].promessa_pagto).toBe(10)
    expect(fpdResult[0].sem_contato).toBe(10)
    expect(fpdResult[0].cancelados).toBe(4)
    expect(fpdResult[0].pendente).toBe(8)
    expect(fpdResult[0].contato_realizado).toBe(3)
    expect(fpdResult[0].nao_tratados).toBe(5)
  })

  it('ao colidir em vendor_consolidations pelo mesmo vendedor+loja, soma e preserva um único registro', () => {
    const initialVendors: VendorItem[] = [
      {
        id: 'v-1',
        vendedor: 'MARIA SILVA',
        loja: 'CELNET AGUAS CLARAS',
        supervisao: 'SUPER 1',
        data_referencia: '08/2026',
        total_linhas: 12,
        fatura_paga: 5,
        envio_fatura: 3,
        promessa_pagto: 1,
        sem_contato: 1,
        cancelados: 0,
        pendente: 1,
        contato_realizado: 1,
        nao_tratados: 0,
        outros: 0,
      },
      {
        id: 'v-2',
        vendedor: 'MARIA SILVA',
        loja: 'CELNET AGUAS CLARAS',
        data_referencia: '26/08/2026',
        total_linhas: 8,
        fatura_paga: 3,
        envio_fatura: 2,
        promessa_pagto: 1,
        sem_contato: 1,
        cancelados: 1,
        pendente: 0,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
      },
    ]

    const { vendorResult } = migrate2608To082026([], initialVendors, [])
    expect(vendorResult).toHaveLength(1)
    expect(vendorResult[0].data_referencia).toBe('08/2026')
    expect(vendorResult[0].total_linhas).toBe(20)
    expect(vendorResult[0].fatura_paga).toBe(8)
    expect(vendorResult[0].envio_fatura).toBe(5)
    expect(vendorResult[0].cancelados).toBe(1)
    expect(vendorResult[0].supervisao).toBe('SUPER 1')
  })

  it('em reference_date_permissions, mescla permissões de 26/08/2026 para 08/2026 com OR', () => {
    const initialPerms: PermItem[] = [
      {
        id: 'perm-old',
        referente: '26/08/2026',
        gerente: true,
        supervisor: false,
        coordenador: true,
      },
      {
        id: 'perm-new',
        referente: '08/2026',
        gerente: false,
        supervisor: true,
        coordenador: false,
      },
    ]

    const { permResult } = migrate2608To082026([], [], initialPerms)
    expect(permResult).toHaveLength(1)
    expect(permResult[0].referente).toBe('08/2026')
    expect(permResult[0].gerente).toBe(true)
    expect(permResult[0].supervisor).toBe(true)
    expect(permResult[0].coordenador).toBe(true)
  })

  it('é idempotente se não existirem registros com 26/08/2026', () => {
    const fpd: FpdItem[] = [
      {
        id: 'fpd-1',
        store: 'store-1',
        referente: '08/2026',
        total_linhas: 10,
        fatura_paga: 5,
        envio_fatura: 2,
        promessa_pagto: 1,
        sem_contato: 1,
        cancelados: 0,
        pendente: 1,
        contato_realizado: 0,
        nao_tratados: 0,
        outros: 0,
      },
    ]

    const { fpdResult, vendorResult, permResult } = migrate2608To082026(fpd, [], [])
    expect(fpdResult).toEqual(fpd)
    expect(vendorResult).toHaveLength(0)
    expect(permResult).toHaveLength(0)
  })
})
