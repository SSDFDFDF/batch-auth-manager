<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isMap, parse, parseDocument } from 'yaml'
import { RefreshCw, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { useNotificationStore } from '../../stores/notification'
import { configYamlApi } from '../../api/configYaml'

import Button from '../ui/Button.vue'
import Input from '../ui/Input.vue'
import Select from '../ui/select/Select.vue'
import Card from '../ui/Card.vue'
import CardHeader from '../ui/CardHeader.vue'
import CardTitle from '../ui/CardTitle.vue'
import CardDescription from '../ui/CardDescription.vue'
import CardContent from '../ui/CardContent.vue'

type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json'

interface PayloadModelEntry {
  id: string
  name: string
  protocol: string
}

interface PayloadParamEntry {
  id: string
  path: string
  valueType: PayloadParamValueType
  value: string
}

interface PayloadRule {
  id: string
  models: PayloadModelEntry[]
  params: PayloadParamEntry[]
}

interface PayloadFilterRule {
  id: string
  models: PayloadModelEntry[]
  params: string[]
}

const notificationStore = useNotificationStore()

const loading = ref(false)
const saving = ref(false)
const configYaml = ref('')

const payloadDefaultRules = ref<PayloadRule[]>([])
const payloadOverrideRules = ref<PayloadRule[]>([])
const payloadFilterRules = ref<PayloadFilterRule[]>([])

const protocolOptions = [
  { label: '默认', value: '' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI Response', value: 'openai-response' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Claude', value: 'claude' },
  { label: 'Codex', value: 'codex' },
  { label: 'Antigravity', value: 'antigravity' }
]

const valueTypeOptions: Array<{ label: string; value: PayloadParamValueType }> = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: 'JSON', value: 'json' }
]

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const isRecord = (value: unknown): value is Record<string, any> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const parsePayloadParamValue = (raw: unknown): { valueType: PayloadParamValueType; value: string } => {
  if (typeof raw === 'number') {
    return { valueType: 'number', value: String(raw) }
  }
  if (typeof raw === 'boolean') {
    return { valueType: 'boolean', value: String(raw) }
  }
  if (raw === null || typeof raw === 'object') {
    try {
      const json = JSON.stringify(raw, null, 2)
      return { valueType: 'json', value: json ?? 'null' }
    } catch {
      return { valueType: 'json', value: String(raw) }
    }
  }
  return { valueType: 'string', value: String(raw ?? '') }
}

const parsePayloadRules = (rules: unknown): PayloadRule[] => {
  if (!Array.isArray(rules)) return []
  return rules.map((rule, index) => {
    const record = isRecord(rule) ? rule : {}
    const modelsRaw = record.models
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = isRecord(model) ? model : {}
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord.name ?? modelRecord.id ?? '')
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '')
          return {
            id: `model-${index}-${modelIndex}-${makeId()}`,
            name,
            protocol: typeof modelRecord.protocol === 'string' ? modelRecord.protocol : ''
          }
        })
      : []

    const paramsRecord = isRecord(record.params) ? record.params : null
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => {
          const parsedValue = parsePayloadParamValue(value)
          return {
            id: `param-${index}-${pIndex}-${makeId()}`,
            path,
            valueType: parsedValue.valueType,
            value: parsedValue.value
          }
        })
      : []

    return { id: `payload-rule-${index}-${makeId()}`, models, params }
  })
}

const parsePayloadFilterRules = (rules: unknown): PayloadFilterRule[] => {
  if (!Array.isArray(rules)) return []
  return rules.map((rule, index) => {
    const record = isRecord(rule) ? rule : {}
    const modelsRaw = record.models
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = isRecord(model) ? model : {}
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord.name ?? modelRecord.id ?? '')
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '')
          return {
            id: `filter-model-${index}-${modelIndex}-${makeId()}`,
            name,
            protocol: typeof modelRecord.protocol === 'string' ? modelRecord.protocol : ''
          }
        })
      : []
    const paramsRaw = record.params
    const params = Array.isArray(paramsRaw) ? paramsRaw.map(String) : []
    return { id: `payload-filter-rule-${index}-${makeId()}`, models, params }
  })
}

const serializePayloadRules = (rules: PayloadRule[]) => {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() }
          if (m.protocol) obj.protocol = m.protocol
          return obj
        })

      const params: Record<string, unknown> = {}
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue
        let value: unknown = param.value
        if (param.valueType === 'number') {
          const num = Number(param.value)
          value = Number.isFinite(num) ? num : param.value
        } else if (param.valueType === 'boolean') {
          value = param.value === 'true'
        } else if (param.valueType === 'json') {
          try {
            value = JSON.parse(param.value)
          } catch {
            value = param.value
          }
        }
        params[param.path.trim()] = value
      }

      return { models, params }
    })
    .filter((rule) => rule.models.length > 0)
}

const serializePayloadFilterRules = (rules: PayloadFilterRule[]) => {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() }
          if (m.protocol) obj.protocol = m.protocol
          return obj
        })

      const params = (Array.isArray(rule.params) ? rule.params : [])
        .map((path) => String(path).trim())
        .filter(Boolean)

      return { models, params }
    })
    .filter((rule) => rule.models.length > 0)
}

