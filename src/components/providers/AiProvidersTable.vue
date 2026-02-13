<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, Teleport, Transition } from 'vue'
import {
  Search,
  RefreshCw,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Edit,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-vue-next'
import { useProviders } from '../../composables/useProviders'
import { useNotificationStore } from '../../stores/notification'
import { useConfigStore } from '../../stores/config'
import { cn } from '../../lib/utils'
import { providersApi, type ProviderType } from '../../api/providers'
import { fetchQuotaByType } from '../../api/quota'
import { useQuotaStore, quotaKey } from '../../stores/quota'
import { generateAvailabilityPointsFromUsage, type UsageDetail } from '../../utils/availability'
import { getProviderDisplayName } from '../../config/constants'
import { usePagination } from '../../composables/usePagination'
import { useTableSelection } from '../../composables/useTableSelection'
import { useUsageStore } from '../../stores/usage'

// UI Components
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Label from '../ui/Label.vue'
import Badge from '../ui/badge/Badge.vue'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../ui/table'
import Dialog from '../ui/dialog/Dialog.vue'
import AvailabilityMonitor from '../auth/AvailabilityMonitor.vue'

const notificationStore = useNotificationStore()
const configStore = useConfigStore()
const quotaStore = useQuotaStore()

const {
  geminiProviders,
  claudeProviders,
  codexProviders,
  vertexProviders,
  openaiProviders,
  loading,
  loadAll,
  deleteProvider,
  toggleProvider
} = useProviders()
// Local State
const searchText = ref('')
const filterType = ref('')
const toggleLoadingMap = ref<Record<string, boolean>>({})
const deleting = ref<string | null>(null)

// Dialog states
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const editingProvider = ref<any>(null)
const editingProviderKey = ref<string | null>(null)

// Add form
const addForm = ref({
  type: 'gemini' as ProviderType,
  apiKey: '',
  name: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  priority: 0,
  headers: [] as Array<{ key: string; value: string }>,
  excludedModelsText: ''
})

// Edit form
const editForm = ref({
  apiKey: '',
  name: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  priority: 0,
  headers: [] as Array<{ key: string; value: string }>,
  excludedModelsText: ''
})

// Usage data
const usageStore = useUsageStore()
const usageDetails = computed(() => usageStore.usageDetails)
const getProviderQuotaKey = (provider: any) => quotaKey.provider(provider.type, provider.identifier || provider.name || provider.apiKey || '')

// Provider type config for data-driven allProviders
const PROVIDER_TYPE_CONFIG: Record<ProviderType, { supportsQuota: boolean; supportsToggle: boolean }> = {
  gemini:  { supportsQuota: true,  supportsToggle: true },
  claude:  { supportsQuota: false, supportsToggle: true },
  codex:   { supportsQuota: true,  supportsToggle: true },
  vertex:  { supportsQuota: false, supportsToggle: false },
  openai:  { supportsQuota: false, supportsToggle: false },
}

// Computed
const allProviders = computed(() => {
  const providerRefs: Record<ProviderType, any> = {
    gemini: geminiProviders, claude: claudeProviders, codex: codexProviders,
    vertex: vertexProviders, openai: openaiProviders
  }
  const result: any[] = []

  for (const [type, ref] of Object.entries(providerRefs) as [ProviderType, any][]) {
    const config = PROVIDER_TYPE_CONFIG[type]
    ref.value.forEach((p: any) => {
      const isEnabled = config.supportsToggle ? !p.excludedModels?.includes('*') : true
      result.push({
        ...p,
        type,
        identifier: type === 'openai' ? p.name : (p.apiKey || p.name),
        displayName: p.name || `${getProviderDisplayName(type)} (${maskApiKey(p.apiKey)})`,
        enabled: isEnabled,
        supportsQuota: config.supportsQuota
      })
    })
  }
  return result
})
const availableTypes = computed(() => {
  const types = new Set<string>()
  allProviders.value.forEach(p => types.add(p.type))
  return Array.from(types)
})

const filteredData = computed(() => {
  return allProviders.value.filter(provider => {
    const matchType = !filterType.value || provider.type === filterType.value
    const term = searchText.value.trim().toLowerCase()
    const matchSearch = !term ||
      provider.displayName?.toLowerCase().includes(term) ||
      provider.type?.toLowerCase().includes(term) ||
      provider.identifier?.toLowerCase().includes(term)
    return matchType && matchSearch
  })
})

type ProviderSortKey = 'type' | 'name' | 'apiKey' | 'status'

const sortKey = ref<ProviderSortKey | ''>('')
const sortOrder = ref<'asc' | 'desc'>('asc')
const sortCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

const toggleSort = (key: ProviderSortKey) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const getSortValue = (provider: any, key: ProviderSortKey) => {
  switch (key) {
    case 'type':
      return provider.type ?? ''
    case 'name':
      return provider.displayName ?? ''
    case 'apiKey':
      return provider.apiKey ?? ''
    case 'status':
      return provider.enabled ? 1 : 0
    default:
      return ''
  }
}

const compareSortValues = (a: any, b: any) => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return sortCollator.compare(String(a), String(b))
}

