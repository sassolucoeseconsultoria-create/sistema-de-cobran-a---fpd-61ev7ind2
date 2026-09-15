import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isReferenceDateAllowedForRole,
  filterReferenceDatesForRole,
  normalizeReferenceDate,
} from '@/services/referenceDatePermissionService'
import type { ReferenceDatePermissionRecord } from '@/types/fpd'

describe('Permissões de Data de Referência por Perfil (Regras de Negócio)', () => {
  const mockPermissions: ReferenceDatePermissionRecord[] = [
    {
      id: 'p1',
      collectionId: 'reference_date_permissions',
      collectionName: 'reference_date_permissions',
      referente: '26/08/2026',
      gerente: true,
      supervisor: false,
      coordenador: true,
      created: '2026-08-26',
      updated: '2026-08-26',
    },
    {
      id: 'p2',
      collectionId: 'reference_date_permissions',
      collectionName: 'reference_date_permissions',
      referente: '08/09/2026',
      gerente: false,
      supervisor: true,
      coordenador: false,
      created: '2026-09-08',
      updated: '2026-09-08',
    },
  ]

  const allDates = ['26/08/2026', '08/09/2026', '15/10/2026']

  describe('1. Perfil ADM (Acesso Irrestrito)', () => {
    it('ADM sempre tem acesso a todas as datas de referência, independentemente de flags', () => {
      expect(isReferenceDateAllowedForRole('26/08/2026', 'ADM', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('08/09/2026', 'ADM', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('15/10/2026', 'ADM', mockPermissions)).toBe(true)
      expect(filterReferenceDatesForRole(allDates, 'ADM', mockPermissions)).toEqual(allDates)
    })
  })

  describe('2. Toggle desabilitado esconde data para o perfil especificado e mantém para os demais', () => {
    it('26/08/2026 está desabilitada para Supervisor, mas habilitada para Gerente, Coordenador e ADM', () => {
      expect(isReferenceDateAllowedForRole('26/08/2026', 'Supervisor', mockPermissions)).toBe(false)
      expect(isReferenceDateAllowedForRole('26/08/2026', 'Gerente', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('26/08/2026', 'Coordenador', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('26/08/2026', 'ADM', mockPermissions)).toBe(true)

      const supervisorDates = filterReferenceDatesForRole(allDates, 'Supervisor', mockPermissions)
      expect(supervisorDates).not.toContain('26/08/2026')
      expect(supervisorDates).toContain('08/09/2026')
      expect(supervisorDates).toContain('15/10/2026')
    })

    it('08/09/2026 está desabilitada para Gerente e Coordenador, mas habilitada para Supervisor e ADM', () => {
      expect(isReferenceDateAllowedForRole('08/09/2026', 'Gerente', mockPermissions)).toBe(false)
      expect(isReferenceDateAllowedForRole('08/09/2026', 'Coordenador', mockPermissions)).toBe(
        false,
      )
      expect(isReferenceDateAllowedForRole('08/09/2026', 'Supervisor', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('08/09/2026', 'ADM', mockPermissions)).toBe(true)

      const gerenteDates = filterReferenceDatesForRole(allDates, 'Gerente', mockPermissions)
      expect(gerenteDates).toContain('26/08/2026')
      expect(gerenteDates).not.toContain('08/09/2026')
      expect(gerenteDates).toContain('15/10/2026')
    })
  })

  describe('3. Default habilitado para novas referências ou referências sem registro', () => {
    it('Referência sem registro na coleção (ex: 15/10/2026) é tratada como habilitada para todos os perfis', () => {
      expect(isReferenceDateAllowedForRole('15/10/2026', 'Gerente', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('15/10/2026', 'Supervisor', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('15/10/2026', 'Coordenador', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('15/10/2026', 'ADM', mockPermissions)).toBe(true)
    })

    it('Coleção de permissões vazia mantém todas as referências habilitadas para todos', () => {
      expect(filterReferenceDatesForRole(allDates, 'Gerente', [])).toEqual(allDates)
      expect(filterReferenceDatesForRole(allDates, 'Supervisor', [])).toEqual(allDates)
      expect(filterReferenceDatesForRole(allDates, 'Coordenador', [])).toEqual(allDates)
    })
  })

  describe('4. Normalização e resiliência de strings', () => {
    it('Normaliza whitespace ao comparar datas', () => {
      expect(normalizeReferenceDate('  26/08/2026  ')).toBe('26/08/2026')
      expect(isReferenceDateAllowedForRole(' 26/08/2026 ', 'Supervisor', mockPermissions)).toBe(
        false,
      )
      expect(isReferenceDateAllowedForRole(' 26/08/2026 ', 'Gerente', mockPermissions)).toBe(true)
    })

    it('Trata datas nulas ou vazias graciosamente', () => {
      expect(isReferenceDateAllowedForRole(null, 'Supervisor', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole('', 'Supervisor', mockPermissions)).toBe(true)
      expect(isReferenceDateAllowedForRole(undefined, 'Supervisor', mockPermissions)).toBe(true)
    })
  })
})