const ensureMapInDoc = (doc: ReturnType<typeof parseDocument>, path: string[]) => {
  const existing = doc.getIn(path, true)
  if (isMap(existing)) return
  doc.setIn(path, {})
}

const deleteIfMapEmpty = (doc: ReturnType<typeof parseDocument>, path: string[]) => {
  const value = doc.getIn(path, true)
  if (!isMap(value)) return
  if (value.items.length === 0) doc.deleteIn(path)
}

const applyPayloadToYaml = (yamlText: string) => {
  const doc = parseDocument(yamlText)
  const defaultRules = serializePayloadRules(payloadDefaultRules.value)
  const overrideRules = serializePayloadRules(payloadOverrideRules.value)
  const filterRules = serializePayloadFilterRules(payloadFilterRules.value)

  if (defaultRules.length || overrideRules.length || filterRules.length) {
    ensureMapInDoc(doc, ['payload'])
  }

  if (defaultRules.length > 0) {
    doc.setIn(['payload', 'default'], defaultRules)
  } else if (doc.hasIn(['payload', 'default'])) {
    doc.deleteIn(['payload', 'default'])
  }

  if (overrideRules.length > 0) {
    doc.setIn(['payload', 'override'], overrideRules)
  } else if (doc.hasIn(['payload', 'override'])) {
    doc.deleteIn(['payload', 'override'])
  }

  if (filterRules.length > 0) {
    doc.setIn(['payload', 'filter'], filterRules)
  } else if (doc.hasIn(['payload', 'filter'])) {
    doc.deleteIn(['payload', 'filter'])
  }

  deleteIfMapEmpty(doc, ['payload'])
  return doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 })
}

