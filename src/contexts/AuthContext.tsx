import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { RecordModel } from 'pocketbase'
import pb, { handleSessionExpired, isSessionExpiredError } from '@/lib/pocketbase/client'

export type UserRole = 'ADM' | 'Coordenador' | 'Supervisor' | 'Gerente'

export interface User extends RecordModel {
  email: string
  name?: string
  avatar?: string
  role?: UserRole
  fone?: string
  lojas?: string[]
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(pb.authStore.record as User | null)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [loading, setLoading] = useState(true)

  const refreshAuth = async () => {
    if (pb.authStore.isValid) {
      try {
        const refreshed = await pb.collection('users').authRefresh()
        setUser(refreshed.record as User | null)
      } catch (err: unknown) {
        if (isSessionExpiredError(err)) {
          handleSessionExpired('Sua sessão foi encerrada. Faça login novamente.')
          setUser(null)
          setToken(null)
        }
      }
    }
  }

  useEffect(() => {
    // Sync initial state and attempt refresh if valid to get up-to-date custom fields
    setUser(pb.authStore.record as User | null)
    setToken(pb.authStore.token)

    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .then((res) => {
          setUser(res.record as User | null)
        })
        .catch((err: unknown) => {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Sua sessão foi encerrada. Faça login novamente.')
            setUser(null)
            setToken(null)
          }
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }

    // Listen for auth state changes
    const unsub = pb.authStore.onChange((newToken, newModel) => {
      setToken(newToken)
      setUser(newModel as User | null)
    })

    return () => {
      unsub()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    await pb.collection('users').authWithPassword(email.trim(), pass)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshAuth,
    }),
    [user, token, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
