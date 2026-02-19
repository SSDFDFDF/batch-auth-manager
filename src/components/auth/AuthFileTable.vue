<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch, Teleport, Transition } from 'vue'
import {
  Search,
  Upload,
  Download,
  RefreshCw,
  Edit,
  Check,
  X,
  Trash2,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  Info,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-vue-next'
import { authFilesApi } from '../../api/authFiles'
import { useQuotaStore, quotaKey } from '../../stores/quota'
import { useNotificationStore } from '../../stores/notification'
import { useAuthFiles } from '../../composables/useAuthFiles'
import { useAuthFileFilters } from '../../composables/useAuthFileFilters'
import { useQuotaLoader } from '../../composables/useQuotaLoader'
import { cn } from '../../lib/utils'
import {
  getStatusVariant,
  getStatusLabel,
  getProviderDisplayName,
  supportsQuota,
  getQuotaPercentClass
} from '../../config/constants'
import { generateAvailabilityPointsFromUsage } from '../../utils/availability'
import { formatResetTime } from '../../utils/quota'
import { usePagination } from '../../composables/usePagination'
import { useTableSelection } from '../../composables/useTableSelection'
import { useUsageStore } from '../../stores/usage'

// UI Components
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Badge from '../ui/badge/Badge.vue'
import Progress from '../ui/progress/Progress.vue'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../ui/table'
import Dialog from '../ui/dialog/Dialog.vue'
import { Tooltip } from '../ui/tooltip'
import BatchFieldEditor from '../BatchFieldEditor.vue'
import QuotaDialog from '../QuotaDialog.vue'
import AvailabilityMonitor from './AvailabilityMonitor.vue'

// Stores
const quotaStore = useQuotaStore()
const notificationStore = useNotificationStore()
const { files: authFiles, loading, loadFiles: loadAuthFiles, setStatus: setStatusApi, batchSetStatus: batchSetStatusApi, deleteFile: deleteFileApi, batchDelete: batchDeleteApi } = useAuthFiles()
const { loadQuota, loadExpiredQuota } = useQuotaLoader()

// Filters
const {
  searchText,
  filterType,
  filterStatus,
  filterUnavailable,
  availableTypes,
  availableStatuses,
  filteredData,
} = useAuthFileFilters(authFiles)

type AuthSortKey = 'name' | 'type' | 'size' | 'status'

const sortKey = ref<AuthSortKey | ''>('')
const sortOrder = ref<'asc' | 'desc'>('asc')
const sortCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

const toggleSort = (key: AuthSortKey) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const getSortValue = (file: any, key: AuthSortKey) => {
  switch (key) {
    case 'name':
      return file.name ?? ''
    case 'type':
      return file.type ?? ''
    case 'size':
      return file.size ?? 0
    case 'status':
      return file.status ?? ''
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
    return sortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  })
})

// Shared composables
const { currentPage, pageSize, pageSizeOptions, totalItems, totalPages, paginatedData } = usePagination(sortedData, {
  defaultPageSize: 30,
  pageSizeOptions: [30, 50, 100, 200],
  resetWatchers: [searchText, filterType, filterStatus, filterUnavailable, sortKey, sortOrder]
})

const { selectedItems: selectedFiles, allSelected, isSelected, toggleSelection, toggleSelectAll, clearSelection } = useTableSelection(paginatedData)

const usageStore = useUsageStore()
const usageDetails = computed(() => usageStore.usageDetails)

// Local State
const batchLoading = ref(false)
const refreshAllQuotaLoading = ref(false)
const uploadLoading = ref(false)
const modelsLoading = ref(false)
const editLoading = ref(false)
const saveLoading = ref(false)
const toggleLoading = reactive<Record<string, boolean>>({})

const showUploadDialog = ref(false)
const showModelsDialog = ref(false)
const showEditDialog = ref(false)
const showBatchFieldEditor = ref(false)
const showQuotaDialog = ref(false)
const showStatusDialog = ref(false)
const currentModels = ref<any[]>([])
const editingFile = ref<any>(null)
const editContent = ref('')
const quotaFile = ref<any>(null)
const statusDialogFile = ref<any>(null)

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error'
interface UploadItem {
  file: File
  status: UploadStatus
  error?: string
}

