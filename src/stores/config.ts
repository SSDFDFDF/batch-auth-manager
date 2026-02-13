import { defineStore } from 'pinia'
import { providersApi } from '../api/providers'
import type { ProviderConfig, ProviderType } from '../api/providers'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface ConfigState {
  cache: Record<string, CacheEntry<ProviderConfig[]>>
}

export const useConfigStore = defineStore('config', {
  state: (): ConfigState => ({
    cache: {}
  }),

  actions: {
    async fetchProviders(type: ProviderType): Promise<ProviderConfig[]> {
      const cacheKey = `providers:${type}`
      const entry = this.cache[cacheKey]

      if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
        return entry.data
      }

      const data = await providersApi.getProviders(type)
      this.cache[cacheKey] = { data, timestamp: Date.now() }
      return data
    },

    async saveProviders(type: ProviderType, configs: ProviderConfig[]): Promise<void> {
      await providersApi.saveProviders(type, configs)
      this.cache[`providers:${type}`] = { data: configs, timestamp: Date.now() }
    },

    invalidateProviders(type?: ProviderType) {
      if (type) {
        delete this.cache[`providers:${type}`]
      } else {
        for (const key of Object.keys(this.cache)) {
          if (key.startsWith('providers:')) {
            delete this.cache[key]
          }
        }
      }
    }
  }
})
