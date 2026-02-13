import { request } from '../lib/request'

export type ProviderType = 'gemini' | 'claude' | 'codex' | 'vertex' | 'openai'

export interface ProviderConfig {
  name?: string
  type?: ProviderType
  apiKey: string
  enabled?: boolean
  priority?: number
  excludedModels?: string[]
  prefix?: string
  baseUrl?: string
  proxyUrl?: string
  headers?: Record<string, string>
  models?: string[]
  metadata?: Record<string, any>
}

interface ProviderEndpoint {
  path: string
  responseKey: string
  deleteParam: string
}

const PROVIDER_ENDPOINTS: Record<ProviderType, ProviderEndpoint> = {
  gemini:  { path: '/v0/management/gemini-api-key',       responseKey: 'gemini-api-key',      deleteParam: 'api-key' },
  claude:  { path: '/v0/management/claude-api-key',       responseKey: 'claude-api-key',      deleteParam: 'api-key' },
  codex:   { path: '/v0/management/codex-api-key',        responseKey: 'codex-api-key',       deleteParam: 'api-key' },
  vertex:  { path: '/v0/management/vertex-api-key',       responseKey: 'vertex-api-key',      deleteParam: 'api-key' },
  openai:  { path: '/v0/management/openai-compatibility', responseKey: 'openai-compatibility', deleteParam: 'name' },
}

function normalizeProviderConfig(item: any, type?: ProviderType): ProviderConfig | null {
  if (!item) return null

  const apiKey = item['api-key'] ?? item.apiKey ?? (typeof item === 'string' ? item : '')
  const trimmed = String(apiKey || '').trim()
  const hasApiKey = !!trimmed
  const nameValue = item?.name ? String(item.name).trim() : ''
  const hasName = !!nameValue

  if (!hasApiKey && !(type === 'openai' && hasName)) return null

  const config: ProviderConfig = { apiKey: hasApiKey ? trimmed : '' }

  const prefix = item.prefix
  if (prefix) config.prefix = String(prefix).trim()

  const baseUrl = item['base-url'] ?? item.baseUrl
  if (baseUrl) config.baseUrl = String(baseUrl)

  const proxyUrl = item['proxy-url'] ?? item.proxyUrl
  if (proxyUrl) config.proxyUrl = String(proxyUrl)

  const headers = item.headers
  if (headers && typeof headers === 'object' && Object.keys(headers).length > 0) {
    config.headers = headers
  }

  const models = item.models
  if (Array.isArray(models) && models.length > 0) {
    config.models = models
  }

  const excludedModels = item['excluded-models'] ?? item.excludedModels ?? item['excluded_models'] ?? item.excluded_models
  if (Array.isArray(excludedModels) && excludedModels.length > 0) {
    config.excludedModels = excludedModels
  }

  if (hasName) config.name = nameValue
  if (item.priority !== undefined) config.priority = Number(item.priority)

  return config
}

function serializeProviderConfig(config: ProviderConfig): Record<string, any> {
  const payload: Record<string, any> = { 'api-key': config.apiKey }

  if (config.prefix?.trim()) payload.prefix = config.prefix.trim()
  if (config.baseUrl) payload['base-url'] = config.baseUrl
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl
  if (config.headers && Object.keys(config.headers).length > 0) payload.headers = config.headers
  if (config.models && config.models.length > 0) payload.models = config.models
  if (config.excludedModels && config.excludedModels.length > 0) payload['excluded-models'] = config.excludedModels
  if (config.name) payload.name = config.name
  if (config.priority !== undefined) payload.priority = config.priority

  return payload
}

export const providersApi = {
  async getProviders(type: ProviderType): Promise<ProviderConfig[]> {
    const endpoint = PROVIDER_ENDPOINTS[type]
    try {
      const data = await request.get<any>(endpoint.path)
      const list = data?.[endpoint.responseKey] || data?.items || data || []
      return Array.isArray(list)
        ? list.map((item: any) => normalizeProviderConfig(item, type)).filter(Boolean) as ProviderConfig[]
        : []
    } catch (error) {
      console.warn(`Failed to load ${type} providers:`, error)
      return []
    }
  },

  saveProviders(type: ProviderType, configs: ProviderConfig[]): Promise<void> {
    const endpoint = PROVIDER_ENDPOINTS[type]
    return request.put(endpoint.path, configs.map(serializeProviderConfig))
  },

  deleteProvider(type: ProviderType, identifier: string): Promise<void> {
    const endpoint = PROVIDER_ENDPOINTS[type]
    return request.delete(`${endpoint.path}?${endpoint.deleteParam}=${encodeURIComponent(identifier)}`)
  },

  async toggleProvider(type: ProviderType, apiKey: string, enabled: boolean): Promise<void> {
    const configs = await this.getProviders(type)
    const index = configs.findIndex(c => c.apiKey === apiKey)
    if (index === -1) throw new Error('Provider not found')

    const config = configs[index]
    const excludedModels = config.excludedModels || []
    const disableAllRule = '*'

    if (enabled) {
      config.excludedModels = excludedModels.filter(m => m !== disableAllRule)
    } else {
      if (!excludedModels.includes(disableAllRule)) {
        config.excludedModels = [...excludedModels, disableAllRule]
      }
    }

    await this.saveProviders(type, configs)
  }
}
