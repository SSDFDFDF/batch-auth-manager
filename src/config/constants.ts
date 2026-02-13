/**
 * 状态配置
 * 提供默认映射，但会动态适配后端返回的实际值
 */
export const STATUS_CONFIG = {
  // 默认状态映射 - 作为 fallback
  variant: {
    active: 'default',
    disabled: 'secondary',
    error: 'destructive',
    pending: 'secondary',
  } as Record<string, string>,

  // 默认状态标签 - 作为 fallback
  label: {
    active: '正常',
    disabled: '禁用',
    error: '错误',
    pending: '待定',
  } as Record<string, string>,

  // 默认状态 - 用于未知状态的显示
  default: {
    variant: 'secondary',
    label: '未知',
  }
}

/**
 * 提供商配置
 * 提供默认显示名称，但支持动态扩展
 */
export const PROVIDER_CONFIG = {
  // 默认提供商显示名称 - 作为 fallback
  displayName: {
    'gemini': 'Gemini',
    'gemini-cli': 'Gemini CLI',
    'claude': 'Claude',
    'codex': 'Codex',
    'antigravity': 'Antigravity',
    'qwen': 'Qwen',
    'kimi': 'Kimi',
    'iflow': 'iFlow',
    'aistudio': 'AI Studio',
  } as Record<string, string>,

  // 支持配额查询的提供商
  quotaSupported: [
    'antigravity',
    'gemini-cli',
    'codex',
  ] as string[],
}

/**
 * 配额百分比配置
 */
export const QUOTA_CONFIG = {
  // 阈值配置
  thresholds: {
    sufficient: 50,  // ≥ 50% 充足
    warning: 20,     // ≥ 20% 警告
  },

  // 颜色配置
  colors: {
    sufficient: {
      light: 'text-green-600',
      dark: 'text-green-400',
    },
    warning: {
      light: 'text-yellow-600',
      dark: 'text-yellow-400',
    },
    critical: {
      light: 'text-red-600',
      dark: 'text-red-400',
    },
  } as Record<string, { light: string; dark: string }>,
}

/**
 * 获取配额百分比的样式类
 */
export function getQuotaPercentClass(percent: number): string {
  if (percent >= QUOTA_CONFIG.thresholds.sufficient) {
    return 'text-green-600 dark:text-green-400'
  } else if (percent >= QUOTA_CONFIG.thresholds.warning) {
    return 'text-yellow-600 dark:text-yellow-400'
  } else {
    return 'text-red-600 dark:text-red-400'
  }
}

/**
 * 可用性监控配置
 */
export const AVAILABILITY_CONFIG = {
  // 时间块配置
  time: {
    blockCount: 20,              // 时间块数量
    blockDurationMinutes: 10,    // 每个块的时长（分钟）
    windowMinutes: 200,          // 总时间窗口（分钟）
  },

  // 状态颜色配置
  statusColors: {
    success: {
      light: 'bg-green-500',
      dark: 'bg-green-400',
    },
    failure: {
      light: 'bg-red-500',
      dark: 'bg-red-400',
    },
    mixed: {
      light: 'bg-yellow-500',
      dark: 'bg-yellow-400',
    },
    idle: {
      light: 'bg-gray-300',
      dark: 'bg-gray-600',
    },
  } as Record<string, { light: string; dark: string }>,

  // 状态标签配置
  statusLabels: {
    success: '全部成功',
    failure: '全部失败',
    mixed: '部分失败',
    idle: '无数据',
  } as Record<string, string>,

  // 回退标签（当 status 为 boolean 时）
  fallbackLabels: {
    available: '可用',
    unavailable: '不可用',
  },

  // 可用率等级配置
  rateThresholds: {
    high: 90,
    medium: 50,
  },

  // 可用率样式配置
  rateClasses: {
    high: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
    medium: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
    low: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  } as Record<string, string>,
}

/**
 * 可用性状态类型
 */
export type AvailabilityStatus = 'success' | 'failure' | 'mixed' | 'idle'

/**
 * 计算可用性时间配置（毫秒）
 */
export function getAvailabilityTimeConfig() {
  return {
    blockCount: AVAILABILITY_CONFIG.time.blockCount,
    blockDurationMs: AVAILABILITY_CONFIG.time.blockDurationMinutes * 60 * 1000,
    windowMs: AVAILABILITY_CONFIG.time.windowMinutes * 60 * 1000,
  }
}

/**
 * 获取可用性状态颜色类
 */
export function getAvailabilityStatusColor(status: AvailabilityStatus | boolean, darkMode = false): string {
  if (typeof status === 'boolean') {
    const successColor = AVAILABILITY_CONFIG.statusColors.success
    const failureColor = AVAILABILITY_CONFIG.statusColors.failure
    return status
      ? (darkMode ? successColor.dark : successColor.light)
      : (darkMode ? failureColor.dark : failureColor.light)
  }

  const colorSet = AVAILABILITY_CONFIG.statusColors[status]
  if (!colorSet) {
    const idleColor = AVAILABILITY_CONFIG.statusColors.idle
    return darkMode ? idleColor.dark : idleColor.light
  }

  return darkMode ? colorSet.dark : colorSet.light
}

/**
 * 获取可用性状态标签
 */
export function getAvailabilityStatusLabel(status: AvailabilityStatus | boolean): string {
  if (typeof status === 'boolean') {
    return status ? AVAILABILITY_CONFIG.fallbackLabels.available : AVAILABILITY_CONFIG.fallbackLabels.unavailable
  }

  return AVAILABILITY_CONFIG.statusLabels[status] || AVAILABILITY_CONFIG.statusLabels.idle
}

/**
 * 获取可用率等级样式类
 */
export function getAvailabilityRateClass(rate: number): string {
  if (rate >= AVAILABILITY_CONFIG.rateThresholds.high) {
    return AVAILABILITY_CONFIG.rateClasses.high
  } else if (rate >= AVAILABILITY_CONFIG.rateThresholds.medium) {
    return AVAILABILITY_CONFIG.rateClasses.medium
  } else {
    return AVAILABILITY_CONFIG.rateClasses.low
  }
}

/**
 * 获取状态的 Badge variant
 */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export function getStatusVariant(status: string): BadgeVariant {
  const normalizedStatus = (status || '').toLowerCase().trim()
  return (STATUS_CONFIG.variant[normalizedStatus] || STATUS_CONFIG.default.variant) as BadgeVariant
}

/**
 * 获取状态的显示标签
 */
export function getStatusLabel(status: string): string {
  const normalizedStatus = (status || '').toLowerCase().trim()
  return STATUS_CONFIG.label[normalizedStatus] || normalizedStatus || STATUS_CONFIG.default.label
}

/**
 * 获取提供商的显示名称
 */
export function getProviderDisplayName(provider: string): string {
  const normalizedProvider = (provider || '').toLowerCase().trim()
  return PROVIDER_CONFIG.displayName[normalizedProvider] || provider
}

/**
 * 检查提供商是否支持配额查询
 */
export function supportsQuota(provider: string): boolean {
  const normalizedProvider = (provider || '').toLowerCase().trim()
  return PROVIDER_CONFIG.quotaSupported.includes(normalizedProvider)
}
