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
 * Extract chatgpt_account_id from an id_token value (JWT string or decoded object)
 */
function extractAccountIdFromIdToken(idToken: any): string | null {
  if (!idToken) return null

  // Already decoded object
  if (typeof idToken === 'object') {
    const accountId = idToken.chatgpt_account_id ?? idToken.chatgptAccountId
    return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null
  }

  // JWT string
  if (typeof idToken === 'string') {
    const payload = decodeJwtPayload(idToken)
    if (!payload) return null
    const accountId = payload.chatgpt_account_id ?? payload.chatgptAccountId
    return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null
  }

  return null
}

/**
 * Resolve Codex chatgpt_account_id (multi-source: file listing → raw auth file)
 */
async function resolveCodexAccountId(file: any): Promise<string | null> {
  // 1. Try from file listing object (id_token may already be decoded)
  const candidates = [
    file.id_token ?? file.idToken,
    file.metadata?.id_token ?? file.metadata?.idToken,
    file.attributes?.id_token ?? file.attributes?.idToken
  ]
  for (const candidate of candidates) {
    const id = extractAccountIdFromIdToken(candidate)
    if (id) return id
  }

  // 2. Fallback: download raw auth file
  const parsed = await downloadAuthFileJson(file.name)
  if (parsed && typeof parsed === 'object') {
    const rawIdToken = parsed.id_token ?? parsed.idToken
    const id = extractAccountIdFromIdToken(rawIdToken)
    if (id) return id
  }

  return null
}

/**
 * Resolve Codex plan_type from auth file (multi-source fallback)
 */
