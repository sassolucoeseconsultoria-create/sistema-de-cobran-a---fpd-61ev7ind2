/**
 * Rate limiting, retry, and backoff utilities for PocketBase requests.
 *
 * Prevents HTTP 429 ("Too Many Requests") by:
 * 1. Limiting concurrency of parallel requests (default concurrency: 2 to 3)
 * 2. Enforcing a minimal pacing delay between consecutive requests
 * 3. Detecting HTTP 429 and retrying with exponential backoff + jitter
 * 4. Respecting 'Retry-After' response header when available
 * 5. Providing user-friendly PT-BR messaging during throttling/rate-limiting
 */

export interface RateLimitRetryOptions {
  maxRetries?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
  onThrottled?: (retryCount: number, delayMs: number) => void
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const errObj = err as {
    status?: number
    statusCode?: number
    message?: string
    response?: { status?: number; message?: string }
  }

  if (errObj.status === 429 || errObj.statusCode === 429 || errObj.response?.status === 429) {
    return true
  }

  const msg = (errObj.message || errObj.response?.message || '').toLowerCase()
  return msg.includes('too many requests') || msg.includes('rate limit')
}

/**
 * Extracts Retry-After header in milliseconds if present.
 */
export function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const errObj = err as {
    response?: {
      headers?: Record<string, string | number> | Headers
    }
  }
  const headers = errObj.response?.headers
  if (!headers) return null

  let rawValue: string | number | null = null
  if (typeof (headers as Headers).get === 'function') {
    rawValue = (headers as Headers).get('retry-after') || (headers as Headers).get('Retry-After')
  } else if (typeof headers === 'object') {
    rawValue =
      (headers as Record<string, string | number>)['retry-after'] ||
      (headers as Record<string, string | number>)['Retry-After']
  }

  if (!rawValue) return null
  const parsedSeconds = Number(rawValue)
  if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
    return Math.min(parsedSeconds * 1000, 30000)
  }
  return null
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Executes an async action with exponential backoff on HTTP 429.
 */
export async function executeWithRateLimitRetry<T>(
  action: () => Promise<T>,
  options: RateLimitRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 6
  const initialBackoffMs = options.initialBackoffMs ?? 800
  const maxBackoffMs = options.maxBackoffMs ?? 15000

  let attempt = 0
  let currentDelay = initialBackoffMs

  while (true) {
    try {
      return await action()
    } catch (err: unknown) {
      if (isRateLimitError(err) && attempt < maxRetries) {
        attempt++
        const retryAfterMs = extractRetryAfterMs(err)
        const jitter = Math.floor(Math.random() * 200)
        const waitTime = Math.min(
          retryAfterMs !== null ? retryAfterMs + jitter : currentDelay + jitter,
          maxBackoffMs,
        )

        if (options.onThrottled) {
          try {
            options.onThrottled(attempt, waitTime)
          } catch {
            // ignore callback errors
          }
        }

        console.warn(
          `[RateLimiter] HTTP 429 detectado. Tentativa ${attempt} de ${maxRetries}. Aguardando ${waitTime}ms...`,
        )
        await sleep(waitTime)
        currentDelay = Math.min(currentDelay * 2, maxBackoffMs)
      } else {
        throw err
      }
    }
  }
}

/**
 * Concurrency limiter and pacer: runs an array of items through a worker function
 * with bounded concurrency (e.g. 2 parallel workers) and a delay between operations.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number
    pacingMs?: number
    retryOptions?: RateLimitRetryOptions
    onProgress?: (completed: number, total: number) => void
  } = {},
): Promise<R[]> {
  const { concurrency = 2, pacingMs = 150, retryOptions, onProgress } = options
  const results: R[] = new Array(items.length)
  let currentIndex = 0
  let completedCount = 0

  const runWorker = async (): Promise<void> => {
    while (currentIndex < items.length) {
      const idx = currentIndex++
      const item = items[idx]

      const result = await executeWithRateLimitRetry(() => worker(item, idx), retryOptions)
      results[idx] = result
      completedCount++

      if (onProgress) {
        onProgress(completedCount, items.length)
      }

      if (pacingMs > 0 && currentIndex < items.length) {
        await sleep(pacingMs)
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, () => runWorker())
  await Promise.all(workers)

  return results
}
