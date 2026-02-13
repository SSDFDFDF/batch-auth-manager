<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { authFilesApi } from '../api/authFiles'
import { useNotificationStore } from '../stores/notification'
import Dialog from './ui/dialog/Dialog.vue'
import Button from './ui/Button.vue'
import Input from './ui/Input.vue'
import Label from './ui/Label.vue'
import Badge from './ui/badge/Badge.vue'
import Progress from './ui/progress/Progress.vue'
import { Loader2, X, Plus, Eye, EyeOff } from 'lucide-vue-next'

const notificationStore = useNotificationStore()

interface Props {
  modelValue: boolean
  files: any[]
}

interface FieldUpdate {
  name: string
  value: string
  type: 'string' | 'number' | 'boolean' | 'json'
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue', 'success', 'remove'])

// 并发控制配置
const CONCURRENT_LIMIT = 5
const MAX_RETRIES = 3

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 基础字段配置
const selectedField = ref('proxy_url')
const customFieldName = ref('')
const fieldValue = ref('')
const valueType = ref<'string' | 'number' | 'boolean' | 'json'>('string')

// 多字段模式
const multiFieldMode = ref(false)
const fields = ref<FieldUpdate[]>([
  { name: 'proxy_url', value: '', type: 'string' }
])

// 处理状态
const processing = ref(false)
const processedCount = ref(0)
const results = ref<any[]>([])

// 预览相关
const showPreview = ref(false)
const previewLoading = ref(false)
const previewData = ref<Record<string, { entries: { key: string; value: any; status: 'unchanged' | 'modified' | 'added' | 'deleted' }[] }>>({})
let previewRequestId = 0

const progress = computed(() => {
  if (props.files.length === 0) return 0
  return Math.round((processedCount.value / props.files.length) * 100)
})

const canApply = computed(() => {
  if (props.files.length === 0) return false

  if (multiFieldMode.value) {
    // 多字段模式：至少有一个字段名不为空
    return fields.value.some(f => f.name.trim() !== '')
  } else {
    // 单字段模式
    if (selectedField.value === 'custom' && !customFieldName.value.trim()) return false
    return true
  }
})

const getPlaceholder = () => {
  if (valueType.value === 'json') {
    return '例如: {"key": "value"}'
  }
  if (selectedField.value === 'proxy_url') {
    return '例如: http://proxy.example.com:8080'
  } else if (selectedField.value === 'prefix') {
    return '例如: gemini/'
  } else {
    return '输入字段值'
  }
}

const handleRemoveFile = (name: string) => {
  emit('remove', name)
}

const handleClose = () => {
  if (processing.value) return
  visible.value = false
  previewRequestId += 1
  previewLoading.value = false
  setTimeout(() => {
    selectedField.value = 'proxy_url'
    customFieldName.value = ''
    fieldValue.value = ''
    valueType.value = 'string'
    multiFieldMode.value = false
    fields.value = [{ name: 'proxy_url', value: '', type: 'string' }]
    results.value = []
    processedCount.value = 0
    showPreview.value = false
    previewLoading.value = false
    previewData.value = {}
  }, 300)
}

// 多字段管理
const addField = () => {
  fields.value.push({ name: '', value: '', type: 'string' })
}

const removeField = (index: number) => {
  if (fields.value.length > 1) {
    fields.value.splice(index, 1)
  }
}

// 模板变量解析
const resolveTemplate = (template: string, index: number, fileName: string): string => {
  return template
    // {AUTO_INCREMENT} 或 {AUTO_INCREMENT(start)} 或 {AUTO_INCREMENT(start,step)}
    .replace(/\{AUTO_INCREMENT(?:\((\d+)(?:,(\d+))?\))?\}/g, (_, start, step) => {
      const s = start ? parseInt(start) : 0
      const st = step ? parseInt(step) : 1
      return String(s + index * st)
    })
    // {RANDOM_NUMBER} 或 {RANDOM_NUMBER(length)} 或 {RANDOM_NUMBER(min,max)}
    .replace(/\{RANDOM_NUMBER(?:\((\d+)(?:,(\d+))?\))?\}/g, (_, a, b) => {
      if (a !== undefined && b !== undefined) {
        const min = parseInt(a)
        const max = parseInt(b)
        return String(Math.floor(Math.random() * (max - min + 1)) + min)
      }
      const len = a ? parseInt(a) : 6
      const min = Math.pow(10, len - 1)
      const max = Math.pow(10, len) - 1
      return String(Math.floor(Math.random() * (max - min + 1)) + min)
    })
    // {RANDOM_ALPHA} 或 {RANDOM_ALPHA(length)}
    .replace(/\{RANDOM_ALPHA(?:\((\d+)\))?\}/g, (_, len) => {
      const n = len ? parseInt(len) : 6
      return Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
    })
    // {RANDOM_HEX} 或 {RANDOM_HEX(length)}
    .replace(/\{RANDOM_HEX(?:\((\d+)\))?\}/g, (_, len) => {
      const n = len ? parseInt(len) : 8
      return Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    })
    // {RANDOM_UUID}
    .replace(/\{RANDOM_UUID\}/g, () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.floor(Math.random() * 16)
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
    })
    .replace(/\{FILE_NAME\}/g, fileName.replace(/\.[^.]+$/, ''))
    .replace(/\{INDEX\}/g, String(index))
}

