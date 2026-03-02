<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { CloudUpload, Eye, EyeOff, Loader2 } from 'lucide-vue-next'
import { authFilesApi, type AuthFile } from '../../api/authFiles'
import { useAuthStore } from '../../stores/auth'
import { useNotificationStore } from '../../stores/notification'
import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Label from '../ui/Label.vue'
import Card from '../ui/Card.vue'
import CardHeader from '../ui/CardHeader.vue'
import CardTitle from '../ui/CardTitle.vue'
import CardDescription from '../ui/CardDescription.vue'
import CardContent from '../ui/CardContent.vue'

interface WebDavBackupForm {
  endpoint: string
  username: string
  password: string
  directory: string
  filePrefix: string
  includeDisabled: boolean
  rememberPassword: boolean
}

interface BackupFileEntry {
  name: string
  provider: string
  disabled: boolean
  size: number
  updatedAt: string | null
  content?: unknown
  rawText?: string
  parseError?: string
}

interface BackupResult {
  fileName: string
  uploadUrl: string
  exportedAt: string
  totalFiles: number
  parseFailed: number
  sizeBytes: number
}

const STORAGE_KEY = 'cpabm.webdav.backup.config.v1'

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const form = reactive<WebDavBackupForm>({
  endpoint: '',
  username: '',
  password: '',
  directory: 'cpabm-backups',
  filePrefix: 'auth-backup',
  includeDisabled: true,
  rememberPassword: false
})

const showPassword = ref(false)
const backingUp = ref(false)
const savingConfig = ref(false)
const backupProgress = reactive({
  total: 0,
  completed: 0,
  current: ''
})
const lastBackup = ref<BackupResult | null>(null)

const normalizeEndpoint = (value: string) => String(value || '').trim().replace(/\/+$/g, '')
const normalizeDirectory = (value: string) => String(value || '').trim().replace(/^\/+|\/+$/g, '')
const normalizeUsername = (value: string) => String(value || '').trim()
const normalizeFilePrefix = (value: string) => {
  const normalized = String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-')
  return normalized || 'auth-backup'
}

const encodePath = (value: string) => {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

const buildUploadUrl = (endpoint: string, directory: string, fileName: string) => {
  const relativePath = directory ? `${directory}/${fileName}` : fileName
  return `${endpoint}/${encodePath(relativePath)}`
}

const toBasicAuthHeader = (username: string, password: string) => {
  const source = `${username}:${password}`
  const bytes = new TextEncoder().encode(source)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `Basic ${btoa(binary)}`
}

const formatTimestampForFile = (date: Date) => {
  return date.toISOString().replace(/[:.]/g, '-')
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const normalizeFormValues = () => {
  return {
    endpoint: normalizeEndpoint(form.endpoint),
    username: normalizeUsername(form.username),
    password: String(form.password || ''),
    directory: normalizeDirectory(form.directory),
    filePrefix: normalizeFilePrefix(form.filePrefix),
    includeDisabled: form.includeDisabled,
    rememberPassword: form.rememberPassword
  }
}

const persistConfig = () => {
  const normalized = normalizeFormValues()
  const payload = {
    ...normalized,
    password: normalized.rememberPassword ? normalized.password : ''
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

const loadSavedConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const saved = JSON.parse(raw) as Partial<WebDavBackupForm>
    form.endpoint = typeof saved.endpoint === 'string' ? saved.endpoint : ''
    form.username = typeof saved.username === 'string' ? saved.username : ''
    form.directory = typeof saved.directory === 'string' ? saved.directory : 'cpabm-backups'
    form.filePrefix = typeof saved.filePrefix === 'string' ? saved.filePrefix : 'auth-backup'
    form.includeDisabled = saved.includeDisabled !== false
    form.rememberPassword = saved.rememberPassword === true
    form.password = form.rememberPassword && typeof saved.password === 'string' ? saved.password : ''
  } catch (error) {
    console.warn('Failed to load WebDAV config from localStorage:', error)
  }
}

const previewUploadUrl = computed(() => {
  const normalized = normalizeFormValues()
  if (!normalized.endpoint) return '-'
  const sampleName = `${normalized.filePrefix}-YYYY-MM-DDTHH-mm-ss-SSSZ.json`
  return buildUploadUrl(normalized.endpoint, normalized.directory, sampleName)
})

const handleSaveConfig = () => {
  const normalized = normalizeFormValues()
  if (!normalized.endpoint) {
    notificationStore.warning('请输入 WebDAV 地址')
    return
  }
  if (!normalized.username) {
    notificationStore.warning('请输入 WebDAV 用户名')
    return
  }

  savingConfig.value = true
  try {
    form.endpoint = normalized.endpoint
    form.username = normalized.username
    form.directory = normalized.directory
    form.filePrefix = normalized.filePrefix
    persistConfig()
    notificationStore.success('WebDAV 配置已保存到本地')
  } finally {
    savingConfig.value = false
  }
}

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const statusText = error.response?.statusText || ''
    const data = error.response?.data
    if (typeof data === 'string' && data.trim()) {
      return status ? `${status} ${statusText} - ${data}`.trim() : data
    }
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return status ? `${status} ${statusText} - ${data.error}`.trim() : data.error
    }
    if (status) return `${status} ${statusText}`.trim()
    return error.message || '网络请求失败'
  }
  if (error instanceof Error) return error.message
  return '未知错误'
}

