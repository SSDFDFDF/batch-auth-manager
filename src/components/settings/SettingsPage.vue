<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import { RefreshCw, Loader2, Plus, Trash2, Eye, EyeOff, X } from 'lucide-vue-next'
import { useNotificationStore } from '../../stores/notification'
import { useAuthStore } from '../../stores/auth'
import { configApi } from '../../api/config'
import { apiKeysApi } from '../../api/apiKeys'
import { oauthModelsApi, type OAuthModelAliasEntry } from '../../api/oauthModels'

import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Label from '../ui/Label.vue'
import Select from '../ui/select/Select.vue'
import Card from '../ui/Card.vue'
import CardHeader from '../ui/CardHeader.vue'
import CardTitle from '../ui/CardTitle.vue'
import CardDescription from '../ui/CardDescription.vue'
import CardContent from '../ui/CardContent.vue'
import Badge from '../ui/badge/Badge.vue'

interface SettingsForm {
  debug: boolean
  proxyUrl: string
  requestRetry: number | undefined
  routingStrategy: string
  quotaSwitchProject: boolean
  quotaSwitchPreviewModel: boolean
  usageStatisticsEnabled: boolean
  requestLog: boolean
  loggingToFile: boolean
  logsMaxTotalSizeMb: number | undefined
  wsAuth: boolean
}

const notificationStore = useNotificationStore()
const authStore = useAuthStore()

const loadingConfig = ref(false)
const loadingApiKeys = ref(false)
const saving = reactive<Record<string, boolean>>({})
const toggleSaving = reactive<Record<string, boolean>>({})

const form = reactive<SettingsForm>({
  debug: false,
  proxyUrl: '',
  requestRetry: undefined,
  routingStrategy: 'round-robin',
  quotaSwitchProject: false,
  quotaSwitchPreviewModel: false,
  usageStatisticsEnabled: false,
  requestLog: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: undefined,
  wsAuth: false
})

const apiKeys = ref<string[]>([])
const apiKeysOriginal = ref<string[]>([])
const newApiKey = ref('')
const showApiKeys = ref(false)

const modelsLoading = ref(false)
const modelsError = ref('')
const models = ref<string[]>([])
const modelsCached = ref(false)

const oauthExcludedLoading = ref(false)
const oauthExcludedError = ref('')
const oauthExcluded = ref<Record<string, string[]>>({})
const oauthExcludedEdits = reactive<Record<string, string>>({})
const oauthExcludedSaving = reactive<Record<string, boolean>>({})
const newExcludedProvider = ref('')
const newExcludedModels = ref('')

const oauthAliasLoading = ref(false)
const oauthAliasError = ref('')
const oauthAlias = ref<Record<string, OAuthModelAliasEntry[]>>({})
const oauthAliasEdits = reactive<Record<string, OAuthModelAliasEntry[]>>({})
const oauthAliasSaving = reactive<Record<string, boolean>>({})
const newAliasChannel = ref('')
const newAliasEntries = ref<OAuthModelAliasEntry[]>([{ name: '', alias: '' }])

const apiKeysDirty = computed(() => {
  return apiKeys.value.join('\n') !== apiKeysOriginal.value.join('\n')
})

const excludedCount = computed(() => {
  return Object.values(oauthExcluded.value).reduce((sum, list) => sum + list.length, 0)
})

const aliasCount = computed(() => {
  return Object.values(oauthAlias.value).reduce((sum, list) => sum + list.length, 0)
})

const normalizeBoolean = (value: any, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false
  }
  return Boolean(value)
}

const normalizeNumber = (value: any): number | undefined => {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

const readValue = (source: any, keys: string[]): any => {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    if (source[key] !== undefined) return source[key]
  }
  return undefined
}

