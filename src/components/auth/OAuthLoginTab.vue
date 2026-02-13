<script setup lang="ts">
import { reactive, ref, onUnmounted } from 'vue'
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-vue-next'
import { oauthApi, type OAuthProvider } from '../../api/oauth'
import { vertexApi, type VertexImportResponse } from '../../api/vertex'
import { useNotificationStore } from '../../stores/notification'
import { cn } from '../../lib/utils'

import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Label from '../ui/Label.vue'
import Card from '../ui/Card.vue'
import CardHeader from '../ui/CardHeader.vue'
import CardTitle from '../ui/CardTitle.vue'
import CardDescription from '../ui/CardDescription.vue'
import CardContent from '../ui/CardContent.vue'

interface ProviderState {
  url?: string
  state?: string
  status?: 'idle' | 'waiting' | 'success' | 'error'
  error?: string
  polling?: boolean
  projectId?: string
  callbackUrl?: string
  callbackSubmitting?: boolean
  callbackStatus?: 'success' | 'error'
  callbackError?: string
}

interface ProviderConfig {
  id: OAuthProvider
  label: string
  hint: string
}

interface VertexImportResult {
  projectId?: string
  email?: string
  location?: string
  authFile?: string
}

interface VertexImportState {
  file?: File
  fileName: string
  location: string
  loading: boolean
  error?: string
  result?: VertexImportResult
}

const providers: ProviderConfig[] = [
  {
    id: 'codex',
    label: 'Codex OAuth',
    hint: '通过 OAuth 登录 Codex 并自动保存认证文件。'
  },
  {
    id: 'anthropic',
    label: 'Anthropic OAuth',
    hint: '通过 OAuth 登录 Anthropic (Claude) 并自动保存认证文件。'
  },
  {
    id: 'antigravity',
    label: 'Antigravity OAuth',
    hint: '通过 OAuth 登录 Antigravity (Google) 并自动保存认证文件。'
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI OAuth',
    hint: '通过 OAuth 登录 Google Gemini CLI 并自动保存认证文件。'
  },
  {
    id: 'kimi',
    label: 'Kimi OAuth',
    hint: '通过设备码流程登录 Kimi 并自动保存认证文件。'
  },
  {
    id: 'qwen',
    label: 'Qwen OAuth',
    hint: '通过设备码流程登录 Qwen 并自动保存认证文件。'
  }
]

const callbackSupported = new Set<OAuthProvider>(['codex', 'anthropic', 'antigravity', 'gemini-cli'])

const notificationStore = useNotificationStore()

const providerStates = reactive<Record<OAuthProvider, ProviderState>>({
  codex: { status: 'idle', callbackUrl: '' },
  anthropic: { status: 'idle', callbackUrl: '' },
  antigravity: { status: 'idle', callbackUrl: '' },
  'gemini-cli': { status: 'idle', callbackUrl: '', projectId: '' },
  kimi: { status: 'idle', callbackUrl: '' },
  qwen: { status: 'idle', callbackUrl: '' }
})

const vertexState = reactive<VertexImportState>({
  fileName: '',
  location: '',
  loading: false
})
const vertexFileInputRef = ref<HTMLInputElement | null>(null)

const pollTimers: Partial<Record<OAuthProvider, number>> = {}

const statusLabels: Record<NonNullable<ProviderState['status']>, string> = {
  idle: '',
  waiting: '等待认证中',
  success: '认证成功',
  error: '认证失败'
}

const getStatusClass = (status?: ProviderState['status']) => {
  switch (status) {
    case 'success':
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
    case 'error':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
    case 'waiting':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300'
    default:
      return 'border-muted text-muted-foreground'
  }
}

const stopPolling = (provider: OAuthProvider) => {
  const timer = pollTimers[provider]
  if (timer) {
    window.clearInterval(timer)
    delete pollTimers[provider]
  }
}

const startPolling = (provider: OAuthProvider, state: string) => {
  stopPolling(provider)
  const timer = window.setInterval(async () => {
    try {
      const res = await oauthApi.getAuthStatus(state)
      if (res.status === 'ok') {
        providerStates[provider].status = 'success'
        providerStates[provider].polling = false
        stopPolling(provider)
        notificationStore.success(`${providers.find((p) => p.id === provider)?.label || 'OAuth'} 认证成功`)
      } else if (res.status === 'error') {
        providerStates[provider].status = 'error'
        providerStates[provider].error = res.error || '认证失败'
        providerStates[provider].polling = false
        stopPolling(provider)
        notificationStore.error(`${providers.find((p) => p.id === provider)?.label || 'OAuth'} 认证失败: ${res.error || ''}`)
      }
    } catch (error: any) {
      providerStates[provider].status = 'error'
      providerStates[provider].error = error?.message || '认证失败'
      providerStates[provider].polling = false
      stopPolling(provider)
      notificationStore.error(`${providers.find((p) => p.id === provider)?.label || 'OAuth'} 认证失败: ${error?.message || ''}`)
    }
  }, 3000)

  pollTimers[provider] = timer
}