const uploadItems = ref<UploadItem[]>([])
const uploadInputKey = ref(0)
const DEFAULT_UPLOAD_CONCURRENCY = 3
const uploadConcurrency = ref<number>(DEFAULT_UPLOAD_CONCURRENCY)

// Computed
const hasQuotaSupportedFiles = computed(() => {
  return selectedFiles.value.some((file: any) => supportsQuota(file.type))
})

const uploadStats = computed(() => {
  let success = 0
  let failed = 0
  let uploadingCount = 0
  for (const item of uploadItems.value) {
    if (item.status === 'success') success++
    else if (item.status === 'error') failed++
    else if (item.status === 'uploading') uploadingCount++
  }
  const total = uploadItems.value.length
  const processed = success + failed
  return { total, success, failed, processed, uploading: uploadingCount }
})

const uploadPercent = computed(() => {
  if (!uploadStats.value.total) return 0
  return Math.round((uploadStats.value.processed / uploadStats.value.total) * 100)
})

const hasPendingUploads = computed(() => {
  return uploadItems.value.some(item => item.status === 'pending' || item.status === 'error')
})

// Methods
const handleToggleStatus = async (row: any) => {
  toggleLoading[row.name] = true
  try {
    await setStatusApi(row.name, !row.disabled)
    quotaStore.clearQuota(quotaKey.file(row.name))
  } catch (error: any) {
    notificationStore.error('操作失败: ' + error.message)
  } finally {
    delete toggleLoading[row.name]
  }
}

const handleBatchAction = async (action: 'enable' | 'disable' | 'delete') => {
  const names = selectedFiles.value.map((f: any) => f.name)
  if (!names.length) return

  if (action === 'delete') {
    const confirmed = await notificationStore.showConfirmation({
      title: '批量删除',
      message: `确定要删除选中的 ${names.length} 个文件吗？`,
      variant: 'danger'
    })
    if (!confirmed) return
  }

  batchLoading.value = true
  try {
    if (action === 'enable') {
      await batchSetStatusApi(names, false)
    } else if (action === 'disable') {
      await batchSetStatusApi(names, true)
    } else if (action === 'delete') {
      await batchDeleteApi(names)
    }
    selectedFiles.value = []
    await loadAuthFiles()
    notificationStore.success('批量操作成功')
  } catch (error: any) {
    notificationStore.error('批量操作失败: ' + error.message)
  } finally {
    batchLoading.value = false
  }
}

const handleBatchFieldEditSuccess = async () => {
  await loadAuthFiles()
  selectedFiles.value = []
}

const handleRemoveSelectedFile = (name: string) => {
  selectedFiles.value = selectedFiles.value.filter((file: any) => file.name !== name)
}

const handleUploadChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  if (files.length === 0) {
    uploadItems.value = []
    return
  }
  const validFiles = files.filter(file => file.name.toLowerCase().endsWith('.json'))
  const ignored = files.length - validFiles.length
  if (ignored > 0) {
    notificationStore.warning(`已忽略 ${ignored} 个非 JSON 文件`)
  }
  uploadItems.value = validFiles.map(file => ({
    file,
    status: 'pending' as UploadStatus
  }))
  uploadInputKey.value += 1
}

const resetUploadSelection = () => {
  uploadItems.value = []
  uploadInputKey.value += 1
}

const handleCloseUploadDialog = () => {
  if (uploadLoading.value) return
  showUploadDialog.value = false
  resetUploadSelection()
}

const handleUploadDialogToggle = (open: boolean) => {
  if (!open && uploadLoading.value) return
  showUploadDialog.value = open
  if (!open) resetUploadSelection()
}

const handleRemoveUploadItem = (index: number) => {
  if (uploadLoading.value) return
  uploadItems.value.splice(index, 1)
}

const getUploadStatusLabel = (status: UploadStatus) => {
  switch (status) {
    case 'pending':
      return '待上传'
    case 'uploading':
      return '上传中'
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    default:
      return '未知'
  }
}

const getUploadStatusVariant = (status: UploadStatus) => {
  if (status === 'success') return 'default'
  if (status === 'error') return 'destructive'
  if (status === 'uploading') return 'secondary'
  return 'outline'
}

const normalizeUploadConcurrency = () => {
  const value = Number(uploadConcurrency.value)
  if (!Number.isFinite(value)) return 1
  return Math.min(10, Math.max(1, Math.floor(value)))
}