const applyConfig = (config: any) => {
  form.debug = normalizeBoolean(readValue(config, ['debug']))
  const proxyUrl = readValue(config, ['proxyUrl', 'proxy-url'])
  form.proxyUrl = proxyUrl ? String(proxyUrl) : ''
  form.requestRetry = normalizeNumber(readValue(config, ['requestRetry', 'request-retry']))
  const routing = readValue(config, ['routing'])
  if (routing && typeof routing === 'object') {
    const strategy = readValue(routing, ['strategy', 'routingStrategy', 'routing-strategy'])
    form.routingStrategy = strategy ? String(strategy) : 'round-robin'
  } else {
    const strategy = readValue(config, ['routingStrategy', 'routing-strategy'])
    form.routingStrategy = strategy ? String(strategy) : 'round-robin'
  }
  form.usageStatisticsEnabled = normalizeBoolean(readValue(config, ['usageStatisticsEnabled', 'usage-statistics-enabled']))
  form.requestLog = normalizeBoolean(readValue(config, ['requestLog', 'request-log']))
  form.loggingToFile = normalizeBoolean(readValue(config, ['loggingToFile', 'logging-to-file']))
  form.logsMaxTotalSizeMb = normalizeNumber(readValue(config, ['logsMaxTotalSizeMb', 'logs-max-total-size-mb']))
  form.wsAuth = normalizeBoolean(readValue(config, ['wsAuth', 'ws-auth']))

  const quotaExceeded = readValue(config, ['quotaExceeded', 'quota-exceeded']) || {}
  form.quotaSwitchProject = normalizeBoolean(readValue(quotaExceeded, ['switchProject', 'switch-project']))
  form.quotaSwitchPreviewModel = normalizeBoolean(readValue(quotaExceeded, ['switchPreviewModel', 'switch-preview-model']))
}

const loadConfig = async () => {
  loadingConfig.value = true
  try {
    const config = await configApi.getConfig()
    applyConfig(config)
  } catch (error: any) {
    notificationStore.error('加载配置失败: ' + error.message)
  } finally {
    loadingConfig.value = false
  }
}

const normalizeApiKeys = (keys: string[]) => {
  const seen = new Set<string>()
  const list: string[] = []
  keys.forEach((key) => {
    const trimmed = String(key || '').trim()
    if (!trimmed) return
    if (seen.has(trimmed)) return
    seen.add(trimmed)
    list.push(trimmed)
  })
  return list
}

const loadApiKeys = async () => {
  loadingApiKeys.value = true
  try {
    const list = normalizeApiKeys(await apiKeysApi.list())
    apiKeys.value = list
    apiKeysOriginal.value = list.slice()
  } catch (error: any) {
    notificationStore.error('加载 API Keys 失败: ' + error.message)
  } finally {
    loadingApiKeys.value = false
  }
}

const reloadAll = async () => {
  await Promise.all([
    loadConfig(),
    loadApiKeys(),
    loadOauthExcluded(),
    loadOauthAlias()
  ])
}

const setSaving = (key: string, value: boolean) => {
  saving[key] = value
}

const handleSaveProxyUrl = async () => {
  setSaving('proxyUrl', true)
  try {
    const value = form.proxyUrl.trim()
    if (value) {
      await configApi.updateProxyUrl(value)
      form.proxyUrl = value
      notificationStore.success('已更新代理地址')
    } else {
      await configApi.clearProxyUrl()
      form.proxyUrl = ''
      notificationStore.success('已清除代理地址')
    }
  } catch (error: any) {
    notificationStore.error('更新失败: ' + error.message)
  } finally {
    setSaving('proxyUrl', false)
  }
}

const handleClearProxyUrl = async () => {
  if (!form.proxyUrl) return
  setSaving('proxyUrl', true)
  try {
    await configApi.clearProxyUrl()
    form.proxyUrl = ''
    notificationStore.success('已清除代理地址')
  } catch (error: any) {
    notificationStore.error('清除失败: ' + error.message)
  } finally {
    setSaving('proxyUrl', false)
  }
}

