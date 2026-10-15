/**
 * Format helpers for Date, Phone, CPF and currency in Clientes tables
 */

/**
 * Applies DD/MM/YYYY mask to date string input while typing
 */
export function applyDateMask(value: string): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) {
    return digits
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
}

/**
 * Formats Excel serial date number, ISO date or existing date string to DD/MM/AA (2-digit year).
 * Secure against empty, null, undefined, non-numeric or out-of-range inputs.
 * If already formatted as DD/MM/AA, preserves it.
 * If formatted as DD/MM/AAAA, converts to DD/MM/AA.
 */
export function formatExcelOrIsoDateShort(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const strVal = String(value).trim()
  if (!strVal) return ''

  // Already formatted as DD/MM/AA (e.g. 13/06/26)
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(strVal)) {
    return strVal
  }

  // Formatted as DD/MM/YYYY (e.g. 13/06/2026) -> convert to DD/MM/AA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strVal)) {
    const parts = strVal.split('/')
    return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`
  }

  // Excel serial date number (e.g. 46188, 46237)
  // Supports typical Excel date serials between 1 (Jan 1, 1900) and ~100000 (year 2173)
  const num = Number(strVal)
  if (!Number.isNaN(num) && num >= 1 && num < 100000) {
    // Excel epoch base: Dec 30, 1899 (due to Excel's 1900 leap year bug)
    // Using UTC to prevent timezone shifts
    const utcMillis = (num - 25569) * 86400000
    const targetDate = new Date(utcMillis)
    if (!Number.isNaN(targetDate.getTime())) {
      const day = String(targetDate.getUTCDate()).padStart(2, '0')
      const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
      const year = String(targetDate.getUTCFullYear()).slice(-2)
      return `${day}/${month}/${year}`
    }
  }

  // If ISO date string: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
    const parts = strVal.split('T')[0].split('-')
    if (parts.length === 3) {
      const day = parts[2].padStart(2, '0')
      const month = parts[1].padStart(2, '0')
      const year = parts[0].slice(-2)
      return `${day}/${month}/${year}`
    }
  }

  return strVal
}

/**
 * Format Excel serial number or standard ISO/date string to dd/mm/yyyy
 */
export function formatExcelOrIsoDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const strVal = String(value).trim()
  if (!strVal) return ''

  // Already formatted as DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strVal)) {
    return strVal
  }

  // If formatted as DD/MM/YY -> expand to DD/MM/20YY
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(strVal)) {
    const parts = strVal.split('/')
    return `${parts[0]}/${parts[1]}/20${parts[2]}`
  }

  // Check if it's an Excel serial date number (e.g. 46188, 46237)
  const num = Number(strVal)
  if (!Number.isNaN(num) && num >= 1 && num < 100000) {
    const utcMillis = (num - 25569) * 86400000
    const targetDate = new Date(utcMillis)
    if (!Number.isNaN(targetDate.getTime())) {
      const day = String(targetDate.getUTCDate()).padStart(2, '0')
      const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
      const year = targetDate.getUTCFullYear()
      return `${day}/${month}/${year}`
    }
  }

  // If ISO date string: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
    const parts = strVal.split('T')[0].split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
  }

  return strVal
}

/**
 * Formats a CPF string to standard 000.000.000-00
 */
export function formatCpf(value: unknown): string {
  if (!value) return ''
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  const padded = digits.padStart(11, '0').slice(-11)
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}-${padded.slice(9, 11)}`
}

/**
 * Validates whether a date string is a valid DD/MM/AAAA date
 */
export function isValidDateDDMMAAAA(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/
  const match = trimmed.match(regex)
  if (!match) return false

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false

  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

/**
 * Validação de data de referência no formato MM/AAAA.
 * Mês entre 01 e 12, ano de 4 dígitos entre 1900 e 2100.
 */
export function isValidDateMMAAAA(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed)
  if (!match) return false

  const month = parseInt(match[1], 10)
  const year = parseInt(match[2], 10)

  if (month < 1 || month > 12) return false
  if (year < 1900 || year > 2100) return false
  return true
}

/**
 * Máscara dinâmica para entrada de Mês/Ano (MM/AAAA).
 * Máximo 7 caracteres, insere barra automaticamente após o 2º dígito.
 */
export function applyMonthYearMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length <= 2) {
    return digits
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export interface ParsedReferenceDate {
  month: number
  year: number
  raw: string
}

/**
 * Faz parse da data de referência no formato novo MM/AAAA (2 partes)
 * e aceita formato legado DD/MM/AAAA (3 partes, mês=partes[1], ano=partes[2]) para robustez.
 */
export function parseReferenceDate(value: string | undefined | null): ParsedReferenceDate | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // MM/AAAA (2 partes)
  const mmYyyy = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed)
  if (mmYyyy) {
    const month = parseInt(mmYyyy[1], 10)
    const year = parseInt(mmYyyy[2], 10)
    return { month, year, raw: trimmed }
  }

  // DD/MM/AAAA (3 partes - legado)
  const ddMmYyyy = /^\d{1,2}\/(0?[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed)
  if (ddMmYyyy) {
    const month = parseInt(ddMmYyyy[1], 10)
    const year = parseInt(ddMmYyyy[2], 10)
    return { month, year, raw: trimmed }
  }

  return null
}

/**
 * Ordenação cronológica decrescente de referências (ano desc, mês desc).
 * Itens que não conseguem parse vão para o final ordenados alfabeticamente.
 */
export function sortReferenceDatesDesc<T = string>(
  dates: T[],
  extractDateString: (item: T) => string = (item) => String(item),
): T[] {
  return [...dates].sort((a, b) => {
    const parsedA = parseReferenceDate(extractDateString(a))
    const parsedB = parseReferenceDate(extractDateString(b))

    if (!parsedA && !parsedB) {
      return extractDateString(b).localeCompare(extractDateString(a))
    }
    if (!parsedA) return 1
    if (!parsedB) return -1

    if (parsedA.year !== parsedB.year) {
      return parsedB.year - parsedA.year
    }
    if (parsedA.month !== parsedB.month) {
      return parsedB.month - parsedA.month
    }
    return 0
  })
}

/**
 * Formats phone number into (XX) XXXXX-XXXX or (XX) XXXX-XXXX
 */
export function formatPhone(value: unknown): string {
  if (!value) return ''
  const digits = String(value).replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length > 11) {
    return digits
  }
  return String(value)
}

/**
 * Extract a field from record dados object case-insensitively with alias support
 */
export function getDadosField(
  dados: Record<string, unknown> | undefined,
  ...aliases: string[]
): string {
  if (!dados || typeof dados !== 'object') return ''

  const lowerKeyMap = new Map<string, unknown>()
  for (const [key, val] of Object.entries(dados)) {
    const normalizedKey = key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
    lowerKeyMap.set(normalizedKey, val)
  }

  for (const alias of aliases) {
    const normAlias = alias
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

    // 1. Direct match in original object
    if (dados[alias] !== undefined && dados[alias] !== null && String(dados[alias]).trim() !== '') {
      return String(dados[alias]).trim()
    }

    // 2. Normalized lower key match
    if (lowerKeyMap.has(normAlias)) {
      const val = lowerKeyMap.get(normAlias)
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim()
      }
    }

    // 3. Substring contains match in keys
    for (const [k, v] of lowerKeyMap.entries()) {
      if (k.includes(normAlias) || normAlias.includes(k)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim()
        }
      }
    }
  }

  return ''
}
