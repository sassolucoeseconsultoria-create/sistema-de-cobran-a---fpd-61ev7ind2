import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

import type { UserRole } from '@/contexts/AuthContext'

export const ProtectedRoute: React.FC<{
  children: React.ReactNode
  requireRole?: UserRole
  showRestrictedFeedback?: boolean
}> = ({ children, requireRole, showRestrictedFeedback = false }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F6FA]">
        <div className="flex flex-col items-center gap-3 text-[#12365A]">
          <Loader2 className="w-8 h-8 animate-spin text-[#0E9F8A]" />
          <p className="text-sm font-medium text-[#5B6B82]">Carregando painel CELNET...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireRole && user.role !== requireRole) {
    if (showRestrictedFeedback) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E9F2] shadow-sm p-6 sm:p-8 max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-200/60 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-[#12365A]">
                Acesso Exclusivo do Administrador
              </h2>
              <p className="text-xs sm:text-sm text-[#5B6B82] leading-relaxed">
                Esta seção é restrita ao perfil <strong>ADM</strong>. Seu perfil atual (
                <span className="font-semibold text-[#0E9F8A]">{user.role || 'Usuário'}</span>) não
                possui permissão para acessar esta funcionalidade.
              </p>
            </div>
            <div className="pt-2">
              <Link to="/">
                <Button className="bg-[#12365A] hover:bg-[#0E2A47] text-white text-xs sm:text-sm h-9 px-4 gap-2 shadow-sm w-full sm:w-auto">
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar para o Início</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