const sortedData = computed(() => {
  const data = filteredData.value.slice()
  if (!sortKey.value) return data
  const key = sortKey.value
  const dir = sortOrder.value === 'asc' ? 1 : -1
  return data.sort((a, b) => {
    const primary = compareSortValues(getSortValue(a, key), getSortValue(b, key))
    if (primary !== 0) return primary * dir
    return sortCollator.compare(String(a.displayName ?? ''), String(b.displayName ?? ''))
  })
})

// Shared composables
const { currentPage, pageSize, totalItems, totalPages, paginatedData } = usePagination(sortedData, {
  defaultPageSize: 20,
  pageSizeOptions: [10, 20, 50, 100],
  resetWatchers: [searchText, filterType, sortKey, sortOrder]
})

const { selectedItems: selectedProviders, allSelected, isSelected, toggleSelection, toggleSelectAll, clearSelection } = useTableSelection(paginatedData, 'identifier' as any)

// Methods
const handleDelete = async (provider: any) => {
  const confirmed = await notificationStore.showConfirmation({
    title: '删除提供商',
    message: `确定要删除 "${provider.displayName}" 吗？`,
    variant: 'danger'
  })
  if (!confirmed) return

  deleting.value = provider.identifier
  try {
    await deleteProvider(provider.type, provider.identifier)
    await loadAll()
    notificationStore.success('删除成功')
  } catch (error: any) {
    notificationStore.error('删除失败: ' + error.message)
  } finally {
    deleting.value = null
  }
}
const handleBatchDelete = async () => {
  const providers = selectedProviders.value
  if (!providers.length) return

  const confirmed = await notificationStore.showConfirmation({
    title: '批量删除',
    message: `确定要删除选中的 ${providers.length} 个提供商吗？`,
    variant: 'danger'
  })
  if (!confirmed) return

  let successCount = 0
  let failCount = 0
  for (const provider of providers) {
    try {
      await deleteProvider(provider.type, provider.identifier)
      successCount++
    } catch { failCount++ }
  }

  clearSelection()
  await loadAll()

  if (failCount > 0) {
    notificationStore.warning(`批量删除完成：成功 ${successCount} 个，失败 ${failCount} 个`)
  } else {
    notificationStore.success(`成功删除 ${successCount} 个提供商`)
  }
}

const handleEdit = (provider: any) => {
  editingProvider.value = provider
  editingProviderKey.value = provider.identifier || provider.name || provider.apiKey || null
  const headersArray = provider.headers
    ? Object.entries(provider.headers).map(([key, value]) => ({ key, value: String(value) }))
    : []
  editForm.value = {
    apiKey: provider.apiKey || '',
    name: provider.name || '',
    prefix: provider.prefix || '',
    baseUrl: provider.baseUrl || '',
    proxyUrl: provider.proxyUrl || '',
    priority: provider.priority || 0,
    headers: headersArray,
    excludedModelsText: (provider.excludedModels || []).join('\n')
  }
  showEditDialog.value = true
}

const handleToggleStatus = async (provider: any) => {
  const newEnabled = !provider.enabled
  toggleLoadingMap.value[provider.identifier] = true
  try {
    await toggleProvider(provider.type, provider.apiKey, newEnabled)
    await loadAll()
    notificationStore.success(newEnabled ? '已启用' : '已禁用')
  } catch (error: any) {
    notificationStore.error(`切换状态失败: ${error.message}`)
  } finally {
    delete toggleLoadingMap.value[provider.identifier]
  }
}

