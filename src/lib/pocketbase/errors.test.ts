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
      email: 'Este e-mail já está sendo utilizado por outro usuário.',
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
      email: 'Este e-mail já está sendo utilizado por outro usuário.',
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
    expect(result.email).toBe('Este e-mail já está sendo utilizado por outro usuário.')
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
    expect(result.role).toBe('Perfil inválido')
  })

  it('handles real PocketBase 400 error structure with nested password and email errors', () => {
    const pbError = {
      data: {
        password: {
          code: 'validation_length_out_of_range',
          message: 'The length must be between 8 and 72.',
        },
        passwordConfirm: {
          code: 'validation_values_mismatch',
          message: 'Values must match.',
        },
        email: {
          code: 'validation_invalid_email',
          message: 'Invalid email format.',
        },
      },
      message: 'Failed to create record.',
      status: 400,
    }

    const result = extractFieldErrors(pbError)
    expect(result.password).toBe('A senha deve ter no mínimo 8 caracteres.')
    expect(result.passwordConfirm).toBe('As senhas digitadas não coincidem.')
    expect(result.email).toBe('Formato de e-mail inválido.')
  })

  it('handles validation_is_not_unique code translation', () => {
    const pbError = {
      data: {
        data: {
          custom_code: {
            code: 'validation_is_not_unique',
            message: 'Value must be unique.',
          },
        },
      },
    }

    const result = extractFieldErrors(pbError)
    expect(result.custom_code).toBe('Já existe um registro com este valor.')
  })

  it('extracts errors when err.data is empty object but err.response contains validation errors directly', () => {
    const error = {
      status: 400,
      data: {},
      response: {
        password: {
          code: 'validation_length_out_of_range',
          message: 'Must be at least 8 chars',
        },
        passwordConfirm: {
          code: 'validation_values_mismatch',
          message: "Values don't match",
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.password).toBe('A senha deve ter no mínimo 8 caracteres.')
    expect(result.passwordConfirm).toBe('As senhas digitadas não coincidem.')
  })

  it('extracts errors from originalError.data and cause.data fallbacks', () => {
    const errorOriginal = {
      status: 400,
      data: {},
      response: {},
      originalError: {
        data: {
          email: {
            code: 'validation_invalid_email',
            message: 'Invalid email',
          },
        },
      },
    }
    expect(extractFieldErrors(errorOriginal)).toEqual({
      email: 'Formato de e-mail inválido.',
    })

    const errorCause = {
      status: 400,
      data: {},
      cause: {
        data: {
          fone: {
            message: 'Telefone inválido',
          },
        },
      },
    }
    expect(extractFieldErrors(errorCause)).toEqual({
      fone: 'Telefone inválido',
    })
  })

  it('extracts errors when err.response is a native Response instance and validation data is lost across error properties (new fallback)', () => {
    const nativeResponse = new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
    const error = {
      name: 'ClientResponseError',
      status: 400,
      response: nativeResponse,
      data: {},
      customFieldBucket: {
        password: {
          code: 'validation_length_out_of_range',
          message: 'Password too short',
        },
        email: {
          code: 'validation_invalid_email',
          message: 'Invalid format',
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.password).toBe('A senha deve ter no mínimo 8 caracteres.')
    expect(result.email).toBe('Formato de e-mail inválido.')
  })

  it('maps validation_values_mismatch on password to passwordConfirm exclusively with correct message', () => {
    const error = {
      status: 400,
      data: {
        password: {
          code: 'validation_values_mismatch',
          message: 'Values must match.',
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.passwordConfirm).toBe('As senhas digitadas não coincidem.')
    expect(result.password).toBeUndefined()
  })

  it('maps validation_values_mismatch on passwordConfirm to passwordConfirm exclusively', () => {
    const error = {
      status: 400,
      data: {
        passwordConfirm: {
          code: 'validation_values_mismatch',
          message: 'Values must match.',
        },
      },
    }

    const result = extractFieldErrors(error)
    expect(result.passwordConfirm).toBe('As senhas digitadas não coincidem.')
    expect(result.password).toBeUndefined()
  })

  it('returns empty object for null or non-object errors', () => {
    expect(extractFieldErrors(null)).toEqual({})
    expect(extractFieldErrors(undefined)).toEqual({})
    expect(extractFieldErrors('simple string error')).toEqual({})
  })
})

describe('getErrorMessage', () => {
  it('returns combined field error messages when available without duplicates', () => {
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

  it('returns friendly message instead of generic PocketBase message when field errors are empty', () => {
    const error = {
      status: 400,
      message: 'Failed to create record.',
      data: {},
    }

    expect(getErrorMessage(error)).toBe('Erro de validação. Verifique os campos e tente novamente.')
  })

  it('falls back to custom error message when no field errors exist', () => {
    const error = new Error('Falha de conexão')
    expect(getErrorMessage(error)).toBe('Falha de conexão')
  })

  it('does not repeat redundant messages like Campo inválido. Failed to create record.', () => {
    const error = {
      status: 400,
      message: 'Failed to create record.',
      data: {
        passwordConfirm: {
          code: 'validation_values_mismatch',
          message: 'Values must match.',
        },
      },
    }

    const msg = getErrorMessage(error)
    expect(msg).toBe('As senhas digitadas não coincidem.')
    expect(msg).not.toContain('Failed to create record')
    expect(msg).not.toContain('Campo inválido')
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
