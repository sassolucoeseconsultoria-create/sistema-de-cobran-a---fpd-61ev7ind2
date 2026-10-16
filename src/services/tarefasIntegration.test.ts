import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  TAREFAS_BASE_URL,
  SESSION_USER_PASSWORD_KEY,
  storeSessionPassword,
  clearSessionPassword,
  getSessionPassword,
  buildTarefasUrl,
} from './tarefasIntegration'

describe('tarefasIntegration', () => {
  const originalSessionStorage = window.sessionStorage

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterAll(() => {
    window.sessionStorage.clear()
  })

  it('stores and retrieves session password', () => {
    expect(getSessionPassword()).toBeNull()
    storeSessionPassword('Secret123!')
    expect(getSessionPassword()).toBe('Secret123!')
  })

  it('clears session password', () => {
    storeSessionPassword('Secret123!')
    expect(getSessionPassword()).toBe('Secret123!')
    clearSessionPassword()
    expect(getSessionPassword()).toBeNull()
  })

  it('builds URL with email and password when both are present', () => {
    const url = buildTarefasUrl('admin@celnet.com.br', 'MinhaSenha@123')
    expect(url).toContain(TAREFAS_BASE_URL)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('email')).toBe('admin@celnet.com.br')
    expect(parsed.searchParams.get('senha')).toBe('MinhaSenha@123')
  })

  it('falls back to simple URL when password is empty or null', () => {
    const urlWithoutPass = buildTarefasUrl('admin@celnet.com.br', null)
    expect(urlWithoutPass).toBe(TAREFAS_BASE_URL)

    const urlEmptyPass = buildTarefasUrl('admin@celnet.com.br', '')
    expect(urlEmptyPass).toBe(TAREFAS_BASE_URL)
  })

  it('falls back to simple URL when email is empty or null', () => {
    const urlWithoutEmail = buildTarefasUrl(null, 'MinhaSenha@123')
    expect(urlWithoutEmail).toBe(TAREFAS_BASE_URL)

    const urlEmptyEmail = buildTarefasUrl('', 'MinhaSenha@123')
    expect(urlEmptyEmail).toBe(TAREFAS_BASE_URL)
  })

  it('encodes special characters in credentials properly in URL', () => {
    const url = buildTarefasUrl('user+test@celnet.com.br', 'P@ss w&rd=100%')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('email')).toBe('user+test@celnet.com.br')
    expect(parsed.searchParams.get('senha')).toBe('P@ss w&rd=100%')
  })

  it('handles passwords with complex special characters (@, &, %, +, ?, =, spaces, accents)', () => {
    const specialPass = 'Senh@Teste&123%+?= áéíóú'
    const email = 'andrecassiocelnet@gmail.com'
    const url = buildTarefasUrl(email, specialPass)

    // A URL deve conter a base correta
    expect(url.startsWith(TAREFAS_BASE_URL)).toBe(true)

    // Verifica que caracteres como &, +, % estão explicitamente codificados na query string
    expect(url).toContain('email=andrecassiocelnet%40gmail.com')
    expect(url).toContain('senha=Senh%40Teste%26123%25%2B%3F%3D%20%C3%A1%C3%A9%C3%AD%C3%B3%C3%BA')

    // Ao recuperar via URLSearchParams (como a aplicação de destino faz), os valores devem ser exatos
    const parsed = new URL(url)
    expect(parsed.searchParams.get('email')).toBe(email)
    expect(parsed.searchParams.get('senha')).toBe(specialPass)
  })

  it('preserves leading and trailing spaces if present in password without trimming', () => {
    const passWithSpaces = '  senhaComEspacos123  '
    storeSessionPassword(passWithSpaces)
    expect(getSessionPassword()).toBe(passWithSpaces)

    const url = buildTarefasUrl('user@celnet.com.br', passWithSpaces)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('senha')).toBe(passWithSpaces)
  })
})
