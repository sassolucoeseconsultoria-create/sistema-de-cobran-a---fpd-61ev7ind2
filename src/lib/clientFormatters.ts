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
