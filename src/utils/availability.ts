import { getAvailabilityTimeConfig, type AvailabilityStatus } from '../config/constants'

/**
 * 可用性监控点数据
 */
export interface AvailabilityPoint {
  timestamp: number
  available: boolean
  status?: AvailabilityStatus
}

/**
 * Usage 请求详情（从 API 返回）
 */
export interface UsageDetail {
  timestamp: string
  source: string
  auth_index: number | string
  tokens: {
    input_tokens: number
    output_tokens: number
    reasoning_tokens: number
    cached_tokens: number
    total_tokens: number
  }
  failed: boolean
}

/**
 * 从 usage 数据生成可用性监控点
 * 基于最近的请求历史生成时间块
 */
export function generateAvailabilityPointsFromUsage(
  usageDetails: UsageDetail[],
  authIndex?: number | string
): AvailabilityPoint[] {
  // 从配置获取时间参数
  const { blockCount, blockDurationMs, windowMs } = getAvailabilityTimeConfig()

  const now = Date.now()
  const windowStart = now - windowMs

  // 初始化块统计
  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: blockCount },
    () => ({ success: 0, failure: 0 })
  )

  // 标准化 authIndex 用于比较
  const normalizeAuthIndex = (value: any): string | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString()
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? trimmed : null
    }
    return null
  }

  const targetAuthIndex = normalizeAuthIndex(authIndex)

  // 过滤并分桶 usage 详情
  usageDetails.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp)
    if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > now) {
      return
    }

    // 如果提供了 authIndex 过滤器，则只统计匹配的记录
    if (targetAuthIndex !== undefined && targetAuthIndex !== null) {
      const detailAuthIndex = normalizeAuthIndex(detail.auth_index)
      if (detailAuthIndex !== targetAuthIndex) {
        return
      }
    }

    // 计算该记录属于哪个块（0 = 最旧，19 = 最新）
    const ageMs = now - timestamp
    const blockIndex = blockCount - 1 - Math.floor(ageMs / blockDurationMs)

    if (blockIndex >= 0 && blockIndex < blockCount) {
      if (detail.failed) {
        blockStats[blockIndex].failure += 1
      } else {
        blockStats[blockIndex].success += 1
      }
    }
  })

  // 将统计转换为可用性点
  const points: AvailabilityPoint[] = []
  for (let i = 0; i < blockCount; i++) {
    const blockTime = now - (blockCount - 1 - i) * blockDurationMs
    const stat = blockStats[i]

    let status: AvailabilityStatus
    let available: boolean

    if (stat.success === 0 && stat.failure === 0) {
      status = 'idle'
      available = true // idle 视为可用（没有失败）
    } else if (stat.failure === 0) {
      status = 'success'
      available = true
    } else if (stat.success === 0) {
      status = 'failure'
      available = false
    } else {
      status = 'mixed'
      available = stat.success >= stat.failure // 混合状态：成功数 >= 失败数则视为可用
    }

    points.push({
      timestamp: blockTime,
      available,
      status
    })
  }

  return points
}

/**
 * 从使用数据中收集所有请求明细
 */
export function collectUsageDetails(usageData: any): UsageDetail[] {
  if (!usageData) {
    return []
  }
  const apis = usageData.apis || {}
  const details: UsageDetail[] = []

  Object.values(apis as Record<string, any>).forEach((apiEntry) => {
    const models = apiEntry?.models || {}
    Object.values(models as Record<string, any>).forEach((modelEntry: any) => {
      const modelDetails = Array.isArray(modelEntry.details) ? modelEntry.details : []
      modelDetails.forEach((detail: any) => {
        if (detail && detail.timestamp) {
          details.push(detail)
        }
      })
    })
  })

  return details
}
export function calculateAvailabilityStats(points: AvailabilityPoint[]) {
  if (points.length === 0) {
    return {
      availableCount: 0,
      unavailableCount: 0,
      availabilityRate: 0,
      currentStreak: 0,
      longestStreak: 0
    }
  }

  const availableCount = points.filter(p => p.available).length
  const unavailableCount = points.length - availableCount
  const availabilityRate = (availableCount / points.length) * 100

  // 计算当前连续可用次数
  let currentStreak = 0
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].available) {
      currentStreak++
    } else {
      break
    }
  }

  // 计算最长连续可用次数
  let longestStreak = 0
  let streak = 0
  for (const point of points) {
    if (point.available) {
      streak++
      longestStreak = Math.max(longestStreak, streak)
    } else {
      streak = 0
    }
  }

  return {
    availableCount,
    unavailableCount,
    availabilityRate,
    currentStreak,
    longestStreak
  }
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - timestamp
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) {
    return '刚刚'
  } else if (diffHours < 24) {
    return `${diffHours}小时前`
  } else if (diffHours < 48) {
    return '昨天'
  } else {
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}