const hasTemplate = (value: string) => /\{(AUTO_INCREMENT|RANDOM_NUMBER|RANDOM_ALPHA|RANDOM_HEX|RANDOM_UUID|FILE_NAME|INDEX)(\([^)]*\))?\}/.test(value)

// 值类型转换
const parseValue = (rawValue: string, type: 'string' | 'number' | 'boolean' | 'json'): any => {
  if (rawValue === '') return ''

  try {
    switch (type) {
      case 'number':
        const num = Number(rawValue)
        if (isNaN(num)) throw new Error('无效的数字')
        return num
      case 'boolean':
        return rawValue === 'true' || rawValue === '1'
      case 'json':
        return JSON.parse(rawValue)
      default:
        return rawValue
    }
  } catch (error: any) {
    throw new Error(`值类型转换失败 (${type}): ${error.message}`)
  }
}

// 应用字段更新到 JSON 对象
const applyFieldUpdates = (json: any, updates: FieldUpdate[], index: number, fileName: string): any => {
  const result = { ...json }

  for (const update of updates) {
    const fieldName = update.name.trim()
    if (!fieldName) continue

    if (update.value === '') {
      delete result[fieldName]
    } else {
      const resolvedValue = resolveTemplate(update.value, index, fileName)
      result[fieldName] = parseValue(resolvedValue, update.type)
    }
  }

  return result
}

// 获取要应用的字段更新列表
const getFieldUpdates = (): FieldUpdate[] => {
  if (multiFieldMode.value) {
    return fields.value.filter(f => f.name.trim() !== '')
  } else {
    const fieldName = selectedField.value === 'custom'
      ? customFieldName.value.trim()
      : selectedField.value

    if (!fieldName) return []

    return [{
      name: fieldName,
      value: fieldValue.value.trim(),
      type: valueType.value
    }]
  }
}

// 处理单个文件（带重试）
const processFile = async (
  file: any,
  updates: FieldUpdate[],
  fileIndex: number,
  retries = MAX_RETRIES
): Promise<void> => {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // 下载文件
      const blob = await authFilesApi.download(file.name)
      const text = await blob.text()

      // 解析 JSON
      let json: any
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error('JSON 格式错误')
      }

      // 应用字段更新
      const updatedJson = applyFieldUpdates(json, updates, fileIndex, file.name)

      // 上传更新后的文件
      const newContent = JSON.stringify(updatedJson, null, 2)
      const newBlob = new Blob([newContent], { type: 'application/json' })
      const newFile = new File([newBlob], file.name, { type: 'application/json' })

      await authFilesApi.upload(newFile)

      // 成功
      results.value.push({
        name: file.name,
        success: true
      })
      return

    } catch (error: any) {
      lastError = error

      // 如果不是最后一次尝试，等待后重试（指数退避）
      if (attempt < retries - 1) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }
  }

  // 所有重试都失败
  results.value.push({
    name: file.name,
    success: false,
    error: `重试${retries}次后失败: ${lastError?.message || '未知错误'}`
  })
}

