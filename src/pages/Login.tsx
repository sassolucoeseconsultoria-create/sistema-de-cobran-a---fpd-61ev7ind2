import React, { useState, useEffect } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Lock,
  Mail,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AUTH_REDIRECT_KEY, SESSION_EXPIRED_BANNER_KEY } from '@/lib/pocketbase/client'

export const Login: React.FC = () => {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('mind3adm@gmail.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null)

  useEffect(() => {
    try {
      const notice = window.sessionStorage.getItem(SESSION_EXPIRED_BANNER_KEY)
      if (notice) {
        setSessionExpiredNotice(notice)
        window.sessionStorage.removeItem(SESSION_EXPIRED_BANNER_KEY)
      }
    } catch {
      // ignore
    }
  }, [])

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Por favor, informe seu e-mail corporativo.')
      return
    }

    if (!password) {
      setError('Por favor, informe sua senha.')
      return
    }

    setLoading(true)
    try {
      await login(email, password)

      let targetDestination = '/'
      try {
        const storedRedirect = window.sessionStorage.getItem(AUTH_REDIRECT_KEY)
        if (storedRedirect) {
          targetDestination = storedRedirect
          window.sessionStorage.removeItem(AUTH_REDIRECT_KEY)
        } else if (
          location.state &&
          typeof location.state === 'object' &&
          'from' in location.state &&
          location.state.from
        ) {
          const fromState = location.state.from as { pathname?: string; search?: string }
          if (fromState.pathname) {
            targetDestination = fromState.pathname + (fromState.search || '')
          }
        }
      } catch {
        targetDestination = '/'
      }

      navigate(targetDestination, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('400') || msg.includes('Failed to authenticate')) {
        setError('E-mail ou senha incorretos. Verifique suas credenciais.')
      } else {
        setError('Erro ao autenticar. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0B1E33] via-[#12365A] to-[#0A223B] p-4 sm:p-6 text-white relative overflow-hidden">
      {/* Background ambient decoration */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#0E9F8A]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#2563EB]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="bg-white text-[#12233A] rounded-2xl shadow-2xl border border-[#E3E9F2]/80 p-8 sm:p-10 backdrop-blur-sm">
          {/* Header Brand */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#12365A] text-white flex items-center justify-center shadow-lg shadow-[#12365A]/25 mb-4 border border-[#1e456f]">
              <span className="font-bold text-2xl text-[#0E9F8A]">C</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#12233A]">CELNET · FPD</h1>
            <p className="text-sm text-[#5B6B82] mt-1">Painel de Consolidado de Acompanhamento</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {sessionExpiredNotice && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{sessionExpiredNotice}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2">
                <span className="shrink-0 text-sm">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-semibold text-[#12233A] uppercase tracking-wider"
              >
                E-mail corporativo
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8A97AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@celnet.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A] focus:ring-[#0E9F8A]/30 text-sm text-[#12233A]"
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold text-[#12233A] uppercase tracking-wider"
              >
                Senha
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8A97AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-[#F8FAFC] border-[#E3E9F2] focus:border-[#0E9F8A] focus:ring-[#0E9F8A]/30 text-sm text-[#12233A]"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A97AC] hover:text-[#12233A] p-1 transition-colors"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#12365A] hover:bg-[#0E2A47] text-white font-semibold text-sm rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-[#E3E9F2] text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#5B6B82]">
              <ShieldCheck className="w-4 h-4 text-[#0E9F8A]" />
              <span>Acesso restrito à equipe CELNET.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