const handleAdd = () => {
  addForm.value = {
    type: 'gemini', apiKey: '', name: '', prefix: '', baseUrl: '',
    proxyUrl: '', priority: 0, headers: [], excludedModelsText: ''
  }
  showAddDialog.value = true
}
const parseFormConfig = (form: typeof editForm.value) => {
  const excludedModels = form.excludedModelsText.split('\n').map(l => l.trim()).filter(Boolean)
  const headers: Record<string, string> = {}
  form.headers.forEach(h => {
    if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim()
  })
  const priorityValue = Number.isFinite(form.priority) ? form.priority : undefined
  return {
    apiKey: form.apiKey.trim(),
    name: form.name?.trim() || undefined,
    prefix: form.prefix?.trim() || undefined,
    baseUrl: form.baseUrl?.trim() || undefined,
    proxyUrl: form.proxyUrl?.trim() || undefined,
    priority: priorityValue,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    excludedModels: excludedModels.length > 0 ? excludedModels : undefined
  }
}

const handleSaveAdd = async () => {
  if (!addForm.value.apiKey.trim()) {
    notificationStore.warning('请输入 API Key')
    return
  }
  try {
    const type = addForm.value.type
    const config = parseFormConfig(addForm.value)
    const configs = await providersApi.getProviders(type)

    // Check duplicates
    if (type === 'openai') {
      const name = config.name || 'OpenAI Provider'
      if (configs.some(c => c.name === name)) {
        notificationStore.warning('该名称已存在')
        return
      }
      configs.push({ ...config, name } as any)
    } else {
      if (configs.some(c => c.apiKey === config.apiKey)) {
        notificationStore.warning('该 API Key 已存在')
        return
      }
      configs.push(config as any)
    }

    await configStore.saveProviders(type, configs)
    showAddDialog.value = false
    await loadAll()
    notificationStore.success('添加成功')
  } catch (error: any) {
    notificationStore.error('添加失败: ' + error.message)
  }
}

const handleSaveEdit = async () => {
  if (!editingProvider.value) return
  try {
    const type = editingProvider.value.type as ProviderType
    const originalKey = editingProviderKey.value
    const configs = await providersApi.getProviders(type)

    if (!originalKey) throw new Error('配置未找到')
    const index = configs.findIndex((c: any) => (
      type === 'openai' ? c.name === originalKey : c.apiKey === originalKey
    ))
    if (index === -1) throw new Error('配置未找到')

    const updates = parseFormConfig(editForm.value)
    if (type === 'openai') {
      const nextName = updates.name || configs[index].name || originalKey
      if (configs.some((c: any, i: number) => i !== index && c.name === nextName)) {
        notificationStore.warning('该名称已存在')
        return
      }
      updates.name = nextName
    }
    configs[index] = { ...configs[index], ...updates } as any
    await configStore.saveProviders(type, configs)

    showEditDialog.value = false
    editingProvider.value = null
    editingProviderKey.value = null
    await loadAll()
    notificationStore.success('保存成功')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  }
}

const handleRefreshQuota = async (provider: any) => {
  if (!provider.supportsQuota) return
  const key = getProviderQuotaKey(provider)
  quotaStore.setLoading(key, true)
  try {
    const mockFile = { name: provider.identifier, type: provider.type, apiKey: provider.apiKey }
    const result = await fetchQuotaByType(mockFile)
    quotaStore.setQuota(key, result.type, result.data)
  } catch (error: any) {
    quotaStore.setQuotaError(key, error.message)
  }
}

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    gemini: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    claude: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    codex: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    vertex: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    openai: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
  }
  return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
}

const maskApiKey = (key: string | undefined) => {
  if (!key) return '-'
  if (key.length <= 8) return '***'
  return key.substring(0, 4) + '***' + key.substring(key.length - 4)
}