const loadPayloadConfig = async () => {
  loading.value = true
  try {
    const yamlText = await configYamlApi.getConfigYaml()
    configYaml.value = yamlText
    const parsed = parse(yamlText)
    const payload = isRecord(parsed) ? parsed.payload : null
    payloadDefaultRules.value = parsePayloadRules(payload?.default)
    payloadOverrideRules.value = parsePayloadRules(payload?.override)
    payloadFilterRules.value = parsePayloadFilterRules(payload?.filter)
  } catch (error: any) {
    notificationStore.error('加载 Payload 配置失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

const savePayloadConfig = async () => {
  if (!configYaml.value) {
    notificationStore.warning('请先加载配置')
    return
  }
  saving.value = true
  try {
    const nextYaml = applyPayloadToYaml(configYaml.value)
    await configYamlApi.saveConfigYaml(nextYaml)
    configYaml.value = nextYaml
    notificationStore.success('Payload 配置已保存')
  } catch (error: any) {
    notificationStore.error('保存失败: ' + error.message)
  } finally {
    saving.value = false
  }
}

const resolveRuleTarget = (
  target: PayloadRule[] | { value: PayloadRule[] }
): PayloadRule[] => {
  return Array.isArray(target) ? target : target.value
}

const addRule = (target: PayloadRule[] | { value: PayloadRule[] }) => {
  resolveRuleTarget(target).push({ id: makeId(), models: [], params: [] })
}

const removeRule = (target: PayloadRule[] | { value: PayloadRule[] }, index: number) => {
  resolveRuleTarget(target).splice(index, 1)
}

const addModel = (rule: PayloadRule | PayloadFilterRule) => {
  rule.models.push({ id: makeId(), name: '', protocol: '' })
}

const removeModel = (rule: PayloadRule | PayloadFilterRule, index: number) => {
  rule.models.splice(index, 1)
}

const addParam = (rule: PayloadRule) => {
  rule.params.push({ id: makeId(), path: '', valueType: 'string', value: '' })
}

const removeParam = (rule: PayloadRule, index: number) => {
  rule.params.splice(index, 1)
}

const addFilterParam = (rule: PayloadFilterRule) => {
  rule.params.push('')
}

const removeFilterParam = (rule: PayloadFilterRule, index: number) => {
  rule.params.splice(index, 1)
}

const ruleCount = computed(() => ({
  default: payloadDefaultRules.value.length,
  override: payloadOverrideRules.value.length,
  filter: payloadFilterRules.value.length
}))

onMounted(() => {
  loadPayloadConfig()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold">Payload 配置</h2>
        <p class="text-sm text-muted-foreground">管理 payload 规则（default / override / filter）。</p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="loadPayloadConfig" :disabled="loading || saving">
          <RefreshCw class="mr-2 h-4 w-4" :class="loading && 'animate-spin'" />
          刷新
        </Button>
        <Button size="sm" @click="savePayloadConfig" :disabled="loading || saving">
          <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
          保存
        </Button>
      </div>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>规则概览</CardTitle>
        <CardDescription>共 {{ ruleCount.default + ruleCount.override + ruleCount.filter }} 条规则</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <div class="rounded-md border px-2 py-1">default {{ ruleCount.default }}</div>
        <div class="rounded-md border px-2 py-1">override {{ ruleCount.override }}</div>
        <div class="rounded-md border px-2 py-1">filter {{ ruleCount.filter }}</div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Default 规则</CardTitle>
        <CardDescription>当参数缺失时写入默认值。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="payloadDefaultRules.length === 0" class="text-sm text-muted-foreground">
          暂无规则
        </div>
        <div
          v-for="(rule, ruleIndex) in payloadDefaultRules"
          :key="rule.id"
          class="rounded-md border p-4 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">规则 {{ ruleIndex + 1 }}</div>
            <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="removeRule(payloadDefaultRules, ruleIndex)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">模型匹配</div>
            <div
              v-for="(model, modelIndex) in rule.models"
              :key="model.id"
              class="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
            >
              <Input v-model="model.name" placeholder="模型名称或通配，如 gpt-4o*" class="font-mono text-xs" />
              <Select v-model="model.protocol">
                <option v-for="option in protocolOptions" :key="`p-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeModel(rule, modelIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addModel(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加模型
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">参数设置</div>
            <div
              v-for="(param, paramIndex) in rule.params"
              :key="param.id"
              class="grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]"
            >
              <Input v-model="param.path" placeholder="JSON Path，如 $.max_tokens" class="font-mono text-xs" />
              <Select v-model="param.valueType">
                <option v-for="option in valueTypeOptions" :key="`v-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
              <Input v-model="param.value" placeholder="值" class="font-mono text-xs" />
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeParam(rule, paramIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addParam(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加参数
            </Button>
          </div>
        </div>

        <Button size="sm" variant="outline" @click="addRule(payloadDefaultRules)">
          <Plus class="mr-2 h-4 w-4" />
          添加规则
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Override 规则</CardTitle>
        <CardDescription>强制覆盖 payload 中的参数。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="payloadOverrideRules.length === 0" class="text-sm text-muted-foreground">
          暂无规则
        </div>
        <div
          v-for="(rule, ruleIndex) in payloadOverrideRules"
          :key="rule.id"
          class="rounded-md border p-4 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">规则 {{ ruleIndex + 1 }}</div>
            <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="removeRule(payloadOverrideRules, ruleIndex)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">模型匹配</div>
            <div
              v-for="(model, modelIndex) in rule.models"
              :key="model.id"
              class="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
            >
              <Input v-model="model.name" placeholder="模型名称或通配，如 gpt-4o*" class="font-mono text-xs" />
              <Select v-model="model.protocol">
                <option v-for="option in protocolOptions" :key="`op-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeModel(rule, modelIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addModel(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加模型
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">参数设置</div>
            <div
              v-for="(param, paramIndex) in rule.params"
              :key="param.id"
              class="grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]"
            >
              <Input v-model="param.path" placeholder="JSON Path，如 $.temperature" class="font-mono text-xs" />
              <Select v-model="param.valueType">
                <option v-for="option in valueTypeOptions" :key="`ov-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
              <Input v-model="param.value" placeholder="值" class="font-mono text-xs" />
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeParam(rule, paramIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addParam(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加参数
            </Button>
          </div>
        </div>

        <Button size="sm" variant="outline" @click="addRule(payloadOverrideRules)">
          <Plus class="mr-2 h-4 w-4" />
          添加规则
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Filter 规则</CardTitle>
        <CardDescription>从 payload 中移除指定 JSON 路径。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="payloadFilterRules.length === 0" class="text-sm text-muted-foreground">
          暂无规则
        </div>
        <div
          v-for="(rule, ruleIndex) in payloadFilterRules"
          :key="rule.id"
          class="rounded-md border p-4 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">规则 {{ ruleIndex + 1 }}</div>
            <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="payloadFilterRules.splice(ruleIndex, 1)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">模型匹配</div>
            <div
              v-for="(model, modelIndex) in rule.models"
              :key="model.id"
              class="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
            >
              <Input v-model="model.name" placeholder="模型名称或通配，如 gpt-4o*" class="font-mono text-xs" />
              <Select v-model="model.protocol">
                <option v-for="option in protocolOptions" :key="`fp-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeModel(rule, modelIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addModel(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加模型
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">移除路径</div>
            <div
              v-for="(param, paramIndex) in rule.params"
              :key="`${rule.id}-${paramIndex}-${param}`"
              class="grid gap-2 sm:grid-cols-[1fr_auto]"
            >
              <Input v-model="rule.params[paramIndex]" placeholder="JSON Path，如 $.metadata" class="font-mono text-xs" />
              <Button size="sm" variant="ghost" class="text-muted-foreground" @click="removeFilterParam(rule, paramIndex)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="outline" @click="addFilterParam(rule)">
              <Plus class="mr-2 h-4 w-4" />
              添加路径
            </Button>
          </div>
        </div>

        <Button size="sm" variant="outline" @click="payloadFilterRules.push({ id: makeId(), models: [], params: [] })">
          <Plus class="mr-2 h-4 w-4" />
          添加规则
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
