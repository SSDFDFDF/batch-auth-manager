/**
 * 格式化配额重置时间
 * @param value ISO 字符串或 Unix 时间戳（秒）
 */
export function formatResetTime(value?: string | number): string {
  if (!value) return '-'

  let date: Date
  if (typeof value === 'string') {
    date = new Date(value)
  } else {
    date = new Date(value * 1000)
  }

  if (isNaN(date.getTime())) return '-'

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
