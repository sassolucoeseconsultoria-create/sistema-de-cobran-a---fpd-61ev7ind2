/**
 * Integração com o sistema de Gestão de Tarefas (projeto Skip em https://sistema-de-gestao-de-tarefas-c6670.goskip.app)
 * Permite auto login montando a URL com email e senha do usuário logado no Cobrança FPD.
 */

export const TAREFAS_BASE_URL = 'https://sistema-de-gestao-de-tarefas-c6670.goskip.app'
export const SESSION_USER_PASSWORD_KEY = 'fpd_session_user_pw'

/**
 * Armazena a senha do usuário em sessionStorage para uso durante a sessão.
 * Nunca persistir em localStorage.
 */
export function storeSessionPassword(password: string): void {
  try {
    if (password) {
      window.sessionStorage.setItem(SESSION_USER_PASSWORD_KEY, password)
    }
  } catch {
    // sessionStorage indisponível ou quota excedida
  }
}

/**
 * Recupera a senha da sessão atual se disponível.
 */
export function getSessionPassword(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_USER_PASSWORD_KEY)
  } catch {
    return null
  }
}

/**
 * Remove a senha da sessão (chamado no logout e expiração de sessão).
 */
export function clearSessionPassword(): void {
  try {
    window.sessionStorage.removeItem(SESSION_USER_PASSWORD_KEY)
  } catch {
    // ignore
  }
}

/**
 * Monta o link para o sistema de Tarefas.
 * Se email e senha estiverem disponíveis, adiciona os parâmetros de consulta ?email=...&senha=...
 * Caso contrário, retorna a URL simples de fallback (sem credenciais).
 */
export function buildTarefasUrl(email?: string | null, password?: string | null): string {
  const cleanEmail = (email || '').trim()
  const cleanPass = (password || '').trim()

  if (!cleanEmail || !cleanPass) {
    return TAREFAS_BASE_URL
  }

  try {
    const url = new URL(TAREFAS_BASE_URL)
    url.searchParams.set('email', cleanEmail)
    url.searchParams.set('senha', cleanPass)
    return url.toString()
  } catch {
    // Fallback caso a URL base falhe no construtor
    const params = new URLSearchParams()
    params.set('email', cleanEmail)
    params.set('senha', cleanPass)
    return `${TAREFAS_BASE_URL}?${params.toString()}`
  }
}
