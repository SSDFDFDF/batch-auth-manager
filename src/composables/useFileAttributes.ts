import { ref } from 'vue'
import { authFilesApi } from '../api/authFiles'

export interface FileAttribute {
  icon: string  // lucide-vue-next 图标名
  value: string
  label: string
  color?: string
}

/**
 * 获取文件的特定属性用于显示
 */
export function useFileAttributes() {
  const attributesCache = ref<Record<string, FileAttribute[]>>({})
  const loading = ref<Record<string, boolean>>({})

  /**
   * 从文件内容中提取需要显示的属性
   */
  const extractAttributes = (fileContent: any): FileAttribute[] => {
    const attributes: FileAttribute[] = []

    // proxy_url 属性
    if (fileContent.proxy_url) {
      attributes.push({
        icon: 'Waypoints',
        value: fileContent.proxy_url,
        label: 'Proxy',
        color: 'text-blue-600 dark:text-blue-400'
      })
    }

    // prefix 属性
    if (fileContent.prefix) {
      attributes.push({
        icon: 'Tag',
        value: fileContent.prefix,
        label: 'Prefix',
        color: 'text-green-600 dark:text-green-400'
      })
    }

    // max_tokens 属性
    if (fileContent.max_tokens) {
      attributes.push({
        icon: 'Coins',
        value: String(fileContent.max_tokens),
        label: 'Max Tokens',
        color: 'text-purple-600 dark:text-purple-400'
      })
    }

    // api_base / api_endpoint 属性
    const apiBase = fileContent.api_base || fileContent.api_endpoint
    if (apiBase) {
      attributes.push({
        icon: 'Server',
        value: apiBase,
        label: 'API Base',
        color: 'text-orange-600 dark:text-orange-400'
      })
    }

    // model 属性
    if (fileContent.model) {
      attributes.push({
        icon: 'Bot',
        value: fileContent.model,
        label: 'Model',
        color: 'text-indigo-600 dark:text-indigo-400'
      })
    }

    // temperature 属性
    if (fileContent.temperature !== undefined) {
      attributes.push({
        icon: 'Thermometer',
        value: String(fileContent.temperature),
        label: 'Temperature',
        color: 'text-red-600 dark:text-red-400'
      })
    }

    return attributes
  }

  /**
   * 获取文件的属性
   */
  const getFileAttributes = async (fileName: string): Promise<FileAttribute[]> => {
    // 检查缓存
    if (attributesCache.value[fileName]) {
      return attributesCache.value[fileName]
    }

    // 检查是否正在加载
    if (loading.value[fileName]) {
      return []
    }

    loading.value[fileName] = true

    try {
      const blob = await authFilesApi.download(fileName)
      const text = await blob.text()
      const json = JSON.parse(text)
      const attributes = extractAttributes(json)

      // 缓存结果
      attributesCache.value[fileName] = attributes

      return attributes
    } catch (error) {
      console.error(`Failed to load attributes for ${fileName}:`, error)
      return []
    } finally {
      loading.value[fileName] = false
    }
  }

  /**
   * 清除缓存
   */
  const clearCache = (fileName?: string) => {
    if (fileName) {
      delete attributesCache.value[fileName]
    } else {
      attributesCache.value = {}
    }
  }

  /**
   * 预加载文件属性（批量）
   */
  const preloadAttributes = async (fileNames: string[], concurrency = 3) => {
    for (let i = 0; i < fileNames.length; i += concurrency) {
      const batch = fileNames.slice(i, i + concurrency)
      await Promise.allSettled(
        batch.map(name => getFileAttributes(name))
      )
    }
  }

  return {
    attributesCache,
    loading,
    getFileAttributes,
    clearCache,
    preloadAttributes
  }
}
