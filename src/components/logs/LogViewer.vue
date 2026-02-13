<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useNotificationStore } from '../../stores/notification'
import { logsApi, type ErrorLogFile } from '../../api/logs'
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Label from '../ui/Label.vue'
import Badge from '../ui/badge/Badge.vue'
import Dialog from '../ui/dialog/Dialog.vue'
import {
  RefreshCw, Trash2, Download, Search, X, Timer, EyeOff,
} from 'lucide-vue-next'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

interface ParsedLog {
  raw: string
  timestamp?: string
  level?: LogLevel
  statusCode?: number
  method?: HttpMethod
  path?: string
  latency?: string
  ip?: string
  message: string
}

const MANAGEMENT_PREFIX = '/v0/management'
const MAX_LINES = 5000
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const
const HTTP_METHOD_RE = new RegExp(`\\b(${HTTP_METHODS.join('|')})\\b`)
const TIMESTAMP_RE = /^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]?/
const LEVEL_RE = /^\[?(trace|debug|info|warn|warning|error|fatal)\s*\]?(?=\s|\[|$)\s*/i
const LATENCY_RE = /\b(?:\d+(?:\.\d+)?\s*(?:µs|us|ms|s|m))(?:\s*\d+(?:\.\d+)?\s*(?:µs|us|ms|s|m))*\b/i
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/

function parseLogLine(raw: string): ParsedLog {
  let rest = raw.trim()

  let timestamp: string | undefined
  const tsMatch = rest.match(TIMESTAMP_RE)
  if (tsMatch) {
    timestamp = tsMatch[1]
    rest = rest.slice(tsMatch[0].length).trim()
  }

  let level: LogLevel | undefined
  const lvlMatch = rest.match(LEVEL_RE)
  if (lvlMatch) {
    const l = lvlMatch[1].toLowerCase()
    level = (l === 'warning' ? 'warn' : l) as LogLevel
    rest = rest.slice(lvlMatch[0].length).trim()
  }

  let statusCode: number | undefined
  let method: HttpMethod | undefined
  let path: string | undefined
  let latency: string | undefined
  let ip: string | undefined

  if (rest.includes('|')) {
    const segs = rest.split('|').map(s => s.trim()).filter(Boolean)
    const used = new Set<number>()

    // status code
    const si = segs.findIndex(s => /^\d{3}$/.test(s))
    if (si >= 0) {
      const code = Number(segs[si])
      if (code >= 100 && code <= 599) { statusCode = code; used.add(si) }
    }

    // latency
    const li = segs.findIndex(s => LATENCY_RE.test(s))
    if (li >= 0) {
      const m = segs[li].match(LATENCY_RE)
      if (m) { latency = m[0].replace(/\s+/g, ''); used.add(li) }
    }

    // ip
    const ii = segs.findIndex(s => IPV4_RE.test(s))
    if (ii >= 0) {
      const m = segs[ii].match(IPV4_RE)
      if (m) { ip = m[0]; used.add(ii) }
    }

    // method + path
    const mi = segs.findIndex(s => HTTP_METHOD_RE.test(s))
    if (mi >= 0) {
      const m = segs[mi].match(HTTP_METHOD_RE)
      if (m) {
        method = m[1] as HttpMethod
        const after = segs[mi].slice((m.index ?? 0) + m[0].length).trim()
        if (after) path = after.split(/\s+/)[0]
        used.add(mi)
      }
    }

    // GIN timestamp segments
    const ginRe = /^\[GIN\]\s+\d{4}\/\d{2}\/\d{2}\s*-\s*\d{2}:\d{2}:\d{2}/
    segs.forEach((s, i) => { if (ginRe.test(s)) used.add(i) })

    rest = segs.filter((_, i) => !used.has(i)).join(' | ')
  } else {
    // simple line parsing
    for (const pat of [/\|\s*([1-5]\d{2})\s*\|/, /\b([1-5]\d{2})\s*-/]) {
      const m = rest.match(pat)
      if (m) { statusCode = Number(m[1]); break }
    }
    const lm = rest.match(LATENCY_RE)
    if (lm) latency = lm[0].replace(/\s+/g, '')
    const im = rest.match(IPV4_RE)
    if (im) ip = im[0]
    const mm = rest.match(HTTP_METHOD_RE)
    if (mm) {
      method = mm[1] as HttpMethod
      const after = rest.slice((mm.index ?? 0) + mm[0].length).trim()
      if (after) path = after.split(/\s+/)[0]
    }
  }

  if (!level) {
    const low = raw.toLowerCase()
    if (/\bfatal\b/.test(low)) level = 'fatal'
    else if (/\berror\b/.test(low)) level = 'error'
    else if (/\bwarn(?:ing)?\b/.test(low)) level = 'warn'
    else if (/\binfo\b/.test(low)) level = 'info'
    else if (/\bdebug\b/.test(low)) level = 'debug'
  }

  return { raw, timestamp, level, statusCode, method, path, latency, ip, message: rest }
}

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const lines = ref<string[]>([])
const loading = ref(false)
const autoRefresh = ref(false)
const searchQuery = ref('')
const hideManagement = ref(true)
const latestTimestamp = ref(0)
const logPanelRef = ref<HTMLDivElement | null>(null)
const errorLogsLoading = ref(false)
const errorLogsError = ref('')
const errorLogs = ref<ErrorLogFile[]>([])
const requestLogId = ref('')
const requestLogLoading = ref(false)
const requestLogDetail = ref('')
const showRequestLogDialog = ref(false)

const filteredLines = computed(() => {
  let result = lines.value
  if (hideManagement.value) {
    result = result.filter(l => !l.includes(MANAGEMENT_PREFIX))
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(l => l.toLowerCase().includes(q))
  }
  return result
})

const parsedLines = computed(() => filteredLines.value.map(parseLogLine))

function scrollToBottom() {
  nextTick(() => {
    const el = logPanelRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function loadLogs(incremental = false) {
  if (!authStore.isConnected) return
  if (!incremental) loading.value = true
  try {
    const params = incremental && latestTimestamp.value > 0
      ? { after: latestTimestamp.value }
      : {}
    const data = await logsApi.fetchLogs(params)
    if (data['latest-timestamp']) {
      latestTimestamp.value = data['latest-timestamp']
    }
    const newLines = Array.isArray(data.lines) ? data.lines : []
    if (incremental && newLines.length > 0) {
      const combined = [...lines.value, ...newLines]
      lines.value = combined.length > MAX_LINES
        ? combined.slice(combined.length - MAX_LINES)
        : combined
    } else if (!incremental) {
      lines.value = newLines.slice(-MAX_LINES)
    }
    scrollToBottom()
  } catch (err: any) {
    if (!incremental) {
      notificationStore.error('加载日志失败: ' + (err.message || ''))
    }
  } finally {
    if (!incremental) loading.value = false
  }
}

const normalizeErrorLogs = (payload: any): ErrorLogFile[] => {
  if (!payload) return []
  const files = payload.files ?? payload.items ?? payload
  if (Array.isArray(files)) {
    return files.map((entry: any) => {
      if (typeof entry === 'string') return { name: entry }
      return {
        name: String(entry?.name || entry?.filename || ''),
        size: entry?.size,
        modified: entry?.modified ?? entry?.mtime ?? entry?.last_modified
      }
    }).filter((entry: ErrorLogFile) => entry.name)
  }
  return []
}

const formatBytes = (value?: number) => {
  if (!Number.isFinite(value)) return ''
  const size = value as number
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(/\\.0$/, '')} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1).replace(/\\.0$/, '')} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1).replace(/\\.0$/, '')} GB`
}

const formatDate = (value?: number) => {
  if (!Number.isFinite(value)) return ''
  const raw = value as number
  const timestamp = raw < 1_000_000_000_000 ? raw * 1000 : raw
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function loadErrorLogs() {
  if (!authStore.isConnected) return
  errorLogsLoading.value = true
  errorLogsError.value = ''
  try {
    const data = await logsApi.fetchErrorLogs()
    errorLogs.value = normalizeErrorLogs(data)
  } catch (err: any) {
    errorLogsError.value = err?.message || '加载失败'
  } finally {
    errorLogsLoading.value = false
  }
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function handleDownloadErrorLog(filename: string) {
  try {
    const blob = await logsApi.downloadErrorLog(filename)
    downloadBlob(blob, filename)
    notificationStore.success('已下载错误日志')
  } catch (err: any) {
    notificationStore.error('下载失败: ' + (err?.message || ''))
  }
}

async function handleViewRequestLog() {
  const id = requestLogId.value.trim()
  if (!id) {
    notificationStore.warning('请输入请求日志 ID')
    return
  }
  requestLogLoading.value = true
  try {
    const blob = await logsApi.downloadRequestLogById(id)
    const text = await blob.text()
    requestLogDetail.value = text || '无内容'
    showRequestLogDialog.value = true
  } catch (err: any) {
    notificationStore.error('获取失败: ' + (err?.message || ''))
  } finally {
    requestLogLoading.value = false
  }
}

async function handleDownloadRequestLog() {
  const id = requestLogId.value.trim()
  if (!id) {
    notificationStore.warning('请输入请求日志 ID')
    return
  }
  requestLogLoading.value = true
  try {
    const blob = await logsApi.downloadRequestLogById(id)
    downloadBlob(blob, `request-log-${id}.txt`)
    notificationStore.success('已下载请求日志')
  } catch (err: any) {
    notificationStore.error('下载失败: ' + (err?.message || ''))
  } finally {
    requestLogLoading.value = false
  }
}

async function clearLogs() {
  const confirmed = await notificationStore.showConfirmation({
    title: '清空日志',
    message: '确定要清空所有日志吗？此操作不可撤销。',
    variant: 'danger'
  })
  if (!confirmed) return
  try {
    await logsApi.clearLogs()
    lines.value = []
    latestTimestamp.value = 0
    notificationStore.success('日志已清空')
  } catch (err: any) {
    notificationStore.error('清空失败: ' + (err.message || ''))
  }
}

function downloadLogs() {
  const text = lines.value.join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  notificationStore.success('日志已下载')
}

// Auto refresh
let refreshTimer: ReturnType<typeof setInterval> | null = null

watch(autoRefresh, (enabled) => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  if (enabled && authStore.isConnected) {
    refreshTimer = setInterval(() => loadLogs(true), 8000)
  }
})

// Initial load
watch(() => authStore.isConnected, (connected) => {
  if (connected) {
    latestTimestamp.value = 0
    loadLogs(false)
    loadErrorLogs()
    if (autoRefresh.value && !refreshTimer) {
      refreshTimer = setInterval(() => loadLogs(true), 8000)
    }
  } else {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  }
}, { immediate: true })

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

function levelClass(level?: LogLevel) {
  if (!level) return ''
  const map: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    fatal: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    debug: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
    trace: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500',
  }
  return map[level] || ''
}

function statusClass(code?: number) {
  if (!code) return ''
  if (code >= 200 && code < 300) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (code >= 300 && code < 400) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (code >= 400 && code < 500) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function rowBorderClass(level?: LogLevel) {
  if (level === 'warn') return 'border-l-yellow-400'
  if (level === 'error' || level === 'fatal') return 'border-l-red-400'
  return 'border-l-transparent'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px] max-w-[360px]">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          v-model="searchQuery"
          placeholder="搜索日志..."
          class="pl-8 pr-8 h-9"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted text-muted-foreground"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Hide management logs toggle -->
      <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
        <input type="checkbox" v-model="hideManagement" class="rounded border-border" />
        <EyeOff class="h-3.5 w-3.5" />
        隐藏管理日志
      </label>

      <div class="flex items-center gap-2 ml-auto">
        <!-- Auto refresh toggle -->
        <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
          <input type="checkbox" v-model="autoRefresh" class="rounded border-border" />
          <Timer class="h-3.5 w-3.5" />
          自动刷新
        </label>

        <Button size="sm" variant="outline" @click="loadLogs(false)" :disabled="loading">
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
          刷新
        </Button>
        <Button size="sm" variant="outline" @click="downloadLogs" :disabled="lines.length === 0">
          <Download class="h-3.5 w-3.5" />
          下载
        </Button>
        <Button size="sm" variant="outline" @click="clearLogs"
          class="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800">
          <Trash2 class="h-3.5 w-3.5" />
          清空
        </Button>
      </div>
    </div>

    <!-- Stats -->
    <div v-if="lines.length > 0" class="flex items-center gap-3 text-xs text-muted-foreground">
      <span>共 {{ lines.length }} 行</span>
      <span v-if="filteredLines.length !== lines.length">
        · 显示 {{ filteredLines.length }} 行
      </span>
      <Badge v-if="autoRefresh" variant="outline" class="text-[10px] px-1.5 py-0 h-5 gap-1">
        <div class="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        自动刷新中
      </Badge>
    </div>

    <!-- Log panel -->
    <div
      ref="logPanelRef"
      class="rounded-lg border bg-muted/30 overflow-auto font-mono text-xs"
      style="max-height: calc(100vh - 340px); min-height: 300px;"
    >
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw class="h-5 w-5 animate-spin mr-2" />
        加载中...
      </div>

      <!-- Empty -->
      <div v-else-if="parsedLines.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p>{{ lines.length === 0 ? '暂无日志' : '无匹配结果' }}</p>
      </div>

      <!-- Log list -->
      <div v-else class="divide-y divide-border">
        <div
          v-for="(line, idx) in parsedLines"
          :key="idx"
          class="grid gap-2 px-3 py-2 hover:bg-muted/50 border-l-[3px] transition-colors"
          :class="rowBorderClass(line.level)"
          style="grid-template-columns: 150px 1fr;"
        >
          <!-- Timestamp -->
          <span class="text-muted-foreground truncate pt-px">
            {{ line.timestamp || '' }}
          </span>

          <!-- Content -->
          <div class="flex flex-wrap items-baseline gap-1.5 min-w-0">
            <!-- Level badge -->
            <span
              v-if="line.level"
              class="inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold uppercase leading-tight"
              :class="levelClass(line.level)"
            >
              {{ line.level }}
            </span>

            <!-- Status code -->
            <span
              v-if="line.statusCode"
              class="inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold tabular-nums leading-tight"
              :class="statusClass(line.statusCode)"
            >
              {{ line.statusCode }}
            </span>

            <!-- Latency -->
            <span v-if="line.latency"
              class="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground border border-border leading-tight">
              {{ line.latency }}
            </span>

            <!-- IP -->
            <span v-if="line.ip"
              class="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground border border-border leading-tight">
              {{ line.ip }}
            </span>

            <!-- HTTP method -->
            <span v-if="line.method"
              class="text-[10px] px-1.5 py-px rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 leading-tight">
              {{ line.method }}
            </span>

            <!-- Path -->
            <span v-if="line.path" class="font-semibold text-foreground truncate max-w-[400px]" :title="line.path">
              {{ line.path }}
            </span>

            <!-- Message -->
            <span v-if="line.message" class="text-muted-foreground break-all">
              {{ line.message }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <div class="rounded-md border p-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium">请求日志详情</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="min-w-[180px] flex-1">
            <Label class="text-xs">请求日志 ID</Label>
            <Input v-model="requestLogId" placeholder="请输入 request-log-id" class="h-9 mt-1" />
          </div>
          <div class="flex items-end gap-2">
            <Button size="sm" @click="handleViewRequestLog" :disabled="requestLogLoading">
              <RefreshCw class="h-3.5 w-3.5 mr-2" :class="{ 'animate-spin': requestLogLoading }" />
              查看详情
            </Button>
            <Button size="sm" variant="outline" @click="handleDownloadRequestLog" :disabled="requestLogLoading">
              <Download class="h-3.5 w-3.5 mr-2" />
              下载
            </Button>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">通过 request-log-by-id 查询单条请求日志详情。</p>
      </div>

      <div class="rounded-md border p-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium">请求错误日志</div>
          <Button size="sm" variant="outline" @click="loadErrorLogs" :disabled="errorLogsLoading">
            <RefreshCw class="h-3.5 w-3.5 mr-2" :class="{ 'animate-spin': errorLogsLoading }" />
            刷新
          </Button>
        </div>
        <div v-if="errorLogsLoading" class="text-xs text-muted-foreground">加载中...</div>
        <div v-else-if="errorLogsError" class="text-xs text-red-600">{{ errorLogsError }}</div>
        <div v-else-if="errorLogs.length === 0" class="text-xs text-muted-foreground">暂无错误日志</div>
        <div v-else class="space-y-2">
          <div
            v-for="file in errorLogs"
            :key="file.name"
            class="flex items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1.5"
          >
            <div class="min-w-0">
              <div class="text-xs font-mono truncate" :title="file.name">{{ file.name }}</div>
              <div class="text-[10px] text-muted-foreground">
                <span v-if="file.size">{{ formatBytes(file.size) }}</span>
                <span v-if="file.modified"> · {{ formatDate(file.modified) }}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" @click="handleDownloadErrorLog(file.name)">
              <Download class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog :open="showRequestLogDialog" @update:open="showRequestLogDialog = $event" title="请求日志详情">
      <div class="space-y-3">
        <div class="rounded-md border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-auto">
          {{ requestLogDetail }}
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="outline" @click="handleDownloadRequestLog">下载</Button>
          <Button size="sm" @click="showRequestLogDialog = false">关闭</Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>
