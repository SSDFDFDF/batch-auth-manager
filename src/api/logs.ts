import { request } from '../lib/request'

export interface LogsQuery {
  after?: number
}

export interface LogsResponse {
  lines: string[]
  'line-count': number
  'latest-timestamp': number
}

export interface ErrorLogFile {
  name: string
  size?: number
  modified?: number
}

export interface ErrorLogsResponse {
  files?: ErrorLogFile[] | string[]
}

export const logsApi = {
  fetchLogs(params: LogsQuery = {}): Promise<LogsResponse> {
    return request.get('/v0/management/logs', { params, timeout: 60000 })
  },

  clearLogs(): Promise<void> {
    return request.delete('/v0/management/logs')
  },

  fetchErrorLogs(): Promise<ErrorLogsResponse> {
    return request.get('/v0/management/request-error-logs', { timeout: 60000 })
  },

  async downloadErrorLog(filename: string): Promise<Blob> {
    const response = await request.get(`/v0/management/request-error-logs/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
      timeout: 60000
    })
    return response as unknown as Blob
  },

  async downloadRequestLogById(id: string): Promise<Blob> {
    const response = await request.get(`/v0/management/request-log-by-id/${encodeURIComponent(id)}`, {
      responseType: 'blob',
      timeout: 60000
    })
    return response as unknown as Blob
  },
}
