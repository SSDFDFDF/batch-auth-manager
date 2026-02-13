import { defineStore } from 'pinia'

const STORAGE_KEY = 'quota-cache'
const STORAGE_VERSION = 2

const QUOTA_KEY_PREFIX = 'quota:'
const FILE_KEY_PREFIX = `${QUOTA_KEY_PREFIX}file:`
const PROVIDER_KEY_PREFIX = `${QUOTA_KEY_PREFIX}provider:`

const SUCCESS_TTL_MS = 5 * 60 * 1000
const ERROR_TTL_MS = 60 * 1000

export const quotaKey = {
  file: (name: string) => `${FILE_KEY_PREFIX}${name}`,
  provider: (type: string, id: string) => `${PROVIDER_KEY_PREFIX}${type}:${id}`,
  isFileKey: (key: string) => key.startsWith(FILE_KEY_PREFIX),
  isNamespaced: (key: string) => key.startsWith(QUOTA_KEY_PREFIX)
}

interface QuotaEntry {
  status: 'idle' | 'loading' | 'success' | 'error'
  type: string | null
  data: any
  error: string | null
  errorStatus: number | null
  updatedAt: number | null
}

interface QuotaState {
  quotaData: Record<string, QuotaEntry>
  loadingFiles: Set<string>
}

function normalizeKey(key: string): string {
  if (quotaKey.isNamespaced(key)) return key
  return quotaKey.file(key)
}

function isNewerEntry(a?: QuotaEntry, b?: QuotaEntry): boolean {
  const aTime = a?.updatedAt ?? 0
  const bTime = b?.updatedAt ?? 0
  return aTime >= bTime
}

// Load from localStorage
function loadFromStorage(): Record<string, QuotaEntry> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}

    const parsed = JSON.parse(stored)
    const raw = parsed.version === STORAGE_VERSION
      ? (parsed.data || {})
      : (parsed.version === 1 ? (parsed.data || {}) : {})
    if (!raw || Object.keys(raw).length === 0) return {}
    const normalized: Record<string, QuotaEntry> = {}

    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = normalizeKey(key)
      const existing = normalized[normalizedKey]
      normalized[normalizedKey] = existing && isNewerEntry(existing, value as QuotaEntry) ? existing : (value as QuotaEntry)
    }

    return normalized
  } catch (error) {
    console.warn('Failed to load quota cache from localStorage:', error)
    return {}
  }
}

// Save to localStorage
function saveToStorage(data: Record<string, QuotaEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      data,
      savedAt: Date.now()
    }))
  } catch (error) {
    console.warn('Failed to save quota cache to localStorage:', error)
  }
}

export const useQuotaStore = defineStore('quota', {
  state: (): QuotaState => ({
    quotaData: loadFromStorage(),
    loadingFiles: new Set()
  }),

  getters: {
    getQuotaStatus: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      return state.quotaData[normalizedKey] || null
    },

    isLoading: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      return state.loadingFiles.has(normalizedKey)
    },

    isAnyLoading: (state) => {
      return state.loadingFiles.size > 0
    },

    isExpired: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      const quota = state.quotaData[normalizedKey]
      if (!quota || !quota.updatedAt) return true

      const ttl = quota.status === 'error' ? ERROR_TTL_MS : SUCCESS_TTL_MS
      return Date.now() - quota.updatedAt > ttl
    },

    getUpdatedAt: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      return state.quotaData[normalizedKey]?.updatedAt ?? null
    },

    getExpiresAt: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      const quota = state.quotaData[normalizedKey]
      if (!quota || !quota.updatedAt) return null
      const ttl = quota.status === 'error' ? ERROR_TTL_MS : SUCCESS_TTL_MS
      return quota.updatedAt + ttl
    },

    getQuotaSummary: (state) => (key: string) => {
      const normalizedKey = normalizeKey(key)
      const quota = state.quotaData[normalizedKey]
      if (!quota || quota.status !== 'success') return null

      const { type, data } = quota

      if (type === 'antigravity') {
        if (!data.groups || data.groups.length === 0) return null
        const minGroup = data.groups.reduce((min: any, group: any) =>
          group.percent < min.percent ? group : min
        )
        return {
          name: minGroup.name,
          percent: minGroup.percent,
          color: minGroup.percent >= 50 ? 'success' :
                 minGroup.percent >= 20 ? 'warning' : 'destructive'
        }
      }

      if (type === 'gemini-cli') {
        if (!data.buckets || data.buckets.length === 0) return null
        const minBucket = data.buckets.reduce((min: any, bucket: any) =>
          bucket.percent < min.percent ? bucket : min
        )
        return {
          name: minBucket.modelId,
          percent: minBucket.percent,
          color: minBucket.percent >= 50 ? 'success' :
                 minBucket.percent >= 20 ? 'warning' : 'destructive'
        }
      }

      if (type === 'codex') {
        if (!data.limits || data.limits.length === 0) return null
        const validLimits = data.limits.filter((l: any) => l.percent !== null)
        if (validLimits.length === 0) return null
        const minLimit = validLimits.reduce((min: any, limit: any) =>
          limit.percent < min.percent ? limit : min
        )
        return {
          name: minLimit.model,
          percent: minLimit.percent,
          color: minLimit.percent >= 50 ? 'success' :
                 minLimit.percent >= 20 ? 'warning' : 'destructive'
        }
      }

      return null
    }
  },

  actions: {
    setQuota(key: string, type: string, data: any) {
      const normalizedKey = normalizeKey(key)
      this.quotaData[normalizedKey] = {
        status: 'success',
        type,
        data,
        error: null,
        errorStatus: null,
        updatedAt: Date.now()
      }
      this.loadingFiles.delete(normalizedKey)
      saveToStorage(this.quotaData)
    },

    setQuotaError(key: string, error: string, errorStatus?: number) {
      const normalizedKey = normalizeKey(key)
      this.quotaData[normalizedKey] = {
        status: 'error',
        type: null,
        data: null,
        error,
        errorStatus: errorStatus ?? null,
        updatedAt: Date.now()
      }
      this.loadingFiles.delete(normalizedKey)
      saveToStorage(this.quotaData)
    },

    setLoading(key: string, loading: boolean) {
      const normalizedKey = normalizeKey(key)
      if (loading) {
        this.loadingFiles.add(normalizedKey)
        if (!this.quotaData[normalizedKey]) {
          this.quotaData[normalizedKey] = {
            status: 'loading',
            type: null,
            data: null,
            error: null,
            errorStatus: null,
            updatedAt: null
          }
        }
      } else {
        this.loadingFiles.delete(normalizedKey)
      }
    },

    pruneStaleEntries(currentFileNames: string[]) {
      const nameSet = new Set(currentFileNames.map(name => quotaKey.file(name)))
      for (const key of Object.keys(this.quotaData)) {
        if (quotaKey.isFileKey(key) && !nameSet.has(key)) {
          delete this.quotaData[key]
          this.loadingFiles.delete(key)
        }
      }
      saveToStorage(this.quotaData)
    },

    clearQuota(key: string) {
      const normalizedKey = normalizeKey(key)
      delete this.quotaData[normalizedKey]
      this.loadingFiles.delete(normalizedKey)
      saveToStorage(this.quotaData)
    },

    clearAll() {
      this.quotaData = {}
      this.loadingFiles.clear()
      saveToStorage(this.quotaData)
    }
  }
})
