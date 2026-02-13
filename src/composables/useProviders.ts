import { ref, computed } from 'vue'
import { providersApi, type ProviderConfig, type ProviderType } from '../api/providers'
import { useConfigStore } from '../stores/config'

const PROVIDER_TYPES: ProviderType[] = ['gemini', 'claude', 'codex', 'vertex', 'openai']

export function useProviders() {
  const configStore = useConfigStore()

  const providersByType = ref<Record<ProviderType, ProviderConfig[]>>({
    gemini: [],
    claude: [],
    codex: [],
    vertex: [],
    openai: []
  })

  const loading = ref(false)
  const error = ref<string | null>(null)

  const loadAll = async () => {
    loading.value = true
    error.value = null
    try {
      const results = await Promise.all(
        PROVIDER_TYPES.map(type => configStore.fetchProviders(type).catch(() => []))
      )
      PROVIDER_TYPES.forEach((type, i) => {
        providersByType.value[type] = results[i]
      })
    } catch (err: any) {
      error.value = err.message || 'Failed to load providers'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  const loadByType = async (type: ProviderType) => {
    try {
      providersByType.value[type] = await configStore.fetchProviders(type)
    } catch (err: any) {
      error.value = err.message || `Failed to load ${type} providers`
    }
  }

  const deleteProvider = async (type: ProviderType, identifier: string) => {
    try {
      await providersApi.deleteProvider(type, identifier)
      configStore.invalidateProviders(type)
      await loadByType(type)
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to delete provider'
      return false
    }
  }

  const toggleProvider = async (type: ProviderType, apiKey: string, enabled: boolean) => {
    try {
      await providersApi.toggleProvider(type, apiKey, enabled)
      configStore.invalidateProviders(type)
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to toggle provider'
      return false
    }
  }

  // Backward-compatible computed refs
  const geminiProviders = computed(() => providersByType.value.gemini)
  const claudeProviders = computed(() => providersByType.value.claude)
  const codexProviders = computed(() => providersByType.value.codex)
  const vertexProviders = computed(() => providersByType.value.vertex)
  const openaiProviders = computed(() => providersByType.value.openai)

  return {
    providersByType,
    geminiProviders,
    claudeProviders,
    codexProviders,
    vertexProviders,
    openaiProviders,
    loading,
    error,
    loadAll,
    loadByType,
    deleteProvider,
    toggleProvider
  }
}
