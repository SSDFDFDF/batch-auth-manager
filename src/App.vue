<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useQuotaStore } from './stores/quota'
import { useNotificationStore } from './stores/notification'
import AuthFileTable from './components/auth/AuthFileTable.vue'
import OAuthLoginTab from './components/auth/OAuthLoginTab.vue'
import Dashboard from './components/dashboard/Dashboard.vue'
import AiProvidersTable from './components/providers/AiProvidersTable.vue'
import SettingsPage from './components/settings/SettingsPage.vue'
import Button from './components/ui/Button.vue'
import Badge from './components/ui/badge/Badge.vue'
import Dialog from './components/ui/dialog/Dialog.vue'
import Input from './components/ui/Input.vue'
import Label from './components/ui/Label.vue'
import ToastContainer from './components/ui/toast/ToastContainer.vue'
import ConfirmDialog from './components/ui/toast/ConfirmDialog.vue'
import LogViewer from './components/logs/LogViewer.vue'
import { Server, Loader2, LayoutDashboard, FileText, Settings, LogOut, ScrollText, Sliders, ShieldCheck } from 'lucide-vue-next'

const notificationStore = useNotificationStore()

const authStore = useAuthStore()
const quotaStore = useQuotaStore()
const activeTab = ref('files')

const showConnectDialog = ref(!authStore.isConnected)
const connecting = ref(false)
const connectForm = reactive({
  apiUrl: authStore.apiUrl || 'http://localhost:8317',
  managementKey: authStore.managementKey || ''
})

watch(authStore.isConnected, (connected) => {
  if (connected) {
    showConnectDialog.value = false
  }
})

const handleConnect = async () => {
  if (!connectForm.apiUrl || !connectForm.managementKey) {
    notificationStore.warning('请填写 API 地址和管理密钥')
    return
  }

  connecting.value = true
  try {
    await authStore.connect(
      connectForm.apiUrl,
      connectForm.managementKey
    )
    showConnectDialog.value = false
    notificationStore.success('连接成功')
  } catch (error: any) {
    notificationStore.error('连接失败: ' + (error.message || '未知错误'))
  } finally {
    connecting.value = false
  }
}

const handleDisconnect = async () => {
  const confirmed = await notificationStore.showConfirmation({
    title: '断开连接',
    message: '确定要断开连接吗？',
    variant: 'danger'
  })

  if (confirmed) {
    authStore.disconnect()
  }
}
</script>

<template>
  <div class="min-h-screen bg-background font-sans antialiased">
    <ToastContainer />
    <ConfirmDialog />
    <div class="container mx-auto py-10 px-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-8 gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold tracking-tight">CPABM</h1>
          <p class="text-sm text-muted-foreground">高效管理您的认证文件。</p>
        </div>
        <div class="flex items-center gap-2">
           <Badge v-if="authStore.isConnected" variant="outline" class="h-8 gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
             <div class="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
             已连接
           </Badge>
           <Badge v-if="authStore.isConnected && quotaStore.isAnyLoading" variant="outline" class="h-8 gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
             <Loader2 class="h-3 w-3 animate-spin" />
             正在刷新额度
           </Badge>
           <Button v-if="!authStore.isConnected" size="sm" @click="showConnectDialog = true">连接</Button>
           <Button
             v-if="authStore.isConnected"
             size="sm"
             variant="outline"
             @click="handleDisconnect"
             title="断开连接"
             class="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors"
           >
             <LogOut class="h-4 w-4" />
           </Button>
        </div>
      </div>

      <!-- Navigation -->
      <div v-if="authStore.isConnected" class="flex items-center gap-4 border-b mb-6">
        <button
          @click="activeTab = 'files'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'files' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <FileText class="w-4 h-4" />
          认证文件
        </button>
        <button
          @click="activeTab = 'providers'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'providers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <Settings class="w-4 h-4" />
          AI 提供商
        </button>
        <button
          @click="activeTab = 'oauth'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'oauth' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <ShieldCheck class="w-4 h-4" />
          OAuth 登录
        </button>
        <button
          @click="activeTab = 'dashboard'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'dashboard' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <LayoutDashboard class="w-4 h-4" />
          仪表盘
        </button>
        <button
          @click="activeTab = 'logs'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'logs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <ScrollText class="w-4 h-4" />
          日志
        </button>
        <button
          @click="activeTab = 'settings'"
          class="flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors hover:text-primary"
          :class="activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
        >
          <Sliders class="w-4 h-4" />
          设置
        </button>
      </div>

      <!-- Main Content -->
      <div v-if="authStore.isConnected" class="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
        <AuthFileTable v-if="activeTab === 'files'" />
        <AiProvidersTable v-else-if="activeTab === 'providers'" />
        <OAuthLoginTab v-else-if="activeTab === 'oauth'" />
        <Dashboard v-else-if="activeTab === 'dashboard'" />
        <LogViewer v-else-if="activeTab === 'logs'" />
        <SettingsPage v-else-if="activeTab === 'settings'" />
      </div>
      
      <div v-else class="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed text-center animate-in fade-in-50">
        <div class="rounded-full bg-muted p-3">
          <Server class="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 class="mt-4 text-lg font-semibold">未连接</h3>
        <p class="mb-4 text-sm text-muted-foreground">连接到 CLIProxyAPI 服务器以管理文件。</p>
        <Button @click="showConnectDialog = true">连接服务器</Button>
      </div>


      <!-- Connect Dialog -->
      <Dialog :open="showConnectDialog" @update:open="showConnectDialog = $event" title="连接到服务器" description="输入您的 API 地址和管理密钥。">
        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <Label for="apiUrl">API 地址</Label>
            <Input id="apiUrl" v-model="connectForm.apiUrl" placeholder="http://localhost:8317" />
          </div>
          <div class="grid gap-2">
            <Label for="apiKey">管理密钥</Label>
            <Input id="apiKey" v-model="connectForm.managementKey" type="password" placeholder="输入密钥" />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="showConnectDialog = false">取消</Button>
          <Button @click="handleConnect" :disabled="connecting">
            <Loader2 v-if="connecting" class="mr-2 h-4 w-4 animate-spin" />
            连接
          </Button>
        </div>
      </Dialog>
    </div>
  </div>
</template>