const getProviderStats = (provider: any) => {
  if (!provider.apiKey || usageDetails.value.length === 0) {
    return { success: 0, failure: 0, total: 0 }
  }
  const apiKeySuffix = provider.apiKey.slice(-8).toLowerCase()
  let success = 0, failure = 0
  usageDetails.value.forEach((detail: UsageDetail) => {
    const source = detail.source?.toLowerCase() || ''
    if (source.includes(apiKeySuffix) || source.includes(provider.apiKey.toLowerCase())) {
      detail.failed ? failure++ : success++
    }
  })
  return { success, failure, total: success + failure }
}

const getAvailabilityPoints = (provider: any) => {
  if (!provider.apiKey || usageDetails.value.length === 0) return []
  // Filter usage details matching this provider by source field
  const apiKeySuffix = provider.apiKey.slice(-8).toLowerCase()
  const matched = usageDetails.value.filter((d: UsageDetail) => {
    const source = d.source?.toLowerCase() || ''
    return source.includes(apiKeySuffix) || source.includes(provider.apiKey.toLowerCase())
  })
  return generateAvailabilityPointsFromUsage(matched)
}

const formatUpdatedAt = (timestamp: number | null) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const getProviderCacheInfo = (provider: any) => {
  const key = getProviderQuotaKey(provider)
  const updatedAt = quotaStore.getUpdatedAt(key)
  if (!updatedAt) return null
  return {
    updatedAt,
    expired: quotaStore.isExpired(key)
  }
}

onMounted(() => {
  loadAll()
  usageStore.fetchUsage()
  usageStore.startPolling()
})

