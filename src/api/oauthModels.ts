import { request } from '../lib/request'

export interface OAuthModelAliasEntry {
  name: string
  alias: string
  fork?: boolean
}

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {}

  const record = payload as Record<string, unknown>
  const source = record['oauth-excluded-models'] ?? record.items ?? payload
  if (!source || typeof source !== 'object') return {}

  const result: Record<string, string[]> = {}

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '').trim().toLowerCase()
    if (!key) return

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : []

    const seen = new Set<string>()
    const normalized: string[] = []
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim()
      if (!trimmed) return
      const modelKey = trimmed.toLowerCase()
      if (seen.has(modelKey)) return
      seen.add(modelKey)
      normalized.push(trimmed)
    })

    result[key] = normalized
  })

  return result
}

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {}

  const record = payload as Record<string, unknown>
  const source = record['oauth-model-alias'] ?? record.items ?? payload
  if (!source || typeof source !== 'object') return {}

  const result: Record<string, OAuthModelAliasEntry[]> = {}

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '').trim().toLowerCase()
    if (!key) return
    if (!Array.isArray(mappings)) return

    const seen = new Set<string>()
    const normalized = (mappings as Record<string, unknown>[])
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const entry = item as Record<string, unknown>
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim()
        const alias = String(entry.alias ?? '').trim()
        if (!name || !alias) return null
        const fork = entry.fork === true
        return fork ? { name, alias, fork } : { name, alias }
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      }) as OAuthModelAliasEntry[]

    if (normalized.length) {
      result[key] = normalized
    }
  })

  return result
}

export const oauthModelsApi = {
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await request.get('/v0/management/oauth-excluded-models')
    return normalizeOauthExcludedModels(data)
  },

  saveOauthExcludedModels(provider: string, models: string[]): Promise<void> {
    return request.patch('/v0/management/oauth-excluded-models', { provider, models })
  },

  deleteOauthExcludedEntry(provider: string): Promise<void> {
    return request.delete(`/v0/management/oauth-excluded-models?provider=${encodeURIComponent(provider)}`)
  },

  replaceOauthExcludedModels(map: Record<string, string[]>): Promise<void> {
    return request.put('/v0/management/oauth-excluded-models', normalizeOauthExcludedModels(map))
  },

  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await request.get('/v0/management/oauth-model-alias')
    return normalizeOauthModelAlias(data)
  },

  async saveOauthModelAlias(channel: string, aliases: OAuthModelAliasEntry[]): Promise<void> {
    const normalizedChannel = String(channel ?? '').trim().toLowerCase()
    const normalizedAliases = normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? []
    await request.patch('/v0/management/oauth-model-alias', {
      channel: normalizedChannel,
      aliases: normalizedAliases
    })
  },

  async deleteOauthModelAlias(channel: string): Promise<void> {
    const normalizedChannel = String(channel ?? '').trim().toLowerCase()
    try {
      await request.patch('/v0/management/oauth-model-alias', {
        channel: normalizedChannel,
        aliases: []
      })
    } catch (error) {
      await request.delete(`/v0/management/oauth-model-alias?channel=${encodeURIComponent(normalizedChannel)}`)
    }
  }
}