const startAuth = async (provider: OAuthProvider) => {
  stopPolling(provider)
  providerStates[provider].status = 'waiting'
  providerStates[provider].polling = true
  providerStates[provider].error = undefined
  providerStates[provider].url = undefined
  providerStates[provider].state = undefined
  providerStates[provider].callbackStatus = undefined
  providerStates[provider].callbackError = undefined

  try {
    const projectId = provider === 'gemini-cli' ? (providerStates[provider].projectId || '').trim() : ''
    const res = await oauthApi.startAuth(provider, projectId ? { projectId } : undefined)
    providerStates[provider].url = res.url
    providerStates[provider].state = res.state

    if (res.state) {
      startPolling(provider, res.state)
    } else {
      providerStates[provider].polling = false
    }
  } catch (error: any) {
    providerStates[provider].status = 'error'
    providerStates[provider].error = error?.message || '启动失败'
    providerStates[provider].polling = false
    notificationStore.error(`${providers.find((p) => p.id === provider)?.label || 'OAuth'} 启动失败: ${error?.message || ''}`)
  }
}

const copyLink = async (url?: string) => {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    notificationStore.success('链接已复制')
  } catch {
    notificationStore.error('复制失败')
  }
}

const submitCallback = async (provider: OAuthProvider) => {
  const redirectUrl = (providerStates[provider].callbackUrl || '').trim()
  if (!redirectUrl) {
    notificationStore.warning('请先粘贴完整的回调 URL')
    return
  }

  providerStates[provider].callbackSubmitting = true
  providerStates[provider].callbackStatus = undefined
  providerStates[provider].callbackError = undefined

  try {
    await oauthApi.submitCallback(provider, redirectUrl)
    providerStates[provider].callbackSubmitting = false
    providerStates[provider].callbackStatus = 'success'
    notificationStore.success('Callback URL 已提交，请继续等待认证')
  } catch (error: any) {
    providerStates[provider].callbackSubmitting = false
    providerStates[provider].callbackStatus = 'error'
    providerStates[provider].callbackError = error?.message || '提交失败'
    notificationStore.error(`提交失败: ${error?.message || ''}`)
  }
}

const handlePickVertexFile = () => {
  vertexFileInputRef.value?.click()
}

const handleVertexFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  vertexState.file = file
  vertexState.fileName = file?.name || ''
}

const normalizeVertexResult = (response: VertexImportResponse): VertexImportResult => {
  return {
    projectId: response.project_id || response.projectId,
    email: response.email,
    location: response.location,
    authFile: response['auth-file'] || response.auth_file
  }
}

const handleVertexImport = async () => {
  if (!vertexState.file) {
    notificationStore.warning('请选择 Vertex 凭证文件')
    return
  }
  vertexState.loading = true
  vertexState.error = undefined
  vertexState.result = undefined
  try {
    const response = await vertexApi.importCredential(vertexState.file, vertexState.location.trim() || undefined)
    vertexState.result = normalizeVertexResult(response)
    notificationStore.success('Vertex 凭证导入成功')
  } catch (error: any) {
    vertexState.error = error?.message || '导入失败'
    notificationStore.error(`导入失败: ${vertexState.error}`)
  } finally {
    vertexState.loading = false
  }
}