const handleSaveRequestRetry = async () => {
  const value = Number(form.requestRetry)
  if (!Number.isFinite(value) || value < 0) {
    notificationStore.warning('请输入有效的重试次数')
    return
  }
  setSaving('requestRetry', true)
  try {
    await configApi.updateRequestRetry(value)
    form.requestRetry = value
    notificationStore.success('已更新重试次数')
  } catch (error: any) {
    notificationStore.error('更新失败: ' + error.message)
  } finally {
    setSaving('requestRetry', false)
  }
}

const handleSaveRoutingStrategy = async () => {
  const value = (form.routingStrategy || '').trim() || 'round-robin'
  setSaving('routingStrategy', true)
  try {
    await configApi.updateRoutingStrategy(value)
    form.routingStrategy = value
    notificationStore.success('已更新路由策略')
  } catch (error: any) {
    notificationStore.error('更新失败: ' + error.message)
  } finally {
    setSaving('routingStrategy', false)
  }
}

const handleSaveLogsMaxSize = async () => {
  const value = Number(form.logsMaxTotalSizeMb)
  if (!Number.isFinite(value) || value < 0) {
    notificationStore.warning('请输入有效的日志大小')
    return
  }
  setSaving('logsMaxTotalSizeMb', true)
  try {
    await configApi.updateLogsMaxTotalSizeMb(value)
    form.logsMaxTotalSizeMb = value
    notificationStore.success('已更新日志大小上限')
  } catch (error: any) {
    notificationStore.error('更新失败: ' + error.message)
  } finally {
    setSaving('logsMaxTotalSizeMb', false)
  }
}

const toggleItems = [
  {
    key: 'debug',
    label: 'Debug 模式',
    description: '输出更多调试日志',
    update: (value: boolean) => configApi.updateDebug(value)
  },
  {
    key: 'usageStatisticsEnabled',
    label: '使用统计',
    description: '收集并展示使用统计',
    update: (value: boolean) => configApi.updateUsageStatistics(value)
  },
  {
    key: 'requestLog',
    label: '请求日志',
    description: '记录请求日志',
    update: (value: boolean) => configApi.updateRequestLog(value)
  },
  {
    key: 'loggingToFile',
    label: '写入日志文件',
    description: '将日志写入文件',
    update: (value: boolean) => configApi.updateLoggingToFile(value)
  },
  {
    key: 'wsAuth',
    label: 'WebSocket 鉴权',
    description: '启用 WebSocket 鉴权',
    update: (value: boolean) => configApi.updateWsAuth(value)
  },
  {
    key: 'quotaSwitchProject',
    label: '配额回退：切项目',
    description: '配额不足时切换项目',
    update: (value: boolean) => configApi.updateSwitchProject(value)
  },
  {
    key: 'quotaSwitchPreviewModel',
    label: '配额回退：预览模型',
    description: '配额不足时切换预览模型',
    update: (value: boolean) => configApi.updateSwitchPreviewModel(value)
  }
] as const

type ToggleItem = typeof toggleItems[number]

const handleToggle = async (item: ToggleItem) => {
  const key = item.key
  if (toggleSaving[key]) return
  const nextValue = Boolean((form as any)[key])
  const prevValue = !nextValue
  toggleSaving[key] = true
  try {
    await item.update(nextValue)
    notificationStore.success('已更新设置')
  } catch (error: any) {
    ;(form as any)[key] = prevValue
    notificationStore.error('更新失败: ' + error.message)
  } finally {
    toggleSaving[key] = false
  }
}

const handleAddApiKey = () => {
  const value = newApiKey.value.trim()
  if (!value) {
    notificationStore.warning('请输入 API Key')
    return
  }
  if (apiKeys.value.includes(value)) {
    notificationStore.warning('该 API Key 已存在')
    return
  }
  apiKeys.value.unshift(value)
  newApiKey.value = ''
}

const handleRemoveApiKey = (index: number) => {
  apiKeys.value.splice(index, 1)
}

