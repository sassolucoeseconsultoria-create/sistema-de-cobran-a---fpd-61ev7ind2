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
    if (typeof password === 'string' && password.length > 0) {
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
  // Não fazemos trim na senha: a senha deve ser exatamente a string utilizada na autenticação.
  const rawPass = password ?? ''

  if (!cleanEmail || !rawPass) {
    return TAREFAS_BASE_URL
  }

  // Codificação explícita com encodeURIComponent para garantir que caracteres especiais
  // (@, &, %, +, ?, =, espaços, acentos, etc.) não sejam truncados ou corrompidos.
  const encodedEmail = encodeURIComponent(cleanEmail)
  const encodedPassword = encodeURIComponent(rawPass)

  return `${TAREFAS_BASE_URL}?email=${encodedEmail}&senha=${encodedPassword}`
}
