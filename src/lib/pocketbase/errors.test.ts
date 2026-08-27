import { describe, it, expect } from 'vitest'
import { extractFieldErrors, getErrorMessage } from './errors'
import { ClientResponseError } from 'pocketbase'
import { formatPhoneNumber } from '@/pages/Admin'

describe('extractFieldErrors', () => {
  it('extracts standard PocketBase ClientResponseError data with message', () => {
    const error = new ClientResponseError({
      status: 400,
      response: {
        message: 'Failed to create record.',
        data: {
          email: {
            code: 'validation_not_unique',
            message: 'Email must be unique.',
          },
        },
      },
    })

    const result = extractFieldErrors(error)
    expect(result).toEqual({
      email: 'Email must be unique.',
    })
  })

  it('maps username error to email if email does not have an error', () => {
    const error = {
      response: {
        data: {
          username: {
            code: 'validation_not_unique',
            message: 'Username must be unique.',
          },
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result).toEqual({
      email: 'Username must be unique.',
    })
  })

  it('preserves existing email error if both email and username exist', () => {
    const error = {
      response: {
        data: {
          email: {
            message: 'Email must be unique.',
          },
          username: {
            message: 'Username must be unique.',
          },
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.email).toBe('Email must be unique.')
  })

  it('extracts errors from nested structures or plain string/array values', () => {
    const error = {
      data: {
        fone: { message: 'Formato inválido' },
        name: 'O nome é obrigatório',
        nested: {
          data: {
            role: { message: 'Perfil inválido' },
          },
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.fone).toBe('Formato inválido')
    expect(result.name).toBe('O nome é obrigatório')
    expect(result.nested).toBe('Perfil inválido')
  })

  it('returns empty object for null or non-object errors', () => {
    expect(extractFieldErrors(null)).toEqual({})
    expect(extractFieldErrors(undefined)).toEqual({})
    expect(extractFieldErrors('simple string error')).toEqual({})
  })
})

describe('getErrorMessage', () => {
  it('returns combined field error messages when available', () => {
    const error = {
      response: {
        data: {
          email: { message: 'E-mail inválido.' },
          name: { message: 'Nome obrigatório.' },
        },
      },
    }

    const msg = getErrorMessage(error)
    expect(msg).toContain('E-mail inválido.')
    expect(msg).toContain('Nome obrigatório.')
  })

  it('falls back to generic error message when no field errors exist', () => {
    const error = new Error('Falha de conexão')
    expect(getErrorMessage(error)).toBe('Falha de conexão')
  })
})

describe('formatPhoneNumber', () => {
  it('formats landline numbers correctly', () => {
    expect(formatPhoneNumber('6133445566')).toBe('(61) 3344-5566')
  })

  it('formats cell phone numbers with 9 digits correctly', () => {
    expect(formatPhoneNumber('61987654321')).toBe('(61) 98765-4321')
  })

  it('handles partial input during typing', () => {
    expect(formatPhoneNumber('61')).toBe('(61')
    expect(formatPhoneNumber('619')).toBe('(61) 9')
    expect(formatPhoneNumber('619876')).toBe('(61) 9876')
    expect(formatPhoneNumber('6198765')).toBe('(61) 9876-5')
  })

  it('limits to 11 digits and removes non-digit characters', () => {
    expect(formatPhoneNumber('(61) 98765-4321 extra chars 999')).toBe('(61) 98765-4321')
    expect(formatPhoneNumber('')).toBe('')
  })
})
