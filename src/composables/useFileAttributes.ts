import { ref } from 'vue'
import { authFilesApi } from '../api/authFiles'

export interface FileAttribute {
  icon: string  // lucide-vue-next 图标名
  value: string
  label: string
  color?: string
}

interface CacheEntry {
  attributes: FileAttribute[]
  version: string | null
  updatedAt: number
}

type FileMeta = {
  modtime?: string | number
  updated_at?: string | number
  last_refresh?: string | number
  created_at?: string | number
  [key: string]: any
}

const attributesCache = ref<Record<string, CacheEntry>>({})
const loading = ref<Record<string, boolean>>({})
const inflight = new Map<string, Promise<FileAttribute[]>>()
const inflightCount = new Map<string, number>()

const getFileVersion = (fileMeta?: FileMeta): string | null => {
  if (!fileMeta) return null
  const raw = fileMeta.modtime ?? fileMeta.updated_at ?? fileMeta.last_refresh ?? fileMeta.created_at ?? null
  if (raw === null || raw === undefined || raw === '') return null
  return String(raw)
}

const setLoadingFlag = (fileName: string, active: boolean) => {
  if (active) {
    const next = (inflightCount.get(fileName) ?? 0) + 1
    inflightCount.set(fileName, next)
    loading.value[fileName] = true
  } else {
    const current = (inflightCount.get(fileName) ?? 1) - 1
    if (current <= 0) {
      inflightCount.delete(fileName)
      delete loading.value[fileName]
    } else {
      inflightCount.set(fileName, current)
      loading.value[fileName] = true
    }
  }
}

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

  // agent / user_agent 属性
  if (fileContent.agent) {
    attributes.push({
      icon: 'User',
      value: String(fileContent.agent),
      label: 'Agent',
      color: 'text-teal-600 dark:text-teal-400'
    })
  }
  const userAgent = fileContent.user_agent || fileContent.userAgent
  if (userAgent) {
    attributes.push({
      icon: 'UserCircle',
      value: String(userAgent),
      label: 'User Agent',
      color: 'text-amber-600 dark:text-amber-400'
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
 * 获取文件的特定属性用于显示
 */
export function useFileAttributes() {
  const setAttributes = (fileName: string, attributes: FileAttribute[], fileMeta?: FileMeta) => {
    attributesCache.value[fileName] = {
      attributes,
      version: getFileVersion(fileMeta),
      updatedAt: Date.now()
    }
  }

  const setAttributesFromJson = (fileName: string, json: any, fileMeta?: FileMeta) => {
    const attributes = extractAttributes(json)
    setAttributes(fileName, attributes, fileMeta)
    return attributes
  }

  /**
   * 获取文件的属性
   */
  const getFileAttributes = async (fileName: string, fileMeta?: FileMeta): Promise<FileAttribute[]> => {
    const version = getFileVersion(fileMeta)
    const cached = attributesCache.value[fileName]
    if (cached && (version === null || cached.version === version)) {
      return cached.attributes
    }

    const inflightKey = `${fileName}::${version ?? 'noversion'}`
    const existing = inflight.get(inflightKey)
    if (existing) return existing

    setLoadingFlag(fileName, true)
    const promise = (async () => {
      try {
        const blob = await authFilesApi.download(fileName)
        const text = await blob.text()
        const json = JSON.parse(text)
        return setAttributesFromJson(fileName, json, fileMeta)
      } catch (error) {
        console.error(`Failed to load attributes for ${fileName}:`, error)
        return []
      } finally {
        setLoadingFlag(fileName, false)
      }
    })()

    inflight.set(inflightKey, promise)
    promise.finally(() => {
      inflight.delete(inflightKey)
    })
    return promise
  }

  /**
   * 清除缓存
   */
  const clearCache = (fileName?: string) => {
    if (fileName) {
      delete attributesCache.value[fileName]
      delete loading.value[fileName]
      inflightCount.delete(fileName)
    } else {
      attributesCache.value = {}
      loading.value = {}
      inflightCount.clear()
      inflight.clear()
    }
  }

  const pruneCache = (fileNames: string[]) => {
    const nameSet = new Set(fileNames)
    for (const name of Object.keys(attributesCache.value)) {
      if (!nameSet.has(name)) {
        delete attributesCache.value[name]
        delete loading.value[name]
        inflightCount.delete(name)
      }
    }
  }

  /**
   * 预加载文件属性（批量）
   */
  const preloadAttributes = async (items: Array<string | { name: string }>, concurrency = 3) => {
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency)
      await Promise.allSettled(
        batch.map((item) => {
          if (typeof item === 'string') return getFileAttributes(item)
          return getFileAttributes(item.name, item)
        })
      )
    }
  }

  return {
    attributesCache,
    loading,
    getFileAttributes,
    setAttributes,
    setAttributesFromJson,
    clearCache,
    pruneCache,
    preloadAttributes
  }
}