function resolveCodexPlanTypeFromFile(file: any): string | null {
  // 1. file top-level
  const topLevel = file.plan_type ?? file.planType
  if (typeof topLevel === 'string' && topLevel.trim()) return topLevel.trim().toLowerCase()

  // 2. file.id_token object
  const idToken = file.id_token ?? file.idToken
  if (idToken && typeof idToken === 'object') {
    const pt = idToken.plan_type ?? idToken.planType
    if (typeof pt === 'string' && pt.trim()) return pt.trim().toLowerCase()
  }

  // 3. file.metadata
  const metadata = file.metadata
  if (metadata && typeof metadata === 'object') {
    const pt = metadata.plan_type ?? metadata.planType
    if (typeof pt === 'string' && pt.trim()) return pt.trim().toLowerCase()

    // metadata.id_token
    const metaIdToken = metadata.id_token ?? metadata.idToken
    if (metaIdToken && typeof metaIdToken === 'object') {
      const pt2 = metaIdToken.plan_type ?? metaIdToken.planType
      if (typeof pt2 === 'string' && pt2.trim()) return pt2.trim().toLowerCase()
    }
  }

  // 4. file.attributes
  const attributes = file.attributes
  if (attributes && typeof attributes === 'object') {
    const pt = attributes.plan_type ?? attributes.planType
    if (typeof pt === 'string' && pt.trim()) return pt.trim().toLowerCase()
  }

  return null
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
          'claude-opus-4-6-thinking',
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
        id: 'gemini-2-5-pro',
        label: 'Gemini 2.5 Pro',
        identifiers: ['gemini-2.5-pro']
      },
      {
        id: 'gemini-2-5-flash',
        label: 'Gemini 2.5 Flash',
        identifiers: ['gemini-2.5-flash', 'gemini-2.5-flash-thinking']
      },
      {
        id: 'gemini-2-5-cu',
        label: 'Gemini 2.5 CU',
        identifiers: ['rev19-uic3-1p']
      },
      {
        id: 'gemini-2-5-flash-lite',
        label: 'Gemini 2.5 Flash Lite',
        identifiers: ['gemini-2.5-flash-lite'],
        hideInTable: true
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
        resetTime,
        hideInTable: !!(groupDef as any).hideInTable
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

    const accountId = await resolveCodexAccountId(file)
    if (!accountId) {
      throw new Error('Missing chatgpt_account_id in id_token')
    }
    header['Chatgpt-Account-Id'] = accountId

    const planTypeFromFile = resolveCodexPlanTypeFromFile(file)

    const result = await apiCallApi.request({
      authIndex,
      method: 'GET',
      url: this.URL,
      header
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(result.bodyText || `HTTP ${result.statusCode}`)
    }

    return this.parse(result.body, planTypeFromFile)
  },

  parse(data: any, planTypeFromFile?: string | null): any {
    const FIVE_HOUR_SECONDS = 18000
    const WEEK_SECONDS = 604800

    const limits: any[] = []
    const planTypeFromApi = data.plan_type || data.planType || null
    const planType = (planTypeFromApi ? String(planTypeFromApi).trim().toLowerCase() : null)
      ?? planTypeFromFile
      ?? 'unknown'

    const rateLimit = data.rate_limit || data.rateLimit
    const codeReviewLimit = data.code_review_rate_limit || data.codeReviewRateLimit

    const getWindowSeconds = (window: any): number | null => {
      if (!window) return null
      const raw = window.limit_window_seconds ?? window.limitWindowSeconds
      const num = parseFloat(raw)
      return Number.isFinite(num) ? num : null
    }

    const classifyWindows = (limitInfo: any): { fiveHour: any; weekly: any; extra: any[] } => {
      if (!limitInfo) return { fiveHour: null, weekly: null, extra: [] }

      const rawWindows = [
        limitInfo.primary_window ?? limitInfo.primaryWindow ?? null,
        limitInfo.secondary_window ?? limitInfo.secondaryWindow ?? null
      ]

      let fiveHour: any = null
      let weekly: any = null
      const unmatched: any[] = []

      for (const window of rawWindows) {
        if (!window) continue
        const seconds = getWindowSeconds(window)
        if (seconds === FIVE_HOUR_SECONDS && !fiveHour) {
          fiveHour = window
        } else if (seconds === WEEK_SECONDS && !weekly) {
          weekly = window
        } else {
          unmatched.push(window)
        }
      }

      // Fallback: if no window was classified, use positional order
      if (!fiveHour && !weekly && unmatched.length > 0) {
        fiveHour = unmatched.shift()!
        if (unmatched.length > 0) weekly = unmatched.shift()!
      }

      return { fiveHour, weekly, extra: unmatched }
    }

    const addWindow = (window: any, label: string, limitInfo: any) => {
      if (!window) return

      const rawUsedPercent = window.used_percent ?? window.usedPercent
      let usedPercent: number | null = rawUsedPercent !== null && rawUsedPercent !== undefined ? parseFloat(rawUsedPercent) : NaN

      if (typeof usedPercent === 'number' && isNaN(usedPercent)) {
        const limitReached = limitInfo?.limit_reached ?? limitInfo?.limitReached
        const allowed = limitInfo?.allowed
        if (limitReached || allowed === false) {
          usedPercent = 100
        } else {
          usedPercent = null
        }
      }

      usedPercent = usedPercent !== null && !isNaN(usedPercent) ? Math.max(0, Math.min(100, usedPercent)) : null
      const remaining = usedPercent !== null ? Math.max(0, 100 - usedPercent) : null

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
        model: label,
        percent: remaining,
        remaining,
        used: usedPercent !== null ? usedPercent : null,
        total: 100,
        resetTime: resetTime && !isNaN(resetTime) ? resetTime : undefined
      })
    }

    const rateWindows = classifyWindows(rateLimit)
    addWindow(rateWindows.fiveHour, '5h', rateLimit)
    addWindow(rateWindows.weekly, 'Weekly', rateLimit)
    rateWindows.extra.forEach((w, i) => addWindow(w, `Window ${i + 1}`, rateLimit))

    const crWindows = classifyWindows(codeReviewLimit)
    addWindow(crWindows.fiveHour, 'Review 5h', codeReviewLimit)
    addWindow(crWindows.weekly, 'Review Weekly', codeReviewLimit)
    crWindows.extra.forEach((w, i) => addWindow(w, `Review ${i + 1}`, codeReviewLimit))

    const campaignId = data.promo?.campaign_id || null

    return { planType, limits, campaignId }
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