const handleSaveApiKeys = async () => {
  if (saving.apiKeys) return
  setSaving('apiKeys', true)
  try {
    const normalized = normalizeApiKeys(apiKeys.value)
    if (normalized.length !== apiKeys.value.length) {
      notificationStore.info('已移除空值或重复项')
    }
    apiKeys.value = normalized
    await apiKeysApi.replace(normalized)
    apiKeysOriginal.value = normalized.slice()
    notificationStore.success('API Keys 已保存')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    setSaving('apiKeys', false)
  }
}

const normalizeModelText = (text: string) => {
  const seen = new Set<string>()
  return text
    .split(/[\n,]+/)
    .map((item) => String(item ?? '').trim())
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
}

const loadOauthExcluded = async () => {
  oauthExcludedLoading.value = true
  oauthExcludedError.value = ''
  try {
    const map = await oauthModelsApi.getOauthExcludedModels()
    oauthExcluded.value = map
    Object.keys(oauthExcludedEdits).forEach((key) => { delete oauthExcludedEdits[key] })
    Object.entries(map).forEach(([provider, list]) => {
      oauthExcludedEdits[provider] = list.join('\n')
    })
  } catch (error: any) {
    oauthExcludedError.value = error.message || '加载失败'
  } finally {
    oauthExcludedLoading.value = false
  }
}

const handleSaveExcluded = async (provider: string) => {
  const normalizedProvider = provider.trim().toLowerCase()
  if (!normalizedProvider) {
    notificationStore.warning('请输入提供商名称')
    return
  }
  if (oauthExcludedSaving[normalizedProvider]) return
  oauthExcludedSaving[normalizedProvider] = true
  try {
    const models = normalizeModelText(oauthExcludedEdits[provider] || '')
    await oauthModelsApi.saveOauthExcludedModels(normalizedProvider, models)
    oauthExcluded.value = { ...oauthExcluded.value, [normalizedProvider]: models }
    oauthExcludedEdits[normalizedProvider] = models.join('\n')
    notificationStore.success('已保存排除模型')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    oauthExcludedSaving[normalizedProvider] = false
  }
}

const handleDeleteExcluded = async (provider: string) => {
  const normalizedProvider = provider.trim().toLowerCase()
  if (!normalizedProvider) return
  if (oauthExcludedSaving[normalizedProvider]) return
  oauthExcludedSaving[normalizedProvider] = true
  try {
    await oauthModelsApi.deleteOauthExcludedEntry(normalizedProvider)
    const next = { ...oauthExcluded.value }
    delete next[normalizedProvider]
    oauthExcluded.value = next
    delete oauthExcludedEdits[normalizedProvider]
    notificationStore.success('已删除排除规则')
  } catch (error: any) {
    notificationStore.error('删除失败: ' + error.message)
  } finally {
    oauthExcludedSaving[normalizedProvider] = false
  }
}

const handleAddExcludedProvider = async () => {
  const provider = newExcludedProvider.value.trim().toLowerCase()
  if (!provider) {
    notificationStore.warning('请输入提供商名称')
    return
  }
  if (oauthExcludedSaving[provider]) return
  oauthExcludedSaving[provider] = true
  try {
    const modelsList = normalizeModelText(newExcludedModels.value)
    await oauthModelsApi.saveOauthExcludedModels(provider, modelsList)
    oauthExcluded.value = { ...oauthExcluded.value, [provider]: modelsList }
    oauthExcludedEdits[provider] = modelsList.join('\n')
    newExcludedProvider.value = ''
    newExcludedModels.value = ''
    notificationStore.success('已添加排除规则')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    oauthExcludedSaving[provider] = false
  }
}

const loadOauthAlias = async () => {
  oauthAliasLoading.value = true
  oauthAliasError.value = ''
  try {
    const map = await oauthModelsApi.getOauthModelAlias()
    oauthAlias.value = map
    Object.keys(oauthAliasEdits).forEach((key) => { delete oauthAliasEdits[key] })
    Object.entries(map).forEach(([channel, list]) => {
      oauthAliasEdits[channel] = list.map((entry) => ({ ...entry }))
    })
  } catch (error: any) {
    oauthAliasError.value = error.message || '加载失败'
  } finally {
    oauthAliasLoading.value = false
  }
}

