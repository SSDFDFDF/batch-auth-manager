import { ref } from 'vue'
import { fetchQuotaByType, type QuotaResult } from '../api/quota'
import { useQuotaStore, quotaKey } from '../stores/quota'
import { supportsQuota } from '../config/constants'

const CONCURRENCY = 5
const MAX_BACKOFF_MS = 8000

export function useQuotaLoader() {
  const quotaStore = useQuotaStore()
  const loading = ref(false)
  const inFlight = new Map<string, Promise<QuotaResult>>()

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const getErrorStatus = (err: any) => err?.response?.status || err?.statusCode
  const isRateLimited = (status?: number, message?: string) => {
    if (status === 429 || status === 503 || status === 502) return true
    const lower = message ? message.toLowerCase() : ''
    return lower.includes('rate limit') || lower.includes('too many')
  }

  const getCachedSuccess = (key: string): QuotaResult | null => {
    const cached = quotaStore.getQuotaStatus(key)
    if (cached?.status === 'success' && !quotaStore.isExpired(key)) {
      return { type: cached.type ?? '', data: cached.data }
    }
    return null
  }

  async function fetchQuota(file: any, key: string, force = false): Promise<QuotaResult> {
    if (!force) {
      const cached = getCachedSuccess(key)
      if (cached) return cached

      const cachedAny = quotaStore.getQuotaStatus(key)
      if (cachedAny?.status === 'error' && !quotaStore.isExpired(key)) {
        throw new Error(cachedAny.error || '配额获取失败')
      }
    }

    const existing = inFlight.get(key)
    if (existing) return existing

    quotaStore.setLoading(key, true)
    const promise = (async () => {
      try {
        const result = await fetchQuotaByType(file)
        quotaStore.setQuota(key, result.type, result.data)
        return result
      } catch (err: any) {
        const status = getErrorStatus(err)
        quotaStore.setQuotaError(key, err.message, status)
        throw err
      } finally {
        inFlight.delete(key)
      }
    })()

    inFlight.set(key, promise)
    return promise
  }

  async function loadQuota(files: any[], options: { force?: boolean } = {}) {
    const force = !!options.force
    const targets = files.filter((f: any) => supportsQuota(f.type))
    if (targets.length === 0) return

    const tasks = targets
      .map((file: any) => {
        const key = quotaKey.file(file.name)
        if (!force) {
          const cached = quotaStore.getQuotaStatus(key)
          if (cached && !quotaStore.isExpired(key)) return null
        }
        return { file, key }
      })
      .filter(Boolean) as Array<{ file: any; key: string }>

    if (tasks.length === 0) return

    loading.value = true
    let concurrency = CONCURRENCY
    let backoffMs = 0
    let cursor = 0

    try {
      while (cursor < tasks.length) {
        const batch = tasks.slice(cursor, cursor + concurrency)
        cursor += batch.length

        const results = await Promise.all(
          batch.map(async ({ file, key }) => {
            try {
              await fetchQuota(file, key, force)
              return { ok: true }
            } catch (err: any) {
              return { ok: false, errorStatus: getErrorStatus(err), errorMessage: err.message }
            }
          })
        )

        const hitRateLimit = results.some(r => !r.ok && isRateLimited(r.errorStatus, r.errorMessage))
        if (hitRateLimit) {
          concurrency = Math.max(1, Math.floor(concurrency / 2))
          backoffMs = backoffMs > 0 ? Math.min(MAX_BACKOFF_MS, backoffMs * 2) : 1000
          await sleep(backoffMs)
        } else if (concurrency < CONCURRENCY) {
          concurrency += 1
          if (backoffMs > 0) backoffMs = Math.max(0, Math.floor(backoffMs / 2))
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function loadSingleQuota(file: any, options: { force?: boolean } = {}) {
    const key = quotaKey.file(file.name)
    return fetchQuota(file, key, !!options.force)
  }

  async function loadExpiredQuota(files: any[]) {
    const targets = files.filter((f: any) => {
      if (!supportsQuota(f.type)) return false
      const key = quotaKey.file(f.name)
      const cached = quotaStore.getQuotaStatus(key)
      return cached && quotaStore.isExpired(key)
    })

    if (targets.length === 0) return
    await loadQuota(targets, { force: false })
  }

  return { loading, loadQuota, loadSingleQuota, loadExpiredQuota }
}
