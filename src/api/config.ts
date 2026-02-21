import { request } from '../lib/request'

/**
 * Configuration API
 */
export const configApi = {
  /**
   * Get configuration
   */
  getConfig(): Promise<any> {
    return request.get('/v0/management/config')
  },

  /**
   * Update debug mode
   */
  updateDebug(enabled: boolean): Promise<void> {
    return request.put('/v0/management/debug', {
      value: enabled
    })
  },

  /**
   * Update proxy URL
   */
  updateProxyUrl(proxyUrl: string): Promise<void> {
    return request.put('/v0/management/proxy-url', {
      value: proxyUrl
    })
  },

  /**
   * Clear proxy URL
   */
  clearProxyUrl(): Promise<void> {
    return request.delete('/v0/management/proxy-url')
  },

  /**
   * Update request retry count
   */
  updateRequestRetry(retryCount: number): Promise<void> {
    return request.put('/v0/management/request-retry', {
      value: retryCount
    })
  },

  /**
   * Update routing strategy
   */
  updateRoutingStrategy(strategy: string): Promise<void> {
    return request.put('/v0/management/routing/strategy', {
      value: strategy
    })
  },

  /**
   * Quota exceeded: switch project
   */
  updateSwitchProject(enabled: boolean): Promise<void> {
    return request.put('/v0/management/quota-exceeded/switch-project', {
      value: enabled
    })
  },

  /**
   * Quota exceeded: switch preview model
   */
  updateSwitchPreviewModel(enabled: boolean): Promise<void> {
    return request.put('/v0/management/quota-exceeded/switch-preview-model', {
      value: enabled
    })
  },

  /**
   * Usage statistics toggle
   */
  updateUsageStatistics(enabled: boolean): Promise<void> {
    return request.put('/v0/management/usage-statistics-enabled', {
      value: enabled
    })
  },

  /**
   * Request log toggle
   */
  updateRequestLog(enabled: boolean): Promise<void> {
    return request.put('/v0/management/request-log', {
      value: enabled
    })
  },

  /**
   * Logging to file toggle
   */
  updateLoggingToFile(enabled: boolean): Promise<void> {
    return request.put('/v0/management/logging-to-file', {
      value: enabled
    })
  },

  /**
   * Logs max total size (MB)
   */
  updateLogsMaxTotalSizeMb(value: number): Promise<void> {
    return request.put('/v0/management/logs-max-total-size-mb', {
      value
    })
  },

  /**
   * WebSocket auth toggle
   */
  updateWsAuth(enabled: boolean): Promise<void> {
    return request.put('/v0/management/ws-auth', {
      value: enabled
    })
  }
}