onUnmounted(() => {
  usageStore.stopPolling()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex w-full sm:w-auto items-center gap-2 flex-wrap">
        <div class="relative w-full sm:w-64">
          <Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="searchText"
            placeholder="搜索提供商..."
            class="pl-8"
          />
        </div>
        <select
          v-model="filterType"
          class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">所有类型</option>
          <option v-for="type in availableTypes" :key="type" :value="type">
            {{ getProviderDisplayName(type) }}
          </option>
        </select>
        <Button variant="outline" size="icon" @click="loadAll" :disabled="loading" title="刷新列表">
          <RefreshCw :class="cn('h-4 w-4', loading && 'animate-spin')" />
        </Button>
      </div>
      <Button @click="handleAdd">
        <Plus class="mr-2 h-4 w-4" />
        添加提供商
      </Button>
    </div>

    <!-- Batch Actions (floating bottom bar) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
      >
        <div v-if="selectedProviders.length > 0" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg p-2 px-5">
          <div class="text-sm text-muted-foreground whitespace-nowrap">
            已选择 <strong>{{ selectedProviders.length }}</strong> 项
            <button class="ml-2 text-primary hover:underline" @click="clearSelection">清除</button>
          </div>
          <div class="h-4 w-px bg-border" />
          <div class="flex items-center gap-1.5">
            <Button size="sm" variant="destructive" @click="handleBatchDelete">
              <Trash2 class="mr-1.5 h-3.5 w-3.5" />
              批量删除
            </Button>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- Table -->
    <div class="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[40px]">
              <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" class="translate-y-[2px] accent-primary" />
            </TableHead>
            <TableHead class="w-[100px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('type')">
                <span>类型</span>
                <ArrowUpDown v-if="sortKey !== 'type'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[180px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('name')">
                <span>名称</span>
                <ArrowUpDown v-if="sortKey !== 'name'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[120px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('apiKey')">
                <span>API Key</span>
                <ArrowUpDown v-if="sortKey !== 'apiKey'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[80px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('status')">
                <span>状态</span>
                <ArrowUpDown v-if="sortKey !== 'status'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[280px]">可用性监控</TableHead>
            <TableHead class="w-[150px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && allProviders.length === 0">
             <TableCell colspan="7" class="h-24 text-center">
                <Loader2 class="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
             </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredData.length === 0">
             <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
                没有找到提供商。
             </TableCell>
          </TableRow>
          <TableRow v-for="provider in paginatedData" :key="provider.identifier">
            <TableCell>
              <input type="checkbox" :checked="isSelected(provider)" @change="toggleSelection(provider)" class="translate-y-[2px] accent-primary" />
            </TableCell>
            <TableCell>
              <Badge :class="getTypeColor(provider.type)" variant="outline" class="font-normal">
                {{ getProviderDisplayName(provider.type) }}
              </Badge>
            </TableCell>
            <TableCell>
              <div class="flex flex-col gap-1">
                <span class="font-medium text-foreground">{{ provider.displayName }}</span>
                <span v-if="provider.prefix" class="text-xs text-muted-foreground">前缀: {{ provider.prefix }}</span>
              </div>
            </TableCell>
            <TableCell>
              <span class="font-mono text-xs text-muted-foreground">{{ maskApiKey(provider.apiKey) }}</span>
            </TableCell>
            <TableCell>
              <Badge :variant="provider.enabled ? 'default' : 'secondary'">
                {{ provider.enabled ? '启用' : '禁用' }}
              </Badge>
            </TableCell>
            <TableCell>
              <div class="flex flex-col gap-1">
                <AvailabilityMonitor :points="getAvailabilityPoints(provider)" :compact="true" :showStats="false" />
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-green-600 dark:text-green-400">✓ {{ getProviderStats(provider).success }}</span>
                  <span class="text-red-600 dark:text-red-400">✗ {{ getProviderStats(provider).failure }}</span>
                </div>
                <div v-if="provider.supportsQuota && getProviderCacheInfo(provider)" class="text-[10px] text-muted-foreground">
                  更新: {{ formatUpdatedAt(getProviderCacheInfo(provider)?.updatedAt || null) }}
                  <span v-if="getProviderCacheInfo(provider)?.expired" class="text-amber-600 dark:text-amber-400">待更新</span>
                </div>
                <button
                  v-if="provider.supportsQuota"
                  @click="handleRefreshQuota(provider)"
                  class="text-left text-primary hover:underline text-xs"
                  :disabled="quotaStore.isLoading(getProviderQuotaKey(provider))"
                >
                  {{ quotaStore.isLoading(getProviderQuotaKey(provider)) ? '查询中...' : '查询配额' }}
                </button>
              </div>
            </TableCell>
            <TableCell>
              <div class="flex items-center gap-1 flex-wrap">
                <Button
                  v-if="PROVIDER_TYPE_CONFIG[provider.type as ProviderType]?.supportsToggle"
                  size="sm" variant="ghost" class="h-6 px-2 text-xs"
                  @click="handleToggleStatus(provider)"
                  :disabled="toggleLoadingMap[provider.identifier]"
                >
                  {{ provider.enabled ? '禁用' : '启用' }}
                </Button>
                <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleEdit(provider)">
                  <Edit class="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  class="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  @click="handleDelete(provider)" :disabled="deleting === provider.identifier"
                >
                  <Trash2 class="h-3 w-3" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <!-- Pagination -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 py-2" v-if="totalItems > 0">
      <div class="text-sm text-muted-foreground">
        显示 {{ (currentPage - 1) * pageSize + 1 }} 到 {{ Math.min(currentPage * pageSize, totalItems) }} 共 {{ totalItems }} 项
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">每页:</span>
          <select
            v-model="pageSize"
            class="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <Button variant="outline" size="icon" class="h-8 w-8" :disabled="currentPage === 1" @click="currentPage = 1">
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-8 w-8" :disabled="currentPage === 1" @click="currentPage--">
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div class="flex items-center gap-1 px-2">
             <span class="text-sm font-medium">{{ currentPage }}</span>
             <span class="text-sm text-muted-foreground">/ {{ totalPages }}</span>
          </div>
          <Button variant="outline" size="icon" class="h-8 w-8" :disabled="currentPage === totalPages" @click="currentPage++">
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" class="h-8 w-8" :disabled="currentPage === totalPages" @click="currentPage = totalPages">
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
    <!-- Add Provider Dialog -->
    <Dialog :open="showAddDialog" @update:open="showAddDialog = $event" title="添加 AI 提供商">
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label>提供商类型</Label>
          <select
            v-model="addForm.type"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
            <option value="vertex">Vertex AI</option>
            <option value="openai">OpenAI Compatible</option>
          </select>
        </div>
        <div class="grid gap-2">
          <Label>API Key *</Label>
          <Input v-model="addForm.apiKey" placeholder="sk-..." />
        </div>
        <div class="grid gap-2">
          <Label>名称（可选）</Label>
          <Input v-model="addForm.name" placeholder="自定义名称" />
        </div>
        <div class="grid gap-2">
          <Label>前缀（可选）</Label>
          <Input v-model="addForm.prefix" placeholder="gemini/" />
        </div>
        <div class="grid gap-2">
          <Label>Base URL（可选）</Label>
          <Input v-model="addForm.baseUrl" placeholder="https://api.example.com" />
        </div>
        <div class="grid gap-2">
          <Label>Proxy URL（可选）</Label>
          <Input v-model="addForm.proxyUrl" placeholder="http://proxy:7890" />
        </div>
        <div class="grid gap-2">
          <Label>优先级（可选）</Label>
          <Input v-model.number="addForm.priority" type="number" placeholder="0" />
        </div>
        <div class="grid gap-2">
          <Label>自定义 Headers（可选）</Label>
          <div class="space-y-2">
            <div v-for="(header, index) in addForm.headers" :key="index" class="flex items-center gap-2">
              <Input v-model="header.key" placeholder="Header 名称" class="flex-1" />
              <Input v-model="header.value" placeholder="Header 值" class="flex-1" />
              <Button size="sm" variant="ghost" @click="addForm.headers.splice(index, 1)">
                <X class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addForm.headers.push({ key: '', value: '' })">
              <Plus class="mr-2 h-3.5 w-3.5" />
              添加 Header
            </Button>
          </div>
        </div>
        <div class="grid gap-2" v-if="PROVIDER_TYPE_CONFIG[addForm.type]?.supportsToggle">
          <Label>排除的模型（每行一个）</Label>
          <textarea
            v-model="addForm.excludedModelsText"
            class="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="模型名称，使用 * 禁用所有模型"
          ></textarea>
          <p class="text-xs text-muted-foreground">使用 * 禁用所有模型</p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showAddDialog = false">取消</Button>
        <Button @click="handleSaveAdd">添加</Button>
      </div>
    </Dialog>
    <!-- Edit Provider Dialog -->
    <Dialog :open="showEditDialog" @update:open="showEditDialog = $event" :title="`编辑 ${editingProvider?.displayName || '提供商'}`">
      <div class="grid gap-4 py-4" v-if="editingProvider">
        <div class="grid gap-2">
          <Label>API Key</Label>
          <Input v-model="editForm.apiKey" placeholder="sk-..." />
        </div>
        <div class="grid gap-2">
          <Label>名称（可选）</Label>
          <Input v-model="editForm.name" placeholder="自定义名称" />
        </div>
        <div class="grid gap-2">
          <Label>前缀（可选）</Label>
          <Input v-model="editForm.prefix" placeholder="gemini/" />
        </div>
        <div class="grid gap-2">
          <Label>Base URL（可选）</Label>
          <Input v-model="editForm.baseUrl" placeholder="https://api.example.com" />
        </div>
        <div class="grid gap-2">
          <Label>Proxy URL（可选）</Label>
          <Input v-model="editForm.proxyUrl" placeholder="http://proxy:7890" />
        </div>
        <div class="grid gap-2">
          <Label>优先级（可选）</Label>
          <Input v-model.number="editForm.priority" type="number" placeholder="0" />
        </div>
        <div class="grid gap-2">
          <Label>自定义 Headers（可选）</Label>
          <div class="space-y-2">
            <div v-for="(header, index) in editForm.headers" :key="index" class="flex items-center gap-2">
              <Input v-model="header.key" placeholder="Header 名称" class="flex-1" />
              <Input v-model="header.value" placeholder="Header 值" class="flex-1" />
              <Button size="sm" variant="ghost" @click="editForm.headers.splice(index, 1)">
                <X class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="editForm.headers.push({ key: '', value: '' })">
              <Plus class="mr-2 h-3.5 w-3.5" />
              添加 Header
            </Button>
          </div>
        </div>
        <div class="grid gap-2" v-if="PROVIDER_TYPE_CONFIG[editingProvider.type as ProviderType]?.supportsToggle">
          <Label>排除的模型（每行一个）</Label>
          <textarea
            v-model="editForm.excludedModelsText"
            class="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="模型名称，使用 * 禁用所有模型"
          ></textarea>
          <p class="text-xs text-muted-foreground">使用 * 禁用所有模型</p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showEditDialog = false">取消</Button>
        <Button @click="handleSaveEdit">保存</Button>
      </div>
    </Dialog>
  </div>
</template>
