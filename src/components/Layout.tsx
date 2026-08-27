import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Table2,
  FileSpreadsheet,
  FolderOpen,
  Store,
  Settings,
  LogOut,
  Menu,
  X,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Layout: React.FC = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    {
      to: '/',
      label: 'Consolidado',
      icon: Table2,
      description: 'Painel geral consolidado',
    },
    {
      to: '/vendedores',
      label: 'Ranking por Vendedor',
      icon: UserCheck,
      description: 'Ranking agrupado por vendedor',
    },
    {
      to: '/importar',
      label: 'Importar Arquivos',
      icon: FileSpreadsheet,
      description: 'Upload e processamento .xlsx',
    },
    {
      to: '/arquivos',
      label: 'Arquivos Importados',
      icon: FolderOpen,
      description: 'Visão analítica por arquivo bruto',
    },
    {
      to: '/lojas',
      label: 'Lojas',
      icon: Store,
      description: 'Gerenciamento de lojas',
    },
    ...(user?.role === 'ADM'
      ? [
          {
            to: '/admin',
            label: 'Administração',
            icon: Settings,
            description: 'Gestão de usuários e perfis',
          },
        ]
      : []),
  ]

  // Page titles and contextual info
  const getPageInfo = () => {
    switch (location.pathname) {
      case '/':
        return {
          title: 'Consolidado de Acompanhamento de FPD',
          subtitle: 'Acompanhamento integrado de resultados Móvel + Residencial',
        }
      case '/vendedores':
        return {
          title: 'Ranking por Vendedor',
          subtitle: 'Acompanhamento de inadimplência e status agrupado por vendedor',
        }
      case '/importar':
        return {
          title: 'Importação de Planilhas .xlsx',
          subtitle: 'Consolidação automática das abas Móvel e Residencial por loja',
        }
      case '/arquivos':
        return {
          title: 'Arquivos Importados (Visão Analítica)',
          subtitle: 'Dados brutos extraídos de cada arquivo .xlsx antes da consolidação',
        }
      case '/lojas':
        return {
          title: 'Gestão de Lojas e Estrutura',
          subtitle: 'Coordenações e supervisões operacionais',
        }
      case '/admin':
        return {
          title: 'Administração',
          subtitle: 'Gerencie os usuários e perfis do sistema',
        }
      default:
        return {
          title: 'Painel CELNET FPD',
          subtitle: 'Sistema de Acompanhamento Operacional',
        }
    }
  }

  const pageInfo = getPageInfo()

  return (
    <div className="min-h-screen flex bg-[#F3F6FA] text-[#12233A] font-sans antialiased selection:bg-[#0E9F8A]/20">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#12233A]/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-[#12365A] text-white transition-all duration-300 ease-in-out border-r border-[#1e456f]',
          // Desktop collapsible
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
          // Mobile drawer
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#1e456f]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-[#0E9F8A] flex items-center justify-center shrink-0 shadow-md shadow-[#0E9F8A]/20">
              <span className="font-bold text-white tracking-wider text-base">C</span>
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm tracking-wider text-white">CELNET</span>
                <span className="text-[10px] text-[#0E9F8A] font-semibold tracking-widest uppercase">
                  FPD Consolidação
                </span>
              </div>
            )}
          </div>
          {/* Close mobile drawer */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav list */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.to

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-[#0E2A47] text-white shadow-inner'
                    : 'text-slate-300 hover:text-white hover:bg-white/5',
                  collapsed && 'justify-center px-0',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#0E9F8A] rounded-r-full" />
                )}
                <Icon
                  className={cn(
                    'w-5 h-5 shrink-0 transition-colors',
                    isActive ? 'text-[#0E9F8A]' : 'text-slate-400 group-hover:text-white',
                  )}
                />
                {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar Collapse Toggle (Desktop) */}
        <div className="hidden lg:flex items-center justify-end px-3 py-2 border-t border-[#1e456f]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* User profile & logout */}
        <div className="p-3 border-t border-[#1e456f] bg-[#0E2A47]/60">
          <div
            className={cn(
              'flex items-center gap-3',
              collapsed && !mobileOpen ? 'justify-center' : 'justify-between',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#1e456f] border border-[#2b5889] flex items-center justify-center text-xs font-semibold text-white shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#0E9F8A]" />
              </div>
              {(!collapsed || mobileOpen) && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-white truncate">
                      {user?.name || user?.email?.split('@')[0] || 'Usuário'}
                    </p>
                    {user?.role && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#0E9F8A]/20 text-[#0E9F8A] uppercase shrink-0">
                        {user.role}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                </div>
              )}
            </div>

            {(!collapsed || mobileOpen) && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                title="Sair do sistema"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
        )}
      >
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#E3E9F2] shadow-xs flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#12233A] hover:bg-slate-100 transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#12233A] tracking-tight leading-tight">
                {pageInfo.title}
              </h1>
              <p className="hidden sm:block text-xs text-[#5B6B82]">{pageInfo.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {location.pathname !== '/importar' && (
              <Button
                onClick={() => navigate('/importar')}
                className="bg-[#0E9F8A] hover:bg-[#0c8a77] text-white shadow-sm font-medium text-xs sm:text-sm h-9 px-3 sm:px-4 gap-2"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Importar Planilhas</span>
              </Button>
            )}
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1560px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
