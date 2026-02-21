import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usageApi, type StatisticsSnapshot } from '../api/usage'
import { collectUsageDetails, type UsageDetail } from '../utils/availability'

const CACHE_TTL = 30_000
const POLL_INTERVAL = 60_000
const MAX_RETRY_BACKOFF = 30_000
const STORAGE_KEY = 'usage-cache'
const STORAGE_VERSION = 1

type StoredUsage = {
  version: number
  usage: StatisticsSnapshot | null
  lastFetched: number
}

function loadFromStorage(): { usage: StatisticsSnapshot | null; lastFetched: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { usage: null, lastFetched: 0 }
    const parsed = JSON.parse(raw) as StoredUsage
    if (!parsed || parsed.version !== STORAGE_VERSION) return { usage: null, lastFetched: 0 }
    if (!parsed.usage || typeof parsed.lastFetched !== 'number') {
      return { usage: null, lastFetched: 0 }
    }
    return { usage: parsed.usage, lastFetched: parsed.lastFetched }
  } catch (error) {
    console.warn('Failed to load usage cache from localStorage:', error)
    return { usage: null, lastFetched: 0 }
  }
}

function saveToStorage(usage: StatisticsSnapshot | null, lastFetched: number) {
  try {
    if (!usage) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const payload: StoredUsage = { version: STORAGE_VERSION, usage, lastFetched }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to save usage cache to localStorage:', error)
  }
}

export const useUsageStore = defineStore('usage', () => {
  const stored = loadFromStorage()
  const loading = ref(false)
  const usageData = ref<StatisticsSnapshot | null>(stored.usage)
  const lastFetched = ref<number>(stored.lastFetched)
  const fetchError = ref<string | null>(null)
  let isFetching = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollingRefCount = 0
  let consecutiveFailures = 0

  const usageDetails = computed<UsageDetail[]>(() => {
    if (!usageData.value) return []
    return collectUsageDetails(usageData.value)
  })

  const fetchUsage = async (force = false) => {
    if (isFetching) return
    if (!force && usageData.value && Date.now() - lastFetched.value < CACHE_TTL) return

    isFetching = true
    loading.value = true
    fetchError.value = null
    try {
      const response = await usageApi.getUsage()
      usageData.value = response.usage
      lastFetched.value = Date.now()
      saveToStorage(usageData.value, lastFetched.value)
      consecutiveFailures = 0
    } catch (error: any) {
      consecutiveFailures++
      fetchError.value = error.message || 'Failed to fetch usage data'
      console.error('Failed to fetch usage data:', error)
    } finally {
      loading.value = false
      isFetching = false
    }
  }

  const startPolling = () => {
    pollingRefCount++
    if (pollTimer) return // already running
    pollTimer = setInterval(() => {
      // Exponential backoff on consecutive failures
      if (consecutiveFailures > 0) {
        const backoff = Math.min(MAX_RETRY_BACKOFF, POLL_INTERVAL * Math.pow(2, consecutiveFailures - 1))
        const elapsed = Date.now() - lastFetched.value
        if (elapsed < backoff) return
      }
      fetchUsage()
    }, POLL_INTERVAL)
  }

  const stopPolling = () => {
    pollingRefCount = Math.max(0, pollingRefCount - 1)
    if (pollingRefCount === 0 && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const clearData = () => {
    pollingRefCount = 0
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    usageData.value = null
    lastFetched.value = 0
    loading.value = false
    fetchError.value = null
    isFetching = false
    consecutiveFailures = 0
    saveToStorage(null, 0)
  }

  const globalStats = computed(() => {
    if (!usageData.value) return null
    return {
      totalRequests: usageData.value.total_requests,
      successCount: usageData.value.success_count,
      failureCount: usageData.value.failure_count,
      totalTokens: usageData.value.total_tokens,
      successRate: usageData.value.total_requests > 0
        ? (usageData.value.success_count / usageData.value.total_requests * 100).toFixed(2)
        : '0.00'
    }
  })

  // Data for charts
  const requestsByDayChartData = computed(() => {
    if (!usageData.value?.requests_by_day) return { dates: [], values: [] }

    // Sort dates
    const sortedEntries = Object.entries(usageData.value.requests_by_day)
      .sort(([a], [b]) => a.localeCompare(b))

    return {
      dates: sortedEntries.map(([date]) => date),
      values: sortedEntries.map(([, count]) => count)
    }
  })

  const tokensByDayChartData = computed(() => {
    if (!usageData.value?.tokens_by_day) return { dates: [], values: [] }

    const sortedEntries = Object.entries(usageData.value.tokens_by_day)
      .sort(([a], [b]) => a.localeCompare(b))

    return {
      dates: sortedEntries.map(([date]) => date),
      values: sortedEntries.map(([, count]) => count)
    }
  })

  return {
    loading,
    usageData,
    usageDetails,
    lastFetched,
    fetchError,
    fetchUsage,
    startPolling,
    stopPolling,
    clearData,
    globalStats,
    requestsByDayChartData,
    tokensByDayChartData
  }
})