// 主处理函数（带并发控制）
const handleApply = async () => {
  if (!canApply.value) return

  const updates = getFieldUpdates()
  if (updates.length === 0) {
    notificationStore.warning('请至少配置一个字段')
    return
  }

  // 验证值类型（跳过含模板变量的值，模板替换后再转换）
  try {
    for (const update of updates) {
      if (update.value !== '' && !hasTemplate(update.value)) {
        parseValue(update.value, update.type)
      }
    }
  } catch (error: any) {
    notificationStore.error(error.message)
    return
  }

  processing.value = true
  processedCount.value = 0
  results.value = []

  // 分批并发处理
  for (let i = 0; i < props.files.length; i += CONCURRENT_LIMIT) {
    const batch = props.files.slice(i, i + CONCURRENT_LIMIT)

    await Promise.allSettled(
      batch.map((file, batchIdx) =>
        processFile(file, updates, i + batchIdx).then(() => {
          processedCount.value++
        })
      )
    )
  }

  processing.value = false

  const failCount = results.value.filter(r => !r.success).length

  if (failCount === 0) {
    emit('success')
    setTimeout(() => {
      handleClose()
    }, 2000)
  }
}

// 预览功能
const generatePreview = async () => {
  if (props.files.length === 0) {
    previewData.value = {}
    previewLoading.value = false
    return
  }

  const updates = getFieldUpdates()
  if (updates.length === 0) {
    previewData.value = {}
    previewLoading.value = false
    return
  }

  showPreview.value = true
  previewLoading.value = true
  const requestId = (previewRequestId += 1)
  previewData.value = {}

  const changedKeySet = new Set(updates.map(u => u.name.trim()))

  // 只预览前3个文件
  const previewFiles = props.files.slice(0, 3)

  try {
    for (let fileIndex = 0; fileIndex < previewFiles.length; fileIndex++) {
      if (requestId !== previewRequestId) return
      const file = previewFiles[fileIndex]
      try {
        const blob = await authFilesApi.download(file.name)
        const text = await blob.text()
        const original = JSON.parse(text)
        const updated = applyFieldUpdates(original, updates, fileIndex, file.name)

        const entries: { key: string; value: any; status: 'unchanged' | 'modified' | 'added' | 'deleted' }[] = []

        // 遍历更新后的所有字段
        for (const key of Object.keys(updated)) {
          if (changedKeySet.has(key)) {
            entries.push({ key, value: updated[key], status: key in original ? 'modified' : 'added' })
          } else {
            entries.push({ key, value: updated[key], status: 'unchanged' })
          }
        }

        // 被删除的字段（原始有但更新后没有）
        for (const update of updates) {
          const k = update.name.trim()
          if (update.value === '' && k in original) {
            entries.push({ key: k, value: original[k], status: 'deleted' })
          }
        }

        if (requestId === previewRequestId) {
          previewData.value[file.name] = { entries }
        }
      } catch (error: any) {
        if (requestId === previewRequestId) {
          previewData.value[file.name] = { entries: [{ key: 'error', value: error.message, status: 'deleted' as const }] }
        }
      }
    }
  } finally {
    if (requestId === previewRequestId) {
      previewLoading.value = false
    }
  }
}

const togglePreview = async () => {
  if (showPreview.value) {
    showPreview.value = false
    previewLoading.value = false
  } else {
    await generatePreview()
  }
}

watch(() => props.files.length, (newLen) => {
  if (newLen === 0 && visible.value && !processing.value) {
    visible.value = false
  }
})
</script>

