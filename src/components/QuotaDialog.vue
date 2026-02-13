<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuotaStore, quotaKey } from '../stores/quota'
import { useQuotaLoader } from '../composables/useQuotaLoader'
import { formatResetTime } from '../utils/quota'
import Dialog from './ui/dialog/Dialog.vue'
import Button from './ui/Button.vue'
import { RefreshCw, AlertCircle } from 'lucide-vue-next'

interface Props {
  modelValue: boolean
  file: any
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const quotaStore = useQuotaStore()
const { loadSingleQuota } = useQuotaLoader()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const quotaResult = ref<any>(null)
const error = ref<string | null>(null)
const fileQuotaKey = computed(() => props.file ? quotaKey.file(props.file.name) : '')
const cacheInfo = computed(() => {
  if (!fileQuotaKey.value) return null
  const updatedAt = quotaStore.getUpdatedAt(fileQuotaKey.value)
  if (!updatedAt) return null
  return {
    updatedAt,
    expired: quotaStore.isExpired(fileQuotaKey.value)
  }
})

async function loadQuota(force = false) {
  if (!props.file) return

  loading.value = true
  error.value = null
  quotaResult.value = null

  try {
    const result = await loadSingleQuota(props.file, { force })
    quotaResult.value = result
  } catch (err: any) {
    error.value = err.message || '加载配额失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (value) => {
  if (value && props.file) {
    const key = fileQuotaKey.value
    const cached = key ? quotaStore.getQuotaStatus(key) : null
    if (cached?.status === 'success' && key && !quotaStore.isExpired(key)) {
      quotaResult.value = { type: cached.type, data: cached.data }
      error.value = null
      loading.value = false
    } else {
      loadQuota()
    }
  }
})

function getProgressColorClass(percent: number) {
  if (percent >= 50) return 'bg-green-500'
  if (percent >= 20) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getTextColorClass(percent: number) {
  if (percent >= 50) return 'text-green-600'
  if (percent >= 20) return 'text-yellow-600'
  return 'text-red-600'
}

function formatUpdatedAt(timestamp?: number | null) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="open = $event"
    :title="'配额信息'"
    :description="file ? `${file.name} (${file.type || 'Unknown'})` : ''"
    class="!w-[90vw] !max-w-3xl max-h-[85vh] overflow-hidden"
  >
    <div class="space-y-4 max-h-[calc(85vh-12rem)] overflow-y-auto px-1">
      <div v-if="file" class="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span>上次更新: </span>
          <span v-if="cacheInfo">{{ formatUpdatedAt(cacheInfo.updatedAt) }}</span>
          <span v-else>未缓存</span>
          <span v-if="cacheInfo?.expired" class="ml-2 text-amber-600">待更新</span>
        </div>
        <Button size="sm" variant="outline" @click="loadQuota(true)" :disabled="loading">
          <RefreshCw class="mr-2 h-3.5 w-3.5" />
          刷新
        </Button>
      </div>
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <RefreshCw class="h-6 w-6 animate-spin text-gray-500" />
        <span class="ml-2 text-sm text-gray-500">加载中...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="rounded-lg border border-red-300 bg-red-50 p-4">
        <div class="flex items-center">
          <AlertCircle class="h-4 w-4 text-red-600 mr-2" />
          <p class="text-sm text-red-800">{{ error }}</p>
        </div>
      </div>

      <!-- Antigravity Quota -->
      <div v-else-if="quotaResult?.type === 'antigravity'" class="space-y-3">
        <div v-if="quotaResult.data.groups?.length > 0">
          <h3 class="text-sm font-medium mb-2">模型组配额</h3>
          <div class="space-y-1.5">
            <div
              v-for="group in quotaResult.data.groups"
              :key="group.name"
              class="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50"
            >
              <span class="text-xs font-medium w-32 shrink-0 truncate">{{ group.name }}</span>
              <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                <div
                  :class="getProgressColorClass(group.percent)"
                  class="h-full transition-all"
                  :style="{ width: `${group.percent}%` }"
                />
              </div>
              <span :class="getTextColorClass(group.percent)" class="text-xs font-semibold w-10 text-right shrink-0">
                {{ group.percent }}%
              </span>
              <span v-if="group.resetTime" class="text-[11px] text-gray-400 w-24 text-right shrink-0">
                {{ formatResetTime(group.resetTime) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-500 text-center py-8">
          暂无配额信息
        </div>
      </div>

      <!-- Gemini CLI Quota -->
      <div v-else-if="quotaResult?.type === 'gemini-cli'" class="space-y-3">
        <div v-if="quotaResult.data.buckets?.length > 0">
          <h3 class="text-sm font-medium mb-2">模型配额</h3>
          <div class="space-y-1.5">
            <div
              v-for="bucket in quotaResult.data.buckets"
              :key="bucket.modelId"
              class="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50"
            >
              <span class="text-xs font-medium w-32 shrink-0 truncate">{{ bucket.modelId }}</span>
              <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                <div
                  :class="getProgressColorClass(bucket.percent)"
                  class="h-full transition-all"
                  :style="{ width: `${bucket.percent}%` }"
                />
              </div>
              <span :class="getTextColorClass(bucket.percent)" class="text-xs font-semibold w-10 text-right shrink-0">
                {{ bucket.percent }}%
              </span>
              <span v-if="bucket.resetTime" class="text-[11px] text-gray-400 w-24 text-right shrink-0">
                {{ formatResetTime(bucket.resetTime) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-500 text-center py-8">
          暂无配额信息
        </div>
      </div>

      <!-- Codex Quota -->
      <div v-else-if="quotaResult?.type === 'codex'" class="space-y-3">
        <div v-if="quotaResult.data.planType" class="text-sm px-3 py-1.5 rounded-lg bg-gray-50">
          <span class="font-medium">计划类型:</span>
          <span class="ml-2">{{ quotaResult.data.planType }}</span>
          <span v-if="quotaResult.data.campaignId" class="ml-3 text-xs text-gray-500">
            活动: {{ quotaResult.data.campaignId }}
          </span>
        </div>

        <div v-if="quotaResult.data.limits?.length > 0">
          <h3 class="text-sm font-medium mb-2">速率限制</h3>
          <div class="space-y-1.5">
            <div
              v-for="limit in quotaResult.data.limits"
              :key="limit.model"
              class="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50"
            >
              <span class="text-xs font-medium w-24 shrink-0">{{ limit.model }}</span>
              <template v-if="limit.percent !== null">
                <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    :class="getProgressColorClass(limit.percent)"
                    class="h-full transition-all"
                    :style="{ width: `${limit.percent}%` }"
                  />
                </div>
                <span :class="getTextColorClass(limit.percent)" class="text-xs font-semibold w-10 text-right shrink-0">
                  {{ limit.percent }}%
                </span>
              </template>
              <template v-else>
                <div class="flex-1 text-xs text-gray-400">无法获取</div>
              </template>
              <span v-if="limit.resetTime" class="text-[11px] text-gray-400 w-24 text-right shrink-0">
                {{ formatResetTime(limit.resetTime) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-500 text-center py-8">
          暂无速率限制信息
        </div>
      </div>

      <!-- Unknown Type -->
      <div v-else class="text-sm text-gray-500 text-center py-8">
        不支持的配额类型
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          @click="loadQuota"
          :disabled="loading"
        >
          <RefreshCw :class="{ 'animate-spin': loading }" class="h-4 w-4 mr-2" />
          刷新
        </Button>
        <Button variant="secondary" size="sm" @click="open = false">
          关闭
        </Button>
      </div>
    </div>
  </Dialog>
</template>