const uploadSingleFile = async (item: UploadItem) => {
  item.status = 'uploading'
  item.error = undefined
  try {
    await authFilesApi.upload(item.file)
    quotaStore.clearQuota(quotaKey.file(item.file.name))
    item.status = 'success'
    return true
  } catch (error: any) {
    item.status = 'error'
    item.error = error.message || '上传失败'
    return false
  }
}

const runUploadQueue = async (items: UploadItem[], limit: number) => {
  let index = 0
  let success = 0
  let failed = 0
  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = index++
      if (currentIndex >= items.length) break
      const ok = await uploadSingleFile(items[currentIndex])
      if (ok) success++
      else failed++
    }
  })
  await Promise.all(workers)
  return { success, failed }
}

const handleUpload = async () => {
  if (!uploadItems.value.length) {
    notificationStore.warning('请选择文件')
    return
  }
  const queue = uploadItems.value.filter(item => item.status !== 'success')
  if (!queue.length) {
    notificationStore.info('没有需要上传的文件')
    return
  }
  uploadLoading.value = true
  try {
    const concurrency = normalizeUploadConcurrency()
    uploadConcurrency.value = concurrency
    const { success, failed } = await runUploadQueue(queue, concurrency)
    if (success > 0) {
      await loadAuthFiles()
    }
    if (failed === 0) {
      notificationStore.success(`已上传 ${success} 个文件`)
      showUploadDialog.value = false
      resetUploadSelection()
    } else {
      notificationStore.error(`上传完成：成功 ${success} 个，失败 ${failed} 个`)
    }
  } catch (error: any) {
    notificationStore.error('上传失败: ' + error.message)
  } finally {
    uploadLoading.value = false
  }
}