<template>
  <Dialog
    :open="visible"
    @update:open="visible = $event"
    title="批量修改字段"
    description="修改选中文件的字段。现有字段将被覆盖。"
    class="w-full sm:max-w-3xl lg:max-w-5xl"
  >
    <div class="space-y-4 py-4 max-h-[70vh] overflow-y-auto overflow-x-hidden pr-1">
      <!-- 文件信息 -->
      <div class="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        <p>您正在修改 <strong>{{ files.length }}</strong> 个文件。</p>
        <p class="mt-1 text-xs">注意：文件将以新内容重新上传。并发处理可能加快速度。</p>
      </div>

      <!-- 选中的文件列表 -->
      <div class="space-y-2">
        <Label>选中的文件</Label>
        <div class="flex flex-wrap gap-2 max-h-24 overflow-y-auto rounded-md border p-2">
          <Badge v-for="file in files" :key="file.name" variant="secondary" class="gap-1 pr-1 max-w-full">
            <span class="min-w-0 break-all whitespace-normal" :title="file.name">{{ file.name }}</span>
            <button @click="handleRemoveFile(file.name)" class="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 shrink-0">
              <X class="h-3 w-3" />
            </button>
          </Badge>
        </div>
      </div>

      <!-- 模式切换 -->
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          id="multi-field-mode"
          v-model="multiFieldMode"
          class="rounded border-gray-300"
        />
        <label for="multi-field-mode" class="text-sm cursor-pointer">
          多字段模式（一次修改多个字段）
        </label>
      </div>

      <!-- 单字段模式 -->
      <div v-if="!multiFieldMode" class="grid gap-4 py-2">
        <div class="grid gap-2">
          <Label>要修改的字段</Label>
          <select
            v-model="selectedField"
            class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="proxy_url">proxy_url (代理地址)</option>
            <option value="prefix">prefix (模型前缀)</option>
            <option value="custom">自定义字段...</option>
          </select>
        </div>

        <div v-if="selectedField === 'custom'" class="grid gap-2">
          <Label>字段名</Label>
          <Input v-model="customFieldName" placeholder="例如: api_endpoint" />
        </div>

        <div class="grid gap-2">
          <Label>值类型</Label>
          <select
            v-model="valueType"
            class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="string">字符串</option>
            <option value="number">数字</option>
            <option value="boolean">布尔值</option>
            <option value="json">JSON对象/数组</option>
          </select>
        </div>

        <div class="grid gap-2">
          <Label>字段值</Label>
          <select
            v-if="valueType === 'boolean'"
            v-model="fieldValue"
            class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
          <Input v-else v-model="fieldValue" :placeholder="getPlaceholder()" />
          <p class="text-[10px] text-muted-foreground">留空以删除该字段。支持参数规则: {AUTO_INCREMENT(起始,步长)} 自增, {RANDOM_NUMBER(最小,最大)} 随机数, {RANDOM_ALPHA(长度)} 随机字母, {RANDOM_HEX(长度)} 随机十六进制, {RANDOM_UUID} UUID, {FILE_NAME} 文件名, {INDEX} 序号</p>
        </div>
      </div>

      <!-- 多字段模式 -->
      <div v-else class="space-y-3 py-2">
        <Label>要修改的字段列表</Label>
        <div v-for="(field, index) in fields" :key="index" class="grid grid-cols-12 gap-2 items-start">
          <div class="col-span-4">
            <Input v-model="field.name" placeholder="字段名" />
          </div>
          <div class="col-span-3">
            <select
              v-model="field.type"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="string">字符串</option>
              <option value="number">数字</option>
              <option value="boolean">布尔</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div class="col-span-4">
            <select
              v-if="field.type === 'boolean'"
              v-model="field.value"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <Input v-else v-model="field.value" placeholder="字段值（空=删除）" />
          </div>
          <div class="col-span-1 flex items-center">
            <Button
              variant="ghost"
              size="sm"
              @click="removeField(index)"
              :disabled="fields.length === 1"
              class="h-10 w-10 p-0"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" @click="addField" class="w-full">
          <Plus class="h-4 w-4 mr-2" />
          添加字段
        </Button>
        <p class="text-[10px] text-muted-foreground">支持参数规则: {AUTO_INCREMENT(起始,步长)} 自增, {RANDOM_NUMBER(最小,最大)} 随机数, {RANDOM_ALPHA(长度)} 随机字母, {RANDOM_HEX(长度)} 随机十六进制, {RANDOM_UUID} UUID, {FILE_NAME} 文件名, {INDEX} 序号</p>
      </div>

      <!-- 预览区域 -->
      <div v-if="showPreview" class="space-y-2 border-t pt-4">
        <Label>预览变更（前3个文件）</Label>
        <div v-if="previewLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          生成预览中...
        </div>
        <div v-else-if="Object.keys(previewData).length === 0" class="text-xs text-muted-foreground">
          暂无可预览内容
        </div>
        <div v-else class="max-h-60 overflow-y-auto space-y-3">
          <div v-for="(data, fileName) in previewData" :key="fileName" class="text-xs">
            <Badge variant="secondary" class="mb-1 max-w-full">
              <span class="break-all whitespace-normal" :title="fileName">{{ fileName }}</span>
            </Badge>
            <div class="rounded border bg-muted/50 divide-y divide-border">
              <div
                v-for="entry in data.entries"
                :key="entry.key"
                class="flex items-start gap-2 px-3 py-1.5 font-mono text-[11px]"
                :class="{
                  'bg-green-500/10 text-green-700 dark:text-green-400': entry.status === 'added',
                  'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400': entry.status === 'modified',
                  'bg-red-500/10 line-through text-red-700 dark:text-red-400': entry.status === 'deleted',
                }"
              >
                <span class="min-w-0 max-w-[45%] break-all font-semibold">"{{ entry.key }}":</span>
                <span class="flex-1 min-w-0 break-all whitespace-pre-wrap">{{ JSON.stringify(entry.value) }}</span>
                <Badge
                  v-if="entry.status !== 'unchanged'"
                  :variant="entry.status === 'deleted' ? 'destructive' : 'default'"
                  class="ml-auto shrink-0 h-4 px-1 text-[9px] self-start"
                >
                  {{ entry.status === 'added' ? '新增' : entry.status === 'modified' ? '修改' : '删除' }}
                </Badge>
              </div>
            </div>
          </div>
          <p v-if="files.length > 3" class="text-muted-foreground text-xs">
            ...以及其他 {{ files.length - 3 }} 个文件将应用相同规则的修改
          </p>
        </div>
      </div>

      <!-- 处理进度 -->
      <div v-if="processing || results.length > 0" class="space-y-2 border-t pt-4">
        <div class="flex justify-between text-sm">
          <span>进度</span>
          <span>{{ processedCount }}/{{ files.length }}</span>
        </div>
        <Progress :model-value="progress" />

        <div v-if="results.length > 0" class="max-h-40 overflow-y-auto space-y-1 mt-2">
          <div v-for="result in results" :key="result.name" class="flex items-center text-xs gap-2 min-w-0">
            <Badge :variant="result.success ? 'default' : 'destructive'" class="h-5 px-1">
              {{ result.success ? '成功' : '失败' }}
            </Badge>
            <span class="min-w-0 flex-1 truncate" :title="result.name">{{ result.name }}</span>
            <span v-if="!result.success" class="min-w-0 flex-[2] text-destructive truncate" :title="result.error">{{ result.error }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-between gap-2">
      <Button
        variant="outline"
        @click="togglePreview"
        :disabled="processing || !canApply"
      >
        <Eye v-if="!showPreview" class="h-4 w-4 mr-2" />
        <EyeOff v-else class="h-4 w-4 mr-2" />
        {{ showPreview ? '隐藏预览' : '点击预览' }}
      </Button>

      <div class="flex gap-2">
        <Button variant="outline" @click="handleClose" :disabled="processing">取消</Button>
        <Button @click="handleApply" :disabled="processing || !canApply">
          <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
          {{ processing ? '处理中...' : '应用修改' }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>