onUnmounted(() => {
  Object.keys(pollTimers).forEach((key) => {
    const provider = key as OAuthProvider
    stopPolling(provider)
  })
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2 text-xl font-semibold">
        <ShieldCheck class="h-5 w-5 text-primary" />
        OAuth 登录
      </div>
      <p class="text-sm text-muted-foreground">通过 OAuth 快速生成并保存认证文件，支持 WebUI 回调和设备码流程。</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card v-for="provider in providers" :key="provider.id" class="flex flex-col">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <CardTitle class="text-base flex items-center gap-2">
                <KeyRound class="h-4 w-4 text-primary" />
                {{ provider.label }}
              </CardTitle>
              <CardDescription class="text-xs">{{ provider.hint }}</CardDescription>
            </div>
            <div
              v-if="providerStates[provider.id].status && providerStates[provider.id].status !== 'idle'"
              :class="cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', getStatusClass(providerStates[provider.id].status))"
            >
              <Loader2 v-if="providerStates[provider.id].status === 'waiting'" class="h-3 w-3 animate-spin" />
              <CheckCircle2 v-else-if="providerStates[provider.id].status === 'success'" class="h-3 w-3" />
              <XCircle v-else-if="providerStates[provider.id].status === 'error'" class="h-3 w-3" />
              <span>{{ statusLabels[providerStates[provider.id].status || 'idle'] }}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent class="space-y-3">
          <div v-if="provider.id === 'gemini-cli'" class="space-y-2">
            <Label>Project ID（可选）</Label>
            <Input v-model="providerStates[provider.id].projectId" placeholder="如 my-google-project" />
            <p class="text-xs text-muted-foreground">不填写将自动选择第一个可用项目。</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button size="sm" @click="startAuth(provider.id)" :disabled="providerStates[provider.id].polling">
              <Loader2 v-if="providerStates[provider.id].polling" class="mr-2 h-4 w-4 animate-spin" />
              {{ providerStates[provider.id].status === 'success' ? '重新登录' : '开始登录' }}
            </Button>
            <Button
              v-if="providerStates[provider.id].url"
              size="sm"
              variant="outline"
              @click="copyLink(providerStates[provider.id].url)"
            >
              <Copy class="mr-2 h-4 w-4" />
              复制链接
            </Button>
          </div>

          <div v-if="providerStates[provider.id].url" class="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <div class="text-xs text-muted-foreground">授权地址</div>
            <div class="mt-1 break-all font-medium text-foreground">{{ providerStates[provider.id].url }}</div>
          </div>

          <div v-if="providerStates[provider.id].error" class="text-xs text-red-600">
            {{ providerStates[provider.id].error }}
          </div>

          <div v-if="callbackSupported.has(provider.id)" class="space-y-2 border-t pt-3">
            <Label>Callback URL（远程浏览器场景）</Label>
            <Input
              v-model="providerStates[provider.id].callbackUrl"
              placeholder="http://localhost:1455/auth/callback?code=...&state=..."
            />
            <div class="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                @click="submitCallback(provider.id)"
                :disabled="providerStates[provider.id].callbackSubmitting"
              >
                <Loader2 v-if="providerStates[provider.id].callbackSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                提交 Callback URL
              </Button>
              <span
                v-if="providerStates[provider.id].callbackStatus === 'success'"
                class="text-xs text-green-600"
              >
                Callback 已提交，等待认证
              </span>
              <span
                v-else-if="providerStates[provider.id].callbackStatus === 'error'"
                class="text-xs text-red-600"
              >
                {{ providerStates[provider.id].callbackError || '提交失败' }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              远程浏览器无法自动回调时，请复制完整重定向 URL 并提交。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card class="flex flex-col">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <CardTitle class="text-base flex items-center gap-2">
                <KeyRound class="h-4 w-4 text-primary" />
                Vertex 凭证导入
              </CardTitle>
              <CardDescription class="text-xs">上传 GCP Vertex 凭证文件并生成认证文件。</CardDescription>
            </div>
            <div
              v-if="vertexState.loading || vertexState.result || vertexState.error"
              :class="cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', getStatusClass(vertexState.loading ? 'waiting' : vertexState.result ? 'success' : 'error'))"
            >
              <Loader2 v-if="vertexState.loading" class="h-3 w-3 animate-spin" />
              <CheckCircle2 v-else-if="vertexState.result" class="h-3 w-3" />
              <XCircle v-else class="h-3 w-3" />
              <span>{{ vertexState.loading ? '导入中' : vertexState.result ? '导入成功' : '导入失败' }}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <Label>Region（可选）</Label>
            <Input v-model="vertexState.location" placeholder="例如 us-central1" />
          </div>
          <div class="space-y-2">
            <Label>凭证文件</Label>
            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" @click="handlePickVertexFile">选择文件</Button>
              <span v-if="!vertexState.fileName" class="text-xs text-muted-foreground">未选择</span>
              <span v-else class="text-xs font-mono">{{ vertexState.fileName }}</span>
            </div>
            <input
              ref="vertexFileInputRef"
              type="file"
              class="hidden"
              @change="handleVertexFileChange"
            />
          </div>
          <Button size="sm" @click="handleVertexImport" :disabled="vertexState.loading">
            <Loader2 v-if="vertexState.loading" class="mr-2 h-4 w-4 animate-spin" />
            导入
          </Button>
          <div v-if="vertexState.error" class="text-xs text-red-600">
            {{ vertexState.error }}
          </div>
          <div v-if="vertexState.result" class="space-y-1 text-xs text-muted-foreground">
            <div v-if="vertexState.result.projectId">Project: {{ vertexState.result.projectId }}</div>
            <div v-if="vertexState.result.email">Email: {{ vertexState.result.email }}</div>
            <div v-if="vertexState.result.location">Region: {{ vertexState.result.location }}</div>
            <div v-if="vertexState.result.authFile">Auth File: {{ vertexState.result.authFile }}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