const normalizeAliasEntries = (entries: OAuthModelAliasEntry[]) => {
  const seen = new Set<string>()
  const normalized: OAuthModelAliasEntry[] = []
  entries.forEach((entry) => {
    const name = String(entry.name ?? '').trim()
    const alias = String(entry.alias ?? '').trim()
    if (!name || !alias) return
    const fork = entry.fork === true
    const key = `${name.toLowerCase()}::${alias.toLowerCase()}::${fork ? '1' : '0'}`
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(fork ? { name, alias, fork } : { name, alias })
  })
  return normalized
}

const handleSaveAlias = async (channel: string) => {
  const normalizedChannel = channel.trim().toLowerCase()
  if (!normalizedChannel) {
    notificationStore.warning('请输入渠道名称')
    return
  }
  if (oauthAliasSaving[normalizedChannel]) return
  oauthAliasSaving[normalizedChannel] = true
  try {
    const entries = normalizeAliasEntries(oauthAliasEdits[channel] || [])
    await oauthModelsApi.saveOauthModelAlias(normalizedChannel, entries)
    oauthAlias.value = { ...oauthAlias.value, [normalizedChannel]: entries }
    oauthAliasEdits[normalizedChannel] = entries.map((entry) => ({ ...entry }))
    notificationStore.success('已保存模型别名')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    oauthAliasSaving[normalizedChannel] = false
  }
}

const handleDeleteAlias = async (channel: string) => {
  const normalizedChannel = channel.trim().toLowerCase()
  if (!normalizedChannel) return
  if (oauthAliasSaving[normalizedChannel]) return
  oauthAliasSaving[normalizedChannel] = true
  try {
    await oauthModelsApi.deleteOauthModelAlias(normalizedChannel)
    const next = { ...oauthAlias.value }
    delete next[normalizedChannel]
    oauthAlias.value = next
    delete oauthAliasEdits[normalizedChannel]
    notificationStore.success('已删除别名规则')
  } catch (error: any) {
    notificationStore.error('删除失败: ' + error.message)
  } finally {
    oauthAliasSaving[normalizedChannel] = false
  }
}

const handleAddAliasChannel = async () => {
  const channel = newAliasChannel.value.trim().toLowerCase()
  if (!channel) {
    notificationStore.warning('请输入渠道名称')
    return
  }
  if (oauthAliasSaving[channel]) return
  oauthAliasSaving[channel] = true
  try {
    const entries = normalizeAliasEntries(newAliasEntries.value)
    await oauthModelsApi.saveOauthModelAlias(channel, entries)
    oauthAlias.value = { ...oauthAlias.value, [channel]: entries }
    oauthAliasEdits[channel] = entries.map((entry) => ({ ...entry }))
    newAliasChannel.value = ''
    newAliasEntries.value = [{ name: '', alias: '' }]
    notificationStore.success('已添加模型别名')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    oauthAliasSaving[channel] = false
  }
}

const handleAddAliasEntry = (channel: string) => {
  if (!oauthAliasEdits[channel]) {
    oauthAliasEdits[channel] = []
  }
  oauthAliasEdits[channel].push({ name: '', alias: '' })
}

const handleRemoveAliasEntry = (channel: string, index: number) => {
  oauthAliasEdits[channel]?.splice(index, 1)
}

