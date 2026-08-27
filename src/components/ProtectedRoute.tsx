import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export const ProtectedRoute: React.FC<{
  children: React.ReactNode
  requireRole?: 'ADM' | 'GESTOR' | 'ANALISTA'
}> = ({ children, requireRole }) => {
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
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