const checkDirectoryExists = async (url: string, authHeader: string): Promise<boolean> => {
  const response = await axios.request({
    method: 'PROPFIND',
    url,
    timeout: 30000,
    headers: {
      Authorization: authHeader,
      Depth: '0'
    },
    validateStatus: () => true
  })

  if (response.status === 207 || response.status === 200) return true
  if (response.status === 404) return false
  if ([301, 302, 307, 308].includes(response.status)) return true
  if (response.status === 405) return false
  if (response.status === 401 || response.status === 403) {
    throw new Error('检查目录失败：认证失败或无目录访问权限')
  }
  throw new Error(`检查目录失败：${response.status} ${response.statusText || ''}`.trim())
}

const createDirectoryIfMissing = async (url: string, authHeader: string): Promise<boolean> => {
  const response = await axios.request({
    method: 'MKCOL',
    url,
    timeout: 30000,
    headers: {
      Authorization: authHeader
    },
    validateStatus: () => true
  })

  if ([201, 200, 204].includes(response.status)) return true
  if ([301, 302, 307, 308, 405].includes(response.status)) return false
  if (response.status === 401 || response.status === 403) {
    throw new Error('创建目录失败：认证失败或无写入权限')
  }
  if (response.status === 409) {
    throw new Error('创建目录失败：父目录不存在或无权限')
  }
  throw new Error(`创建目录失败：${response.status} ${response.statusText || ''}`.trim())
}

const ensureDirectoryExists = async (endpoint: string, directory: string, authHeader: string) => {
  if (!directory) {
    return { checked: 0, created: 0 }
  }

  const segments = directory.split('/').filter(Boolean)
  let current = ''
  let checked = 0
  let created = 0

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    const dirUrl = `${endpoint}/${encodePath(current)}`
    checked += 1

    const exists = await checkDirectoryExists(dirUrl, authHeader)
    if (exists) continue

    const didCreate = await createDirectoryIfMissing(dirUrl, authHeader)
    if (didCreate) created += 1
  }

  return { checked, created }
}

const collectBackupEntries = async (files: AuthFile[]): Promise<BackupFileEntry[]> => {
  backupProgress.total = files.length
  backupProgress.completed = 0
  backupProgress.current = ''

  const entries: BackupFileEntry[] = []
  for (const file of files) {
    backupProgress.current = file.name
    const blob = await authFilesApi.download(file.name)
    const text = await blob.text()

    const entry: BackupFileEntry = {
      name: file.name,
      provider: String(file.provider || ''),
      disabled: Boolean(file.disabled),
      size: Number(file.size || 0),
      updatedAt: file.updated_at || file.modtime || null
    }

    try {
      entry.content = JSON.parse(text)
    } catch (error: any) {
      entry.rawText = text
      entry.parseError = error?.message || 'JSON parse failed'
    }

    entries.push(entry)
    backupProgress.completed += 1
  }

  backupProgress.current = ''
  return entries
}

const handleBackupNow = async () => {
  if (backingUp.value) return
  if (!authStore.isConnected) {
    notificationStore.warning('请先连接服务器')
    return
  }

  const normalized = normalizeFormValues()
  if (!normalized.endpoint) {
    notificationStore.warning('请输入 WebDAV 地址')
    return
  }
  if (!normalized.username) {
    notificationStore.warning('请输入 WebDAV 用户名')
    return
  }
  if (!normalized.password) {
    notificationStore.warning('请输入 WebDAV 密码')
    return
  }

  form.endpoint = normalized.endpoint
  form.username = normalized.username
  form.directory = normalized.directory
  form.filePrefix = normalized.filePrefix
  persistConfig()

  backingUp.value = true
  backupProgress.total = 0
  backupProgress.completed = 0
  backupProgress.current = ''

  try {
    const authHeader = toBasicAuthHeader(normalized.username, normalized.password)
    backupProgress.current = normalized.directory ? `检查目录: ${normalized.directory}` : '检查目录'
    const ensureResult = await ensureDirectoryExists(normalized.endpoint, normalized.directory, authHeader)
    if (ensureResult.created > 0) {
      notificationStore.info(`已创建目录 ${ensureResult.created} 个`)
    }

    const response = await authFilesApi.list()
    const files = response.files
      .filter((file) => file.name.toLowerCase().endsWith('.json'))
      .filter((file) => normalized.includeDisabled || !file.disabled)

    if (files.length === 0) {
      notificationStore.warning('没有可备份的 JSON 文件')
      return
    }

    const entries = await collectBackupEntries(files)
    const parseFailed = entries.reduce((count, item) => count + (item.parseError ? 1 : 0), 0)
    const now = new Date()
    const fileName = `${normalized.filePrefix}-${formatTimestampForFile(now)}.json`
    const uploadUrl = buildUploadUrl(normalized.endpoint, normalized.directory, fileName)

    const payload = {
      schema: 'cpabm-webdav-backup-v1',
      exportedAt: now.toISOString(),
      source: {
        app: 'batch-auth-manager',
        apiUrl: authStore.apiUrl || '',
        includeDisabled: normalized.includeDisabled
      },
      stats: {
        totalFiles: entries.length,
        parseFailed
      },
      files: entries
    }
    const jsonText = JSON.stringify(payload, null, 2)

    await axios.put(uploadUrl, jsonText, {
      timeout: 120000,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      }
    })

    lastBackup.value = {
      fileName,
      uploadUrl,
      exportedAt: payload.exportedAt,
      totalFiles: entries.length,
      parseFailed,
      sizeBytes: new Blob([jsonText]).size
    }
    notificationStore.success(`备份完成：${entries.length} 个 JSON 文件`)
  } catch (error) {
    notificationStore.error(`备份失败: ${getErrorMessage(error)}`)
  } finally {
    backingUp.value = false
    backupProgress.current = ''
  }
}