const normalizeApiBase = (input: string) => {
  let base = String(input || '').trim()
  if (!base) return ''
  base = base.replace(/\/?v0\/management\/?$/i, '')
  base = base.replace(/\/+$/g, '')
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`
  }
  return base
}


const normalizeModelList = (payload: any): string[] => {
  const raw = payload?.data ?? payload?.models ?? payload
  const list: string[] = []
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item) return
      if (typeof item === 'string') {
        list.push(item)
        return
      }
      const id = item.id ?? item.name ?? item.model
      if (id) list.push(String(id))
    })
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((key) => list.push(String(key)))
  }
  const seen = new Set<string>()
  return list
    .map((m) => String(m).trim())
    .filter((m) => m && !seen.has(m) && seen.add(m))
    .sort((a, b) => a.localeCompare(b))
}

const handleFetchModels = async () => {
  modelsError.value = ''
  models.value = []
  if (!authStore.isConnected || !authStore.apiUrl) {
    modelsError.value = '未连接到服务器'
    return
  }
  if (apiKeys.value.length === 0) {
    modelsError.value = '需要至少一个 API Key 才能拉取模型'
    return
  }
  const base = normalizeApiBase(authStore.apiUrl)
  if (!base) {
    modelsError.value = 'API 地址无效'
    return
  }
  modelsLoading.value = true
  try {
    const response = await axios.get(`${base}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKeys.value[0]}`
      }
    })
    models.value = normalizeModelList(response.data)
    modelsCached.value = true
  } catch (error: any) {
    modelsError.value = error.message || '拉取失败'
  } finally {
    modelsLoading.value = false
  }
}

const loadModelsOnce = async () => {
  if (modelsCached.value) return
  await handleFetchModels()
}

onMounted(async () => {
  await reloadAll()
  await loadModelsOnce()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">设置</h2>
        <p class="text-sm text-muted-foreground">基础设置、API Keys 与模型配置</p>
      </div>
      <Button variant="outline" size="sm" @click="reloadAll" :disabled="loadingConfig || loadingApiKeys">
        <RefreshCw class="mr-2 h-4 w-4" :class="(loadingConfig || loadingApiKeys) && 'animate-spin'" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>基础设置</CardTitle>
          <CardDescription>常用运行参数与日志开关</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-2">
            <Label>全局 Proxy URL</Label>
            <div class="flex flex-col sm:flex-row gap-2">
              <Input v-model="form.proxyUrl" placeholder="http://proxy:7890" />
              <div class="flex gap-2">
                <Button size="sm" @click="handleSaveProxyUrl" :disabled="loadingConfig || saving.proxyUrl">
                  <Loader2 v-if="saving.proxyUrl" class="mr-2 h-4 w-4 animate-spin" />
                  保存
                </Button>
                <Button size="sm" variant="outline" @click="handleClearProxyUrl" :disabled="loadingConfig || saving.proxyUrl">
                  清除
                </Button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">留空表示不使用全局代理</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>请求重试次数</Label>
              <div class="flex items-center gap-2">
                <Input v-model.number="form.requestRetry" type="number" min="0" placeholder="0" />
                <Button size="sm" variant="outline" @click="handleSaveRequestRetry" :disabled="loadingConfig || saving.requestRetry">
                  保存
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>路由策略</Label>
              <div class="flex items-center gap-2">
                <Select v-model="form.routingStrategy">
                  <option value="round-robin">Round Robin</option>
                  <option value="fill-first">Fill First</option>
                </Select>
                <Button size="sm" variant="outline" @click="handleSaveRoutingStrategy" :disabled="loadingConfig || saving.routingStrategy">
                  保存
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>日志总大小上限（MB）</Label>
              <div class="flex items-center gap-2">
                <Input v-model.number="form.logsMaxTotalSizeMb" type="number" min="0" placeholder="0" />
                <Button size="sm" variant="outline" @click="handleSaveLogsMaxSize" :disabled="loadingConfig || saving.logsMaxTotalSizeMb">
                  保存
                </Button>
              </div>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="item in toggleItems"
              :key="item.key"
              class="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div class="space-y-0.5">
                <div class="text-sm font-medium">{{ item.label }}</div>
                <div class="text-xs text-muted-foreground">{{ item.description }}</div>
              </div>
              <input
                type="checkbox"
                class="h-4 w-4 accent-primary"
                :disabled="loadingConfig || toggleSaving[item.key]"
                v-model="(form as any)[item.key]"
                @change="handleToggle(item)"
              />
            </div>
          </div>

          <div v-if="loadingConfig" class="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
            加载配置中...
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>管理代理对外的 api-keys</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-col sm:flex-row gap-2">
            <Input v-model="newApiKey" placeholder="sk-..." class="font-mono" />
            <Button size="sm" @click="handleAddApiKey">
              <Plus class="mr-2 h-4 w-4" />
              添加
            </Button>
            <Button size="sm" variant="outline" @click="showApiKeys = !showApiKeys">
              <component :is="showApiKeys ? EyeOff : Eye" class="mr-2 h-4 w-4" />
              {{ showApiKeys ? '隐藏' : '显示' }}
            </Button>
          </div>

          <div v-if="loadingApiKeys" class="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
            加载 API Keys 中...
          </div>
          <div v-else-if="apiKeys.length === 0" class="text-sm text-muted-foreground">
            暂无 API Keys
          </div>
          <div v-else class="space-y-2">
            <div v-for="(key, index) in apiKeys" :key="`${key}-${index}`" class="flex items-center gap-2">
              <Input
                v-model="apiKeys[index]"
                :type="showApiKeys ? 'text' : 'password'"
                class="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="handleRemoveApiKey(index)"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <div class="text-xs text-muted-foreground">共 {{ apiKeys.length }} 个</div>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="outline" @click="loadApiKeys" :disabled="loadingApiKeys || saving.apiKeys">
                <RefreshCw class="mr-2 h-4 w-4" :class="loadingApiKeys && 'animate-spin'" />
                重载
              </Button>
              <Button size="sm" @click="handleSaveApiKeys" :disabled="loadingApiKeys || saving.apiKeys || !apiKeysDirty">
                <Loader2 v-if="saving.apiKeys" class="mr-2 h-4 w-4 animate-spin" />
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle>模型配置</CardTitle>
          <CardDescription>OAuth 排除模型、模型别名与可用模型信息</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">可用模型</div>
              <Button size="sm" variant="outline" @click="handleFetchModels" :disabled="modelsLoading">
                <RefreshCw class="mr-2 h-4 w-4" :class="modelsLoading && 'animate-spin'" />
                刷新模型
              </Button>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">排除规则 {{ excludedCount }}</Badge>
              <Badge variant="outline">别名规则 {{ aliasCount }}</Badge>
              <span v-if="models.length">模型总数 {{ models.length }}</span>
            </div>
            <div v-if="modelsLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 class="h-4 w-4 animate-spin" />
              拉取中...
            </div>
            <div v-else-if="modelsError" class="text-xs text-red-600">{{ modelsError }}</div>
            <div v-else-if="models.length === 0" class="text-xs text-muted-foreground">
              暂无模型数据
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <Badge v-for="model in models" :key="model" variant="outline" class="font-mono text-[10px]">
                {{ model }}
              </Badge>
            </div>
            <div class="text-[11px] text-muted-foreground">
              使用第一个 API Key 拉取 /v1/models
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">OAuth 模型别名</div>
                <Button size="sm" variant="outline" @click="loadOauthAlias" :disabled="oauthAliasLoading">
                  <RefreshCw class="mr-2 h-4 w-4" :class="oauthAliasLoading && 'animate-spin'" />
                  刷新
                </Button>
              </div>

              <div class="space-y-2">
                <Label>新增别名规则</Label>
                <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input v-model="newAliasChannel" placeholder="channel，如 codex / gemini-cli" />
                  <Button size="sm" @click="handleAddAliasChannel">保存</Button>
                </div>
                <div class="space-y-2">
                  <div v-for="(entry, index) in newAliasEntries" :key="`new-${index}`" class="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                    <Input v-model="entry.name" placeholder="源模型" list="model-options" />
                    <Input v-model="entry.alias" placeholder="别名" />
                    <label class="flex items-center gap-1 text-xs text-muted-foreground">
                      <input type="checkbox" v-model="entry.fork" class="h-3.5 w-3.5 accent-primary" />
                      fork
                    </label>
                    <Button size="sm" variant="ghost" class="text-muted-foreground" @click="newAliasEntries.splice(index, 1)">
                      <X class="h-4 w-4" />
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" @click="newAliasEntries.push({ name: '', alias: '' })">
                    <Plus class="mr-2 h-3.5 w-3.5" />
                    添加映射
                  </Button>
                </div>
              </div>

              <div v-if="oauthAliasLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 class="h-4 w-4 animate-spin" />
                加载别名规则中...
              </div>
              <div v-else-if="oauthAliasError" class="text-xs text-red-600">{{ oauthAliasError }}</div>
              <div v-else-if="Object.keys(oauthAliasEdits).length === 0" class="text-sm text-muted-foreground">
                暂无别名规则
              </div>
              <div v-else class="space-y-3">
                <div v-for="(entries, channel) in oauthAliasEdits" :key="channel" class="rounded-md border p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-medium">{{ channel }}</div>
                    <div class="flex items-center gap-2">
                      <Button size="sm" variant="outline" @click="handleSaveAlias(channel)" :disabled="oauthAliasSaving[channel]">
                        保存
                      </Button>
                      <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDeleteAlias(channel)" :disabled="oauthAliasSaving[channel]">
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div v-for="(entry, index) in entries" :key="`${channel}-${index}`" class="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <Input v-model="entry.name" placeholder="源模型" list="model-options" />
                      <Input v-model="entry.alias" placeholder="别名" />
                      <label class="flex items-center gap-1 text-xs text-muted-foreground">
                        <input type="checkbox" v-model="entry.fork" class="h-3.5 w-3.5 accent-primary" />
                        fork
                      </label>
                      <Button size="sm" variant="ghost" class="text-muted-foreground" @click="handleRemoveAliasEntry(channel, index)">
                        <X class="h-4 w-4" />
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" @click="handleAddAliasEntry(channel)">
                      <Plus class="mr-2 h-3.5 w-3.5" />
                      添加映射
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">OAuth 排除模型</div>
                <Button size="sm" variant="outline" @click="loadOauthExcluded" :disabled="oauthExcludedLoading">
                  <RefreshCw class="mr-2 h-4 w-4" :class="oauthExcludedLoading && 'animate-spin'" />
                  刷新
                </Button>
              </div>

              <div class="space-y-2">
                <Label>新增排除规则</Label>
                <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input v-model="newExcludedProvider" placeholder="provider，如 codex / gemini-cli" />
                  <Button size="sm" @click="handleAddExcludedProvider">添加</Button>
                </div>
                <textarea
                  v-model="newExcludedModels"
                  class="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                  placeholder="模型名称，一行一个或用逗号分隔"
                ></textarea>
              </div>

              <div v-if="oauthExcludedLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 class="h-4 w-4 animate-spin" />
                加载排除规则中...
              </div>
              <div v-else-if="oauthExcludedError" class="text-xs text-red-600">{{ oauthExcludedError }}</div>
              <div v-else-if="Object.keys(oauthExcludedEdits).length === 0" class="text-sm text-muted-foreground">
                暂无排除规则
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="(_text, provider) in oauthExcludedEdits"
                  :key="provider"
                  class="rounded-md border p-3 space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-medium">{{ provider }}</div>
                    <div class="flex items-center gap-2">
                      <Button size="sm" variant="outline" @click="handleSaveExcluded(provider)" :disabled="oauthExcludedSaving[provider]">
                        保存
                      </Button>
                      <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDeleteExcluded(provider)" :disabled="oauthExcludedSaving[provider]">
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <textarea
                    v-model="oauthExcludedEdits[provider]"
                    class="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                    placeholder="模型名称，一行一个或用逗号分隔"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    <datalist id="model-options">
      <option v-for="model in models" :key="`opt-${model}`" :value="model" />
    </datalist>
  </div>
</template>