const handleDownload = async (row: any) => {
  try {
    const blob = await authFilesApi.download(row.name)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.name
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (error: any) {
    notificationStore.error('下载失败: ' + error.message)
  }
}

const handleBatchDownload = async () => {
  const targets = selectedFiles.value
  if (!targets.length) return

  const confirmed = await notificationStore.showConfirmation({
    title: '批量下载',
    message: `将下载选中的 ${targets.length} 个 JSON 文件，浏览器可能会提示多个下载确认，是否继续？`,
    variant: 'primary'
  })
  if (!confirmed) return

  batchLoading.value = true
  const failed: string[] = []
  try {
    for (const file of targets) {
      try {
        const blob = await authFilesApi.download(file.name)
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        window.URL.revokeObjectURL(url)
        await new Promise(resolve => setTimeout(resolve, 80))
      } catch (error: any) {
        failed.push(file.name)
      }
    }
    if (failed.length > 0) {
      notificationStore.error(`下载失败 ${failed.length} 个文件：${failed.join(', ')}`)
    } else {
      notificationStore.success(`已开始下载 ${targets.length} 个文件`)
    }
  } finally {
    batchLoading.value = false
  }
}

const handleDelete = async (row: any) => {
  const confirmed = await notificationStore.showConfirmation({
    title: '删除文件',
    message: `确定要删除 "${row.name}" 吗？`,
    variant: 'danger'
  })
  if (!confirmed) return

  try {
    await deleteFileApi(row.name)
    quotaStore.clearQuota(quotaKey.file(row.name))
    await loadAuthFiles()
    notificationStore.success('删除成功')
  } catch (error: any) {
    notificationStore.error('删除失败: ' + error.message)
  }
}

const handleViewModels = async (row: any) => {
  showModelsDialog.value = true
  modelsLoading.value = true
  try {
    const response = await authFilesApi.getModels(row.name)
    currentModels.value = response.models || []
  } catch (error: any) {
    currentModels.value = []
    notificationStore.error('获取模型失败: ' + error.message)
  } finally {
    modelsLoading.value = false
  }
}

const handleEdit = async (row: any) => {
  editingFile.value = row
  showEditDialog.value = true
  editLoading.value = true
  editContent.value = ''
  try {
    const blob = await authFilesApi.download(row.name)
    const text = await blob.text()
    try {
      const json = JSON.parse(text)
      editContent.value = JSON.stringify(json, null, 2)
    } catch {
      editContent.value = text
    }
  } catch (error: any) {
    notificationStore.error('加载文件失败: ' + error.message)
    showEditDialog.value = false
  } finally {
    editLoading.value = false
  }
}

const handleSaveEdit = async () => {
  if (!editingFile.value) return
  try {
    JSON.parse(editContent.value)
  } catch (error: any) {
    notificationStore.error('JSON 格式无效: ' + error.message)
    return
  }
  saveLoading.value = true
  try {
    const blob = new Blob([editContent.value], { type: 'application/json' })
    const file = new File([blob], editingFile.value.name, { type: 'application/json' })
    await authFilesApi.upload(file)
    quotaStore.clearQuota(quotaKey.file(editingFile.value.name))
    showEditDialog.value = false
    editingFile.value = null
    editContent.value = ''
    await loadAuthFiles()
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    saveLoading.value = false
  }
}

const handleViewQuota = (row: any) => {
  quotaFile.value = row
  showQuotaDialog.value = true
}

const handleBatchRefreshQuota = async () => {
  const targets = selectedFiles.value.filter((f: any) => supportsQuota(f.type))
  if (targets.length === 0) return

  batchLoading.value = true
  try {
    await loadQuota(targets, { force: true })
  } finally {
    batchLoading.value = false
  }
}

const handleRefreshAllQuota = async () => {
  const targets = authFiles.value.filter((f: any) => supportsQuota(f.type))
  if (targets.length === 0) {
    notificationStore.warning('没有支持配额查询的文件')
    return
  }

  refreshAllQuotaLoading.value = true
  try {
    await loadQuota(targets, { force: true })
    notificationStore.success(`已刷新 ${targets.length} 个文件的配额`)
  } finally {
    refreshAllQuotaLoading.value = false
  }
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const resolvePlanType = (file: any): string | null => {
  const candidates = [
    file.plan_type,
    file.planType,
    file.id_token?.plan_type,
    file.id_token?.planType,
    file.metadata?.plan_type,
    file.metadata?.planType,
    file.metadata?.id_token?.plan_type,
    file.metadata?.idToken?.planType,
    file.attributes?.plan_type,
    file.attributes?.planType
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase()
    }
  }

  return null
}

const formatPlanTypeLabel = (planType: string) => {
  return planType
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const getPlanBadgeClass = (planType: string) => {
  if (planType === 'free') return 'border-amber-400 text-amber-600 dark:text-amber-400'
  if (planType === 'team') return 'border-sky-400 text-sky-600 dark:text-sky-400'
  return 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
}

const handleShowStatusDialog = (file: any) => {
  statusDialogFile.value = file
  showStatusDialog.value = true
}

const getQuotaKey = (file: any) => quotaKey.file(file.name)

const getQuotaItems = (fileName: string): { name: string; percent: number | null; resetTime?: number | string }[] => {
  const q = quotaStore.getQuotaStatus(quotaKey.file(fileName))
  if (!q || q.status !== 'success') return []
  if (q.type === 'antigravity') {
    return (q.data?.groups || []).filter((g: any) => !g.hideInTable).map((g: any) => ({ name: g.name, percent: g.percent, resetTime: g.resetTime }))
  }
  if (q.type === 'gemini-cli') {
    return (q.data?.buckets || []).map((b: any) => ({ name: b.modelId, percent: b.percent, resetTime: b.resetTime }))
  }
  if (q.type === 'codex') {
    return (q.data?.limits || []).map((l: any) => ({ name: l.model, percent: l.percent, resetTime: l.resetTime }))
  }
  return []
}

const getBarColorClass = (percent: number) => {
  if (percent >= 50) return 'bg-green-500 dark:bg-green-400'
  if (percent >= 20) return 'bg-yellow-500 dark:bg-yellow-400'
  return 'bg-red-500 dark:bg-red-400'
}

const formatUpdatedAt = (timestamp: number | null) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const getCacheInfo = (file: any) => {
  const key = getQuotaKey(file)
  const updatedAt = quotaStore.getUpdatedAt(key)
  if (!updatedAt) return null
  return {
    updatedAt,
    expired: quotaStore.isExpired(key)
  }
}

// 生成可用性监控点
const getAvailabilityPoints = (file: any) => {
  const authIndex = file.auth_index ?? file.authIndex
  if (
    usageDetails.value.length > 0 &&
    authIndex !== undefined &&
    authIndex !== null &&
    authIndex !== ''
  ) {
    return generateAvailabilityPointsFromUsage(usageDetails.value, authIndex)
  }
  return []
}

onMounted(() => {
  loadAuthFiles()
  usageStore.fetchUsage()
  usageStore.startPolling()
})

let quotaPollTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  usageStore.stopPolling()
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
  if (quotaPollTimer) clearInterval(quotaPollTimer)
})

