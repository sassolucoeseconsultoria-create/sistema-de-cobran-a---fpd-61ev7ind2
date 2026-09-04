import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './Layout'
import ProtectedRoute from './ProtectedRoute'
import * as AuthContext from '@/contexts/AuthContext'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('Layout e Controle de Acesso por Perfil', () => {
  const createMockAuth = (role: 'ADM' | 'Coordenador' | 'Supervisor' | 'Gerente') => ({
    user: {
      id: `usr_${role.toLowerCase()}`,
      collectionId: 'users',
      collectionName: 'users',
      email: `${role.toLowerCase()}@celnet.com.br`,
      name: `Usuário ${role}`,
      role,
      lojas: ['store_1'],
      created: '2025-01-01',
      updated: '2025-01-01',
    },
    token: 'mock-token',
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshAuth: vi.fn(),
  })

  it('exibe Lojas e Importar Arquivos habilitados para perfil ADM', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue(createMockAuth('ADM'))

    render(
      <MemoryRouter initialEntries={['/']}>
        <TooltipProvider>
          <Layout />
        </TooltipProvider>
      </MemoryRouter>,
    )

    // NavLinks habilitados
    const importarLink = screen.getByRole('link', { name: /importar arquivos/i })
    expect(importarLink).not.toBeNull()
    expect(importarLink.getAttribute('href')).toBe('/importar')

    const lojasLink = screen.getByRole('link', { name: /lojas/i })
    expect(lojasLink).not.toBeNull()
    expect(lojasLink.getAttribute('href')).toBe('/lojas')

    // Botão de importação no header visível para ADM na rota /
    expect(screen.getByRole('button', { name: /importar planilhas/i })).not.toBeNull()
  })

  it.each(['Gerente', 'Coordenador', 'Supervisor'] as const)(
    'renderiza Lojas e Importar Arquivos desabilitados para perfil %s',
    (role) => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue(createMockAuth(role))

      render(
        <MemoryRouter initialEntries={['/']}>
          <TooltipProvider>
            <Layout />
          </TooltipProvider>
        </MemoryRouter>,
      )

      // NÃO devem existir como links de navegação ativos
      expect(screen.queryByRole('link', { name: /importar arquivos/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /^lojas$/i })).toBeNull()

      // Itens desabilitados com texto visível no menu
      const disabledElements = screen.getAllByText(/importar arquivos/i)
      expect(disabledElements.length).toBeGreaterThan(0)
      const lojasElements = screen.getAllByText(/^lojas$/i)
      expect(lojasElements.length).toBeGreaterThan(0)

      // Botão "Importar Planilhas" do header oculto para perfis não-ADM
      expect(screen.queryByRole('button', { name: /importar planilhas/i })).toBeNull()
    },
  )
})

describe('ProtectedRoute com Restrição de Perfil', () => {
  it('exibe tela de feedback de Acesso Exclusivo do Administrador quando perfil não é ADM e showRestrictedFeedback=true', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_gerente',
        collectionId: 'users',
        collectionName: 'users',
        email: 'gerente@celnet.com.br',
        name: 'Gerente da Loja',
        role: 'Gerente',
        lojas: ['store_1'],
        created: '2025-01-01',
        updated: '2025-01-01',
      },
      token: 'mock-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshAuth: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/importar']}>
        <Routes>
          <Route
            path="/importar"
            element={
              <ProtectedRoute requireRole="ADM" showRestrictedFeedback>
                <div>Conteúdo Secreto de Importação</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Página Inicial</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('Conteúdo Secreto de Importação')).toBeNull()
    expect(screen.getByText(/acesso exclusivo do administrador/i)).not.toBeNull()
    expect(screen.getByText(/voltar para o início/i)).not.toBeNull()
  })

  it('permite acesso ao conteúdo para perfil ADM', () => {
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

    render(
      <MemoryRouter initialEntries={['/importar']}>
        <Routes>
          <Route
            path="/importar"
            element={
              <ProtectedRoute requireRole="ADM" showRestrictedFeedback>
                <div>Conteúdo Liberado de Importação</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Conteúdo Liberado de Importação')).not.toBeNull()
  })
})
