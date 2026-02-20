import { computed, ref, Ref } from 'vue'
import type { AuthFile } from '../api/authFiles'

/**
 * 从数据中动态提取唯一值
 */
function extractUniqueValues<T>(
  data: T[],
  field: keyof T,
  transform?: (value: any) => string
): string[] {
  const values = new Set<string>()

  data.forEach(item => {
    const value = item[field]
    if (value !== null && value !== undefined && value !== '') {
      const stringValue = transform ? transform(value) : String(value)
      values.add(stringValue)
    }
  })

  return Array.from(values).sort()
}

/**
 * 认证文件筛选 Hook
 */
export function useAuthFileFilters(files: Ref<AuthFile[]>) {
  // 筛选状态
  const searchText = ref('')
  const filterType = ref('')
  const filterStatus = ref('')
  const filterUnavailable = ref('')

  // 动态提取可用的类型（从实际数据中获取）
  const availableTypes = computed(() => {
    return extractUniqueValues(files.value, 'type', (v) => String(v).toLowerCase())
  })

  // 动态提取可用的状态（从实际数据中获取）
  const availableStatuses = computed(() => {
    return extractUniqueValues(files.value, 'status', (v) => String(v).toLowerCase())
  })

  // 筛选后的数据
  const filteredData = computed(() => {
    let data = files.value

    // 文本搜索
    if (searchText.value) {
      const searchTokens = searchText.value
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      data = data.filter((file: AuthFile) => {
        const combined = [
          file.name,
          file.email,
          file.account,
          file.status_message,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return searchTokens.every(token => combined.includes(token))
      })
    }

    // 类型筛选
    if (filterType.value) {
      data = data.filter((file: AuthFile) => {
        const fileType = (file.type || '').toLowerCase()
        return fileType === filterType.value
      })
    }

    // 状态筛选
    if (filterStatus.value) {
      data = data.filter((file: AuthFile) => {
        const fileStatus = (file.status || '').toLowerCase()
        return fileStatus === filterStatus.value
      })
    }

    // 可用性筛选
    if (filterUnavailable.value) {
      if (filterUnavailable.value === 'true') {
        data = data.filter((file: AuthFile) => file.unavailable === true)
      } else if (filterUnavailable.value === 'false') {
        data = data.filter((file: AuthFile) => !file.unavailable)
      }
    }

    return data
  })

  // 重置所有筛选
  const resetFilters = () => {
    searchText.value = ''
    filterType.value = ''
    filterStatus.value = ''
    filterUnavailable.value = ''
  }

  // 是否有活动的筛选
  const hasActiveFilters = computed(() => {
    return !!(
      searchText.value ||
      filterType.value ||
      filterStatus.value ||
      filterUnavailable.value
    )
  })

  return {
    // 筛选状态
    searchText,
    filterType,
    filterStatus,
    filterUnavailable,

    // 动态选项
    availableTypes,
    availableStatuses,

    // 筛选结果
    filteredData,

    // 工具方法
    resetFilters,
    hasActiveFilters,
  }
}
