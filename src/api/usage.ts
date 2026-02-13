import { request } from '../lib/request'

export interface UsageResponse {
  usage: StatisticsSnapshot
  failed_requests: number
}

export interface StatisticsSnapshot {
  total_requests: number
  success_count: number
  failure_count: number
  total_tokens: number
  apis: Record<string, APISnapshot>
  requests_by_day: Record<string, number>
  requests_by_hour: Record<string, number>
  tokens_by_day: Record<string, number>
  tokens_by_hour: Record<string, number>
}

export interface APISnapshot {
  total_requests: number
  total_tokens: number
  models: Record<string, ModelSnapshot>
}

export interface ModelSnapshot {
  total_requests: number
  total_tokens: number
  details: RequestDetail[]
}

export interface RequestDetail {
  timestamp: string
  source: string
  auth_index: string
  tokens: TokenStats
  failed: boolean
}

export interface TokenStats {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
}

export const usageApi = {
  getUsage: () => request.get<UsageResponse>('/v0/management/usage')
}