// Auto-refresh expired quota when files are loaded (debounced)
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(authFiles, (files) => {
  if (files.length > 0) {
    quotaStore.pruneStaleEntries(files.map((f: any) => f.name))
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
    refreshDebounceTimer = setTimeout(() => {
      loadExpiredQuota(files)
    }, 500)

    // Start periodic quota refresh (every 5 min)
    if (!quotaPollTimer) {
      quotaPollTimer = setInterval(() => {
        loadExpiredQuota(authFiles.value)
      }, 5 * 60 * 1000)
    }
  } else {
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer)
      refreshDebounceTimer = null
    }
    if (quotaPollTimer) {
      clearInterval(quotaPollTimer)
      quotaPollTimer = null
    }
  }
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
            placeholder="搜索文件..."
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
        <select
          v-model="filterStatus"
          class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">所有状态</option>
          <option v-for="status in availableStatuses" :key="status" :value="status">
            {{ getStatusLabel(status) }}
          </option>
        </select>
        <select
          v-model="filterUnavailable"
          class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">可用性</option>
          <option value="true">不可用</option>
          <option value="false">可用</option>
        </select>
        <Button variant="outline" size="icon" @click="loadAuthFiles" :disabled="loading" title="刷新列表">
          <RefreshCw :class="cn('h-4 w-4', loading && 'animate-spin')" />
        </Button>
      </div>
      <div class="flex w-full sm:w-auto items-center justify-end gap-2">
        <Button @click="showUploadDialog = true">
          <Upload class="mr-2 h-4 w-4" />
          上传文件
        </Button>
        <Button variant="outline" @click="handleRefreshAllQuota" :disabled="refreshAllQuotaLoading">
          <RefreshCw :class="cn('mr-2 h-4 w-4', refreshAllQuotaLoading && 'animate-spin')" />
          刷新所有额度
        </Button>
      </div>
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
        <div v-if="selectedFiles.length > 0" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg p-2 px-5">
          <div class="text-sm text-muted-foreground whitespace-nowrap">
            已选择 <strong>{{ selectedFiles.length }}</strong> 项
            <button class="ml-2 text-primary hover:underline" @click="clearSelection">清除</button>
          </div>
          <div class="h-4 w-px bg-border" />
          <div class="flex items-center gap-1.5">
            <Button size="sm" variant="outline" @click="showBatchFieldEditor = true" :disabled="batchLoading">
              <Edit class="mr-1.5 h-3.5 w-3.5" />
              批量修改
            </Button>
            <Button size="sm" variant="outline" @click="handleBatchDownload" :disabled="batchLoading">
              <Download class="mr-1.5 h-3.5 w-3.5" />
              批量下载
            </Button>
            <Button size="sm" variant="outline" v-if="hasQuotaSupportedFiles" @click="handleBatchRefreshQuota" :disabled="batchLoading">
              <RefreshCw class="mr-1.5 h-3.5 w-3.5" />
              刷新配额
            </Button>
            <Button size="sm" variant="outline" @click="handleBatchAction('enable')" :disabled="batchLoading">
              <Check class="mr-1.5 h-3.5 w-3.5" />
              启用
            </Button>
            <Button size="sm" variant="outline" @click="handleBatchAction('disable')" :disabled="batchLoading">
              <X class="mr-1.5 h-3.5 w-3.5" />
              禁用
            </Button>
            <Button size="sm" variant="destructive" @click="handleBatchAction('delete')" :disabled="batchLoading">
              <Trash2 class="mr-1.5 h-3.5 w-3.5" />
              删除
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
            <TableHead class="w-[160px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('name')">
                <span>文件名</span>
                <ArrowUpDown v-if="sortKey !== 'name'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[80px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('type')">
                <span>类型</span>
                <ArrowUpDown v-if="sortKey !== 'type'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
                <ArrowUp v-else-if="sortOrder === 'asc'" class="h-3.5 w-3.5" />
                <ArrowDown v-else class="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead class="w-[70px]">
              <button type="button" class="group inline-flex items-center gap-1 select-none" @click="toggleSort('size')">
                <span>大小</span>
                <ArrowUpDown v-if="sortKey !== 'size'" class="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground" />
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
            <TableHead class="w-[240px]">配额</TableHead>
            <TableHead class="w-[160px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading && authFiles.length === 0">
             <TableCell colspan="7" class="h-24 text-center">
                <Loader2 class="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
             </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredData.length === 0">
             <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
                没有找到文件。
             </TableCell>
          </TableRow>
          <TableRow v-for="file in paginatedData" :key="file.name">
            <TableCell>
              <input type="checkbox" :checked="isSelected(file)" @change="toggleSelection(file)" class="translate-y-[2px] accent-primary" />
            </TableCell>
            <TableCell>
              <div class="flex flex-col gap-1.5">
                <!-- 第一行：文件名信息 -->
                <div class="flex items-center gap-2">
                  <AlertCircle
                    v-if="file.unavailable"
                    class="h-4 w-4 text-orange-500 dark:text-orange-400 flex-shrink-0"
                    :title="`不可用: ${file.status_message || '临时不可用'}`"
                  />
                  <FileText v-else class="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span class="font-medium text-foreground truncate">{{ file.name }}</span>
                  <Badge v-if="file.runtime_only || file.runtimeOnly" variant="secondary" class="text-[10px] px-1 py-0 h-4 flex-shrink-0">Runtime</Badge>
                  <Badge
                    v-if="resolvePlanType(file)"
                    variant="outline"
                    class="text-[10px] px-1 py-0 h-4 flex-shrink-0"
                    :class="getPlanBadgeClass(resolvePlanType(file) || '')"
                  >
                    {{ formatPlanTypeLabel(resolvePlanType(file) || '') }}
                  </Badge>
                  <!-- 属性图标 -->
                  <!-- <FileAttributeIcons :file-name="file.name" :max-display="3" /> --> <!-- 暂时关闭：每个配置需要独立请求 -->
                </div>
                <!-- 第二行：可用性监控 -->
                <AvailabilityMonitor :points="getAvailabilityPoints(file)" :compact="true" :show-stats="true" />
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline" class="font-normal">{{ file.type }}</Badge>
            </TableCell>
            <TableCell class="text-muted-foreground text-sm font-mono">
              {{ formatFileSize(file.size) }}
            </TableCell>
            <TableCell>
              <div class="flex flex-col items-start gap-1">
                <Tooltip v-if="file.status_message" :content="file.status_message">
                  <div class="flex items-center gap-1">
                    <Badge
                      :variant="getStatusVariant(file.status)"
                      class="cursor-pointer hover:opacity-80 transition-opacity"
                      @click="handleShowStatusDialog(file)"
                    >
                      {{ getStatusLabel(file.status) }}
                    </Badge>
                    <Info
                      class="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      @click="handleShowStatusDialog(file)"
                      title="点击查看详情"
                    />
                  </div>
                </Tooltip>
                <Badge
                  v-else
                  :variant="getStatusVariant(file.status)"
                  class="cursor-default"
                >
                  {{ getStatusLabel(file.status) }}
                </Badge>
                <Badge
                  v-if="supportsQuota(file.type) && getCacheInfo(file)"
                  variant="outline"
                  :class="getCacheInfo(file)?.expired
                    ? 'text-[10px] px-1.5 py-0 h-4 font-normal border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400'
                    : 'text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground'"
                >
                  {{ formatUpdatedAt(getCacheInfo(file)?.updatedAt || null) }}
                  <template v-if="getCacheInfo(file)?.expired"> 待更新</template>
                </Badge>
              </div>
            </TableCell>
            <TableCell>
               <div v-if="supportsQuota(file.type)" @click="handleViewQuota(file)" class="cursor-pointer hover:opacity-80">
                  <div v-if="quotaStore.isLoading(getQuotaKey(file)) && quotaStore.getQuotaStatus(getQuotaKey(file))?.status === 'loading'" class="flex items-center gap-1 text-xs text-muted-foreground">
                     <Loader2 class="h-3 w-3 animate-spin" /> 查询中...
                  </div>
                  <div v-else-if="quotaStore.getQuotaStatus(getQuotaKey(file))?.status === 'success' || (quotaStore.isLoading(getQuotaKey(file)) && getQuotaItems(file.name).length > 0)">
                     <div :class="getQuotaItems(file.name).length <= 3 ? 'columns-1' : getQuotaItems(file.name).length <= 6 ? 'columns-2' : 'columns-3'" class="gap-x-3 text-xs" :style="{ columnFill: 'auto', maxHeight: (Math.min(getQuotaItems(file.name).length, 3) * 1.75) + 'rem' }">
                        <div v-for="item in getQuotaItems(file.name)" :key="item.name" class="break-inside-avoid mb-1">
                           <div class="flex items-center justify-between gap-1 whitespace-nowrap">
                              <span class="truncate text-muted-foreground" :title="item.name">{{ item.name }}</span>
                              <span v-if="item.percent === 0 && item.resetTime" class="font-medium text-[11px] text-red-600 dark:text-red-400">{{ formatResetTime(item.resetTime) }}</span>
                              <span v-else :class="getQuotaPercentClass(item.percent ?? 0)" class="font-medium tabular-nums text-[11px]">{{ item.percent ?? '?' }}%</span>
                           </div>
                           <div v-if="item.percent !== null" class="h-1 w-full rounded-full bg-muted overflow-hidden mt-0.5">
                              <div :class="getBarColorClass(item.percent)" class="h-full rounded-full transition-all" :style="{ width: `${item.percent === 0 ? 100 : item.percent}%` }" />
                           </div>
                        </div>
                     </div>
                  </div>
                  <div v-else-if="quotaStore.getQuotaStatus(getQuotaKey(file))?.status === 'error'" class="text-xs text-red-600 dark:text-red-400">
                     查询失败
                  </div>
                  <div v-else class="text-xs text-muted-foreground italic">
                     点击查询
                  </div>
               </div>
               <div v-else class="text-xs text-muted-foreground">-</div>
            </TableCell>
            <TableCell>
              <div class="flex flex-col gap-1">
                <!-- 第一行操作 -->
                <div class="flex items-center gap-1">
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleToggleStatus(file)" :disabled="toggleLoading[file.name]">
                    {{ file.disabled ? '启用' : '禁用' }}
                  </Button>
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleEdit(file)">
                    编辑
                  </Button>
                  <Button v-if="supportsQuota(file.type)" size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleViewQuota(file)">
                    配额
                  </Button>
                </div>
                <!-- 第二行操作 -->
                <div class="flex items-center gap-1">
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleDownload(file)">
                    下载
                  </Button>
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="handleViewModels(file)">
                    模型
                  </Button>
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDelete(file)">
                    删除
                  </Button>
                </div>
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
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
        </div>
        
        <div class="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage === 1"
            @click="currentPage = 1"
          >
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          
          <div class="flex items-center gap-1 px-2">
             <span class="text-sm font-medium">{{ currentPage }}</span>
             <span class="text-sm text-muted-foreground">/ {{ totalPages }}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            :disabled="currentPage === totalPages"
            @click="currentPage = totalPages"
          >
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Upload Dialog -->
    <Dialog :open="showUploadDialog" @update:open="handleUploadDialogToggle" title="上传文件" description="上传 JSON 格式的认证文件。">
      <div class="grid gap-4 py-4">
        <div class="grid w-full max-w-sm items-center gap-1.5">
          <Input :key="uploadInputKey" id="file" type="file" accept=".json" multiple :disabled="uploadLoading" @change="handleUploadChange" />
          <div class="text-xs text-muted-foreground">可多选 JSON 文件。</div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span class="text-muted-foreground">并发数</span>
          <Input v-model="uploadConcurrency" type="number" min="1" max="10" step="1" class="h-8 w-20" :disabled="uploadLoading" />
          <span class="text-xs text-muted-foreground">1-10</span>
        </div>
        <div v-if="uploadItems.length > 0" class="space-y-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>已选择 {{ uploadItems.length }} 个文件</span>
            <button type="button" class="text-primary hover:underline" @click="resetUploadSelection" :disabled="uploadLoading">清空</button>
          </div>
          <div class="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
            <div v-for="(item, index) in uploadItems" :key="`${item.file.name}-${index}`" class="flex items-center gap-2">
              <div class="min-w-0 flex-1 truncate text-sm" :title="item.file.name">{{ item.file.name }}</div>
              <div class="flex items-center gap-1">
                <Tooltip v-if="item.status === 'error' && item.error" :content="item.error">
                  <Badge variant="destructive" class="gap-1">
                    <X class="h-3 w-3" />
                    失败
                  </Badge>
                </Tooltip>
                <Badge v-else :variant="getUploadStatusVariant(item.status)" class="gap-1">
                  <Loader2 v-if="item.status === 'uploading'" class="h-3 w-3 animate-spin" />
                  <Check v-else-if="item.status === 'success'" class="h-3 w-3" />
                  <span>{{ getUploadStatusLabel(item.status) }}</span>
                </Badge>
                <button type="button" class="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20" @click="handleRemoveUploadItem(index)" :disabled="uploadLoading">
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>进度 {{ uploadStats.processed }}/{{ uploadStats.total }}</span>
              <span v-if="uploadStats.failed > 0">失败 {{ uploadStats.failed }}</span>
            </div>
            <Progress :modelValue="uploadPercent" />
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="handleCloseUploadDialog" :disabled="uploadLoading">取消</Button>
        <Button @click="handleUpload" :disabled="uploadLoading || !hasPendingUploads">
          <Loader2 v-if="uploadLoading" class="mr-2 h-4 w-4 animate-spin" />
          上传
        </Button>
      </div>
    </Dialog>

    <!-- Models Dialog -->
    <Dialog :open="showModelsDialog" @update:open="showModelsDialog = $event" title="可用模型">
      <div class="py-4 max-h-[60vh] overflow-y-auto">
         <div v-if="modelsLoading" class="flex justify-center py-4">
            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
         </div>
         <div v-else-if="currentModels.length === 0" class="text-center text-muted-foreground">
            无可用模型。
         </div>
         <div v-else class="flex flex-wrap gap-2">
            <Badge v-for="model in currentModels" :key="model.id" variant="secondary">
               {{ model.display_name || model.id }}
            </Badge>
         </div>
      </div>
      <div class="flex justify-end">
         <Button variant="outline" @click="showModelsDialog = false">关闭</Button>
      </div>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog :open="showEditDialog" @update:open="showEditDialog = $event" :title="`编辑 ${editingFile?.name}`" class="max-w-4xl w-full">
       <div class="py-4 h-[60vh]">
          <textarea
            v-model="editContent"
            class="h-full w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none"
            placeholder="请输入 JSON 内容..."
            spellcheck="false"
          ></textarea>
       </div>
       <div class="flex justify-end gap-2">
         <Button variant="outline" @click="showEditDialog = false">取消</Button>
         <Button @click="handleSaveEdit" :disabled="saveLoading">
           <Loader2 v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin" />
           保存
         </Button>
       </div>
    </Dialog>

    <!-- Batch Field Editor -->
    <BatchFieldEditor
      v-model="showBatchFieldEditor"
      :files="selectedFiles"
      @remove="handleRemoveSelectedFile"
      @success="handleBatchFieldEditSuccess"
    />

    <!-- Quota Dialog -->
    <QuotaDialog
      v-model="showQuotaDialog"
      :file="quotaFile"
    />

    <!-- Status Message Dialog -->
    <Dialog :open="showStatusDialog" @update:open="showStatusDialog = $event" :title="`${statusDialogFile?.name} - 状态详情`" class="max-w-2xl w-full">
      <div class="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">状态</span>
            <Badge :variant="getStatusVariant(statusDialogFile?.status || '')">
              {{ getStatusLabel(statusDialogFile?.status || '') }}
            </Badge>
          </div>
          <div v-if="statusDialogFile?.unavailable" class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">可用性</span>
            <Badge variant="destructive">不可用</Badge>
          </div>
          <div v-if="statusDialogFile?.disabled" class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted-foreground">启用状态</span>
            <Badge variant="secondary">已禁用</Badge>
          </div>
        </div>
        <div v-if="statusDialogFile?.status_message" class="rounded-md bg-muted p-3 space-y-1">
          <div class="text-xs font-medium text-muted-foreground">状态消息</div>
          <div class="text-sm text-foreground break-words whitespace-pre-wrap">{{ statusDialogFile.status_message }}</div>
        </div>
        <div v-if="statusDialogFile?.email" class="text-sm break-words">
          <span class="font-medium text-muted-foreground">账户: </span>
          <span class="text-foreground">{{ statusDialogFile.email }}</span>
        </div>
      </div>
      <div class="flex justify-end">
        <Button variant="outline" @click="showStatusDialog = false">关闭</Button>
      </div>
    </Dialog>

  </div>
</template>
