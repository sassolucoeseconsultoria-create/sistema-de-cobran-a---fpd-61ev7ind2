import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchConfigBotoes,
  isButtonVisibleForRole,
  type ConfigBotaoRecord,
} from '@/services/configBotoesService'

export interface UseButtonVisibilityResult {
  canShow: (botaoId: string) => boolean
  loading: boolean
  refresh: () => Promise<void>
  configs: ConfigBotaoRecord[]
}

/**
 * Hook que gerencia a visibilidade de botões para uma tela específica,
 * baseado no perfil do usuário logado e nas configurações persistidas no backend.
 *
 * @param telaId Identificador da tela (ex: 'ranking_vendedores', 'top_ofensores', 'painel_lojas', 'inadimplencia')
 */
export function useButtonVisibility(telaId: string): UseButtonVisibilityResult {
  const { user } = useAuth()
  const [configs, setConfigs] = useState<ConfigBotaoRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchConfigBotoes()
      setConfigs(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const canShow = useCallback(
    (botaoId: string): boolean => {
      return isButtonVisibleForRole(configs, telaId, botaoId, user?.role)
    },
    [configs, telaId, user?.role],
  )

  return {
    canShow,
    loading,
    refresh,
    configs,
  }
}
