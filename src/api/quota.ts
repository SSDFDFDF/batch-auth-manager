import { request } from '../lib/request'
import { authFilesApi } from './authFiles'

interface ApiCallRequest {
  authIndex: string
  method: string
  url: string
  header?: Record<string, string>
  data?: any
}

interface ApiCallResponse {
  statusCode: number
  header: any
  bodyText: string
  body: any
}

/**
 * General API Call (via CLIProxyAPI)
 */
export const apiCallApi = {
  async request({ authIndex, method, url, header, data }: ApiCallRequest): Promise<ApiCallResponse> {
    const response: any = await request.post('/v0/management/api-call', {
      auth_index: authIndex,
      method,
      url,
      header,
      data
    })

    return {
      statusCode: response.status_code || response.statusCode || 0,
      header: response.header || response.headers || {},
      bodyText: response.body || '',
      body: parseBody(response.body)
    }
  }
}

function parseBody(body: any): any {
  if (body === null || body === undefined) return null
  if (typeof body !== 'string') return body

  const trimmed = body.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return body
  }
}

/**
 * Helper: download and parse auth file JSON
 */
async function downloadAuthFileJson(fileName: string): Promise<any> {
  try {
    const blob = await authFilesApi.download(fileName)
    const text = await blob.text()
    const trimmed = text.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn'

/**
 * Resolve Antigravity project_id from auth file content
 */
async function resolveAntigravityProjectId(fileName: string): Promise<string> {
  const parsed = await downloadAuthFileJson(fileName)
  if (!parsed || typeof parsed !== 'object') return DEFAULT_ANTIGRAVITY_PROJECT_ID

  const topLevel = parsed.project_id ?? parsed.projectId
  if (typeof topLevel === 'string' && topLevel.trim()) return topLevel.trim()

  const installed = parsed.installed
  if (installed && typeof installed === 'object') {
    const pid = installed.project_id ?? installed.projectId
    if (typeof pid === 'string' && pid.trim()) return pid.trim()
  }

  const web = parsed.web
  if (web && typeof web === 'object') {
    const pid = web.project_id ?? web.projectId
    if (typeof pid === 'string' && pid.trim()) return pid.trim()
  }

  return DEFAULT_ANTIGRAVITY_PROJECT_ID
}

/**
 * Resolve Gemini CLI project_id from auth file account field
 */
async function resolveGeminiCliProjectId(fileName: string): Promise<string | null> {
  const parsed = await downloadAuthFileJson(fileName)
  if (!parsed || typeof parsed !== 'object') return null

  const account = parsed.account
  if (typeof account !== 'string') return null

  const match = account.match(/\(([^()]+)\)/)
  return match ? match[1] : null
}

/**
 * Decode Base64URL JWT payload
 */
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = payload.length % 4
    if (padding) {
      payload = payload.padEnd(payload.length + (4 - padding), '=')
    }
    const decoded = atob(payload)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Resolve Codex chatgpt_account_id from auth file JWT id_token
 */
async function resolveCodexAccountId(fileName: string): Promise<string | null> {
  const parsed = await downloadAuthFileJson(fileName)
  if (!parsed || typeof parsed !== 'object') return null

  const idToken = parsed.id_token ?? parsed.idToken
  if (typeof idToken !== 'string') return null

  const payload = decodeJwtPayload(idToken)
  if (!payload) return null

  const accountId = payload.chatgpt_account_id ?? payload.chatgptAccountId
  return typeof accountId === 'string' ? accountId : null
}

/**
 * Antigravity Quota
 */
export const antigravityQuota = {
  URLS: [
    'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
    'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
  ],

  async fetch(file: any): Promise<any> {
    const authIndex = file.authIndex || file.auth_index
    const header = {
      'Authorization': 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/1.11.5 windows/amd64'
    }

    const projectId = await resolveAntigravityProjectId(file.name)
    const requestBody = JSON.stringify({ project: projectId })

    let lastError = null

    for (const url of this.URLS) {
      try {
        const result = await apiCallApi.request({
          authIndex,
          method: 'POST',
          url,
          header,
          data: requestBody
        })

        if (result.statusCode >= 200 && result.statusCode < 300 && result.body) {
          return this.parse(result.body)
        }

        lastError = result.bodyText || `HTTP ${result.statusCode}`
      } catch (error: any) {
        lastError = error.message
      }
    }

    throw new Error(lastError || 'Failed to fetch Antigravity quota')
  },

  parse(data: any): any {
    const groups: any[] = []

    const models = data.models || {}
    if (typeof models !== 'object' || Array.isArray(models)) {
      return { groups }
    }

    const modelGroups = [
      {
        id: 'claude-gpt',
        label: 'Claude/GPT',
        identifiers: [
          'claude-sonnet-4-5-thinking',
          'claude-opus-4-5-thinking',
          'claude-sonnet-4-5',
          'gpt-oss-120b-medium'
        ]
      },
      {
        id: 'gemini-3-pro',
        label: 'Gemini 3 Pro',
        identifiers: ['gemini-3-pro-high', 'gemini-3-pro-low']
      },
      {
        id: 'gemini-2-5-flash',
        label: 'Gemini 2.5 Flash',
        identifiers: ['gemini-2.5-flash', 'gemini-2.5-flash-thinking']
      },
      {
        id: 'gemini-2-5-flash-lite',
        label: 'Gemini 2.5 Flash Lite',
        identifiers: ['gemini-2.5-flash-lite']
      },
      {
        id: 'gemini-2-5-cu',
        label: 'Gemini 2.5 CU',
        identifiers: ['rev19-uic3-1p']
      },
      {
        id: 'gemini-3-flash',
        label: 'Gemini 3 Flash',
        identifiers: ['gemini-3-flash']
      },
      {
        id: 'gemini-image',
        label: 'Gemini Image',
        identifiers: ['gemini-3-pro-image']
      }
    ]

    const findModel = (identifiers: string[]) => {
      for (const id of identifiers) {
        const model = models[id]
        if (model) return { id, entry: model }

        for (const [key, entry] of Object.entries<any>(models)) {
          const displayName = entry?.displayName || ''
          if (displayName.toLowerCase() === id.toLowerCase()) {
            return { id: key, entry }
          }
        }
      }
      return null
    }

    for (const groupDef of modelGroups) {
      const matches = []
      for (const identifier of groupDef.identifiers) {
        const match = findModel([identifier])
        if (match) matches.push(match)
      }

      if (matches.length === 0) continue

      const quotaEntries = matches
        .map(({ id, entry }) => {
          const quotaInfo = entry?.quotaInfo || entry?.quota_info || {}
          let remainingFraction = quotaInfo.remainingFraction || quotaInfo.remaining_fraction || quotaInfo.remaining

          if (typeof remainingFraction === 'string' && remainingFraction.endsWith('%')) {
            remainingFraction = parseFloat(remainingFraction) / 100
          } else {
            remainingFraction = parseFloat(remainingFraction)
          }

          if (isNaN(remainingFraction)) {
            const resetTime = quotaInfo.resetTime || quotaInfo.reset_time
            remainingFraction = resetTime ? 0 : null
          }

          if (remainingFraction === null) return null

          return {
            id,
            remainingFraction: Math.max(0, Math.min(1, remainingFraction)),
            resetTime: quotaInfo.resetTime || quotaInfo.reset_time,
            displayName: entry?.displayName
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)

      if (quotaEntries.length === 0) continue

      const remainingFraction = Math.min(...quotaEntries.map(e => e.remainingFraction))
      const percent = Math.round(remainingFraction * 100)
      const resetTime = quotaEntries.find(e => e.resetTime)?.resetTime

      groups.push({
        name: groupDef.label,
        percent,
        remaining: percent,
        used: 100 - percent,
        total: 100,
        resetTime
      })
    }

    return { groups }
  }
}

/**
 * Gemini CLI Quota
 */
export const geminiCliQuota = {
  URL: 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',

  async fetch(file: any): Promise<any> {
    const authIndex = file.authIndex || file.auth_index
    const header = {
      'Authorization': 'Bearer $TOKEN$',
      'Content-Type': 'application/json'
    }

    const projectId = await resolveGeminiCliProjectId(file.name)
    const data = projectId ? JSON.stringify({ project: projectId }) : JSON.stringify({})

    const result = await apiCallApi.request({
      authIndex,
      method: 'POST',
      url: this.URL,
      header,
      data
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(result.bodyText || `HTTP ${result.statusCode}`)
    }

    return this.parse(result.body)
  },

  parse(data: any): any {
    const buckets: any[] = []

    const rawBuckets = data.buckets || []
    if (!Array.isArray(rawBuckets) || rawBuckets.length === 0) {
      return { buckets }
    }

    for (const bucket of rawBuckets) {
      let modelId = bucket.modelId || bucket.model_id
      if (!modelId) continue

      if (modelId.endsWith('_vertex')) {
        modelId = modelId.slice(0, -7)
      }

      let remainingFraction = bucket.remainingFraction || bucket.remaining_fraction

      if (typeof remainingFraction === 'string' && remainingFraction.endsWith('%')) {
        remainingFraction = parseFloat(remainingFraction) / 100
      } else {
        remainingFraction = parseFloat(remainingFraction)
      }

      if (isNaN(remainingFraction)) {
        const remainingAmount = bucket.remainingAmount || bucket.remaining_amount
        if (remainingAmount !== null && remainingAmount !== undefined) {
          remainingFraction = remainingAmount <= 0 ? 0 : null
        } else {
          const resetTime = bucket.resetTime || bucket.reset_time
          remainingFraction = resetTime ? 0 : null
        }
      }

      if (remainingFraction === null) continue

      const percent = Math.round(Math.max(0, Math.min(1, remainingFraction)) * 100)
      const resetTime = bucket.resetTime || bucket.reset_time

      buckets.push({
        modelId,
        percent,
        remaining: percent,
        used: 100 - percent,
        total: 100,
        resetTime
      })
    }

    return { buckets }
  }
}

/**
 * Codex Quota
 */
export const codexQuota = {
  URL: 'https://chatgpt.com/backend-api/wham/usage',

  async fetch(file: any): Promise<any> {
    const authIndex = file.authIndex || file.auth_index
    const header: Record<string, string> = {
      'Authorization': 'Bearer $TOKEN$',
      'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal'
    }

    const accountId = await resolveCodexAccountId(file.name)
    if (accountId) {
      header['Chatgpt-Account-Id'] = accountId
    }

    const result = await apiCallApi.request({
      authIndex,
      method: 'GET',
      url: this.URL,
      header
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(result.bodyText || `HTTP ${result.statusCode}`)
    }

    return this.parse(result.body)
  },

  parse(data: any): any {
    const limits: any[] = []
    let planType = 'unknown'

    const rateLimit = data.rate_limit || data.rateLimit
    const codeReviewLimit = data.code_review_rate_limit || data.codeReviewRateLimit

    planType = data.plan_type || data.planType || 'unknown'

    const parseWindows = (limitInfo: any, prefix = '') => {
      if (!limitInfo) return

      const primaryWindow = limitInfo.primary_window || limitInfo.primaryWindow
      const secondaryWindow = limitInfo.secondary_window || limitInfo.secondaryWindow

      const addWindow = (window: any, label: string) => {
        if (!window) return

        const rawUsedPercent = window.used_percent ?? window.usedPercent
        let usedPercent: number | null = rawUsedPercent !== null && rawUsedPercent !== undefined ? parseFloat(rawUsedPercent) : NaN

        if (typeof usedPercent === 'number' && isNaN(usedPercent)) {
          const limitReached = limitInfo.limit_reached ?? limitInfo.limitReached
          const allowed = limitInfo.allowed
          if (limitReached || allowed === false) {
            usedPercent = 100
          } else {
            usedPercent = null
          }
        }

        usedPercent = usedPercent !== null && !isNaN(usedPercent) ? Math.max(0, Math.min(100, usedPercent)) : null
        const remaining = usedPercent !== null ? Math.max(0, 100 - usedPercent) : null

        // 计算重置时间
        const resetAt = window.reset_at ?? window.resetAt
        const resetAfterSeconds = window.reset_after_seconds ?? window.resetAfterSeconds
        let resetTime: number | null = null
        if (resetAt) {
          resetTime = parseFloat(resetAt)
        } else if (resetAfterSeconds) {
          const resetAfter = parseFloat(resetAfterSeconds)
          if (!isNaN(resetAfter)) {
            resetTime = Math.floor(Date.now() / 1000 + resetAfter)
          }
        }

        limits.push({
          model: `${prefix}${label}`,
          percent: remaining,
          remaining,
          used: usedPercent !== null ? usedPercent : null,
          total: 100,
          resetTime: resetTime && !isNaN(resetTime) ? resetTime : undefined
        })
      }

      addWindow(primaryWindow, 'Primary')
      addWindow(secondaryWindow, 'Secondary')
    }

    parseWindows(rateLimit, '')
    parseWindows(codeReviewLimit, 'Code Review ')

    return { planType, limits }
  }
}

export interface QuotaResult {
  type: string
  data: any
}

export async function fetchQuotaByType(file: any): Promise<QuotaResult> {
  const type = (file.type || '').toLowerCase()
  const authIndex = file.authIndex || file.auth_index

  if (!authIndex) {
    throw new Error('Missing authIndex')
  }

  switch (type) {
    case 'antigravity':
      return {
        type: 'antigravity',
        data: await antigravityQuota.fetch(file)
      }

    case 'gemini-cli':
      return {
        type: 'gemini-cli',
        data: await geminiCliQuota.fetch(file)
      }

    case 'codex':
      return {
        type: 'codex',
        data: await codexQuota.fetch(file)
      }

    default:
      throw new Error(`Unsupported type: ${type}`)
  }
}