onMounted(() => {
  loadSavedConfig()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">WebDAV 备份</h2>
        <p class="text-sm text-muted-foreground">将当前认证文件打包为一个 JSON，直接从浏览器上传到 WebDAV。</p>
      </div>
      <Button @click="handleBackupNow" :disabled="backingUp">
        <Loader2 v-if="backingUp" class="mr-2 h-4 w-4 animate-spin" />
        <CloudUpload v-else class="mr-2 h-4 w-4" />
        {{ backingUp ? '备份中' : '立即备份' }}
      </Button>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>连接配置</CardTitle>
        <CardDescription>此配置仅保存在当前浏览器，不依赖后端接口。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-2 lg:col-span-2">
            <Label>WebDAV 地址</Label>
            <Input v-model="form.endpoint" placeholder="https://dav.example.com/remote.php/dav/files/username" />
            <p class="text-[11px] text-muted-foreground">需要服务端允许浏览器跨域访问（CORS）以及 PUT 方法。</p>
          </div>

          <div class="space-y-2">
            <Label>用户名</Label>
            <Input v-model="form.username" placeholder="username" />
          </div>

          <div class="space-y-2">
            <Label>密码 / 应用密码</Label>
            <div class="flex items-center gap-2">
              <Input v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="password" />
              <Button size="sm" variant="outline" @click="showPassword = !showPassword">
                <component :is="showPassword ? EyeOff : Eye" class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label>远程目录（可选）</Label>
            <Input v-model="form.directory" placeholder="cpabm-backups" />
          </div>

          <div class="space-y-2">
            <Label>文件名前缀</Label>
            <Input v-model="form.filePrefix" placeholder="auth-backup" />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex items-center gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" v-model="form.includeDisabled" class="h-4 w-4 accent-primary" />
            备份禁用文件
          </label>
          <label class="flex items-center gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" v-model="form.rememberPassword" class="h-4 w-4 accent-primary" />
            本地保存密码
          </label>
        </div>

        <div class="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
          <div>目标路径预览：</div>
          <div class="font-mono break-all text-foreground">{{ previewUploadUrl }}</div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" @click="handleSaveConfig" :disabled="savingConfig || backingUp">
            <Loader2 v-if="savingConfig" class="mr-2 h-4 w-4 animate-spin" />
            保存配置
          </Button>
          <Button size="sm" @click="handleBackupNow" :disabled="backingUp">
            <Loader2 v-if="backingUp" class="mr-2 h-4 w-4 animate-spin" />
            开始备份
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>备份状态</CardTitle>
        <CardDescription>备份会读取当前服务端的认证 JSON 文件并打包上传。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="rounded-md border p-3">
          <div class="flex items-center justify-between text-sm">
            <span>进度</span>
            <span>{{ backupProgress.completed }}/{{ backupProgress.total }}</span>
          </div>
          <div v-if="backupProgress.current" class="mt-2 text-xs text-muted-foreground">
            当前文件：<span class="font-mono">{{ backupProgress.current }}</span>
          </div>
        </div>

        <div v-if="lastBackup" class="rounded-md border p-3 text-sm space-y-1">
          <div>最近备份：{{ new Date(lastBackup.exportedAt).toLocaleString('zh-CN') }}</div>
          <div>文件名：<span class="font-mono">{{ lastBackup.fileName }}</span></div>
          <div>文件数量：{{ lastBackup.totalFiles }}</div>
          <div>解析失败：{{ lastBackup.parseFailed }}</div>
          <div>文件大小：{{ formatBytes(lastBackup.sizeBytes) }}</div>
          <div class="text-xs text-muted-foreground break-all">上传地址：{{ lastBackup.uploadUrl }}</div>
        </div>
        <div v-else class="text-sm text-muted-foreground">
          暂无备份记录
        </div>
      </CardContent>
    </Card>
  </div>
</template>
