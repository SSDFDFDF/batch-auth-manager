<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-3xl font-bold tracking-tight">总览</h2>
      <Button @click="refreshData" :disabled="loading" size="sm">
        <RefreshCw :class="['mr-2 h-4 w-4', loading && 'animate-spin']" />
        刷新数据
      </Button>
    </div>

    <!-- Stats Cards -->
    <div class="grid gap-4 md:grid-cols-4">
      <!-- Total Requests Card -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">总请求数</CardTitle>
          <Badge variant="secondary" class="text-xs">Total</Badge>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ formatNumber(globalStats?.totalRequests || 0) }}</div>
          <p class="text-xs text-muted-foreground mt-1">
            所有 API 调用，最近24小时: {{ formatNumber(last24hRequests) }}
          </p>
        </CardContent>
      </Card>

      <!-- Success Rate Card -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">成功率</CardTitle>
          <Badge :variant="successRateBadgeVariant" class="text-xs">
            {{ globalStats?.successRate || 0 }}%
          </Badge>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold" :class="successRateColorClass">
            {{ globalStats?.successRate || '0.00' }}%
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            成功: {{ formatNumber(globalStats?.successCount || 0) }} / 失败: {{ formatNumber(globalStats?.failureCount || 0) }}
          </p>
        </CardContent>
      </Card>

      <!-- Avg Tokens Card -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">平均 Tokens/请求</CardTitle>
          <Badge variant="secondary" class="text-xs">Avg</Badge>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ formatTokens(avgTokensPerRequest) }}</div>
          <p class="text-xs text-muted-foreground mt-1">
            基于总请求与总 Tokens
          </p>
        </CardContent>
      </Card>

      <!-- Total Tokens Card -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">总 Token 消耗</CardTitle>
          <Badge variant="outline" class="text-xs">Tokens</Badge>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ formatTokens(globalStats?.totalTokens || 0) }}</div>
          <p class="text-xs text-muted-foreground mt-1">
            最近24小时: {{ formatTokens(last24hTokens) }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Charts -->
    <div class="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>每日请求与 Token 消耗</CardTitle>
        </CardHeader>
        <CardContent class="pt-2">
          <UsageChart
            :x-axis-data="dailyCombined.dates"
            :series="dailyCombined.series"
            type="line"
            :y-axis="[
              { name: '请求数' },
              { name: 'Token 消耗' }
            ]"
          />
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>每小时请求趋势</CardTitle>
        </CardHeader>
        <CardContent class="pt-2">
          <UsageChart
            :x-axis-data="requestsHourData.dates"
            :series-data="requestsHourData.values"
            type="bar"
            color="#0ea5e9"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>每小时 Token 消耗</CardTitle>
        </CardHeader>
        <CardContent class="pt-2">
          <UsageChart
            :x-axis-data="tokensHourData.dates"
            :series-data="tokensHourData.values"
            type="line"
            color="#f97316"
          />
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Top API</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <div v-if="topApis.length === 0" class="text-sm text-muted-foreground">
            暂无数据
          </div>
          <div
            v-for="(api, index) in topApis"
            :key="api.name"
            class="flex items-center justify-between text-sm"
          >
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="text-[10px]">#{{ index + 1 }}</Badge>
              <span class="font-medium">{{ maskApiName(api.name) }}</span>
            </div>
            <div class="text-muted-foreground">
              {{ formatNumber(api.requests) }} 次 · {{ formatTokens(api.tokens) }} tokens
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 模型</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <div v-if="topModels.length === 0" class="text-sm text-muted-foreground">
            暂无数据
          </div>
          <div
            v-for="(model, index) in topModels"
            :key="model.name"
            class="flex items-center justify-between text-sm"
          >
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="text-[10px]">#{{ index + 1 }}</Badge>
              <span class="font-medium">{{ model.name }}</span>
            </div>
            <div class="text-muted-foreground">
              {{ formatNumber(model.requests) }} 次 · {{ formatTokens(model.tokens) }} tokens
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token 组成</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div v-if="!hasTokenDetails" class="text-sm text-muted-foreground">
            暂无明细数据
          </div>
          <div v-else v-for="item in tokenBreakdownItems" :key="item.key" class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">{{ item.label }}</span>
              <span class="text-muted-foreground">
                {{ formatTokens(item.value) }} ({{ item.percent.toFixed(1) }}%)
              </span>
            </div>
            <Progress :model-value="item.percent" class="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>每日错误趋势</CardTitle>
        </CardHeader>
        <CardContent class="pt-2">
          <UsageChart
            :x-axis-data="errorByDayData.dates"
            :series-data="errorByDayData.values"
            type="line"
            color="#ef4444"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>每小时错误趋势</CardTitle>
        </CardHeader>
        <CardContent class="pt-2">
          <UsageChart
            :x-axis-data="errorByHourData.dates"
            :series-data="errorByHourData.values"
            type="bar"
            color="#f87171"
          />
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>错误来源与对应模型</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="sourceErrorRows.length === 0" class="text-sm text-muted-foreground">
            暂无数据
          </div>
          <div v-else class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[160px]">来源</TableHead>
                  <TableHead>模型（失败最多）</TableHead>
                  <TableHead class="text-right w-[120px]">失败次数</TableHead>
                  <TableHead class="text-right w-[100px]">失败率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in pagedSourceErrorRows" :key="row.key">
                  <TableCell class="font-medium">{{ row.name }}</TableCell>
                  <TableCell>
                    <div v-if="row.models.length === 0" class="text-xs text-muted-foreground">
                      无失败模型
                    </div>
                    <div v-else class="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                      <Badge
                        v-for="model in row.models"
                        :key="model.key"
                        variant="outline"
                        class="text-[10px] flex-shrink-0"
                      >
                        {{ model.name }} · {{ formatNumber(model.failed) }}次
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatNumber(row.failed) }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ row.rate.toFixed(1) }}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div v-if="sourceErrorRows.length > 0" class="mt-3 flex items-center justify-between">
            <p class="text-xs text-muted-foreground">基于明细统计，仅展示失败最多的 5 个模型</p>
            <Pagination
              v-if="sourceErrorTotalPages > 1"
              :current-page="sourceErrorPage"
              :total-pages="sourceErrorTotalPages"
              @update:currentPage="sourceErrorPage = $event"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useUsageStore } from '../../stores/usage'
import { usePagination } from '../../composables/usePagination'
import UsageChart from './UsageChart.vue'
import Button from '../ui/Button.vue'
import Card from '../ui/Card.vue'
import CardHeader from '../ui/CardHeader.vue'
import CardTitle from '../ui/CardTitle.vue'
import CardContent from '../ui/CardContent.vue'
import Badge from '../ui/badge/Badge.vue'
import Progress from '../ui/progress/Progress.vue'
import Pagination from '../ui/pagination/Pagination.vue'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../ui/table'

const store = useUsageStore()

const loading = computed(() => store.loading)
const globalStats = computed(() => store.globalStats)
const requestsData = computed(() => store.requestsByDayChartData)
const tokensData = computed(() => store.tokensByDayChartData)
const usageData = computed(() => store.usageData)
const usageDetails = computed(() => store.usageDetails)

const successRateBadgeVariant = computed(() => {
  const rate = parseFloat(globalStats.value?.successRate || '0')
  if (rate >= 95) return 'default'
  if (rate >= 80) return 'secondary'
  return 'destructive'
})

const successRateColorClass = computed(() => {
  const rate = parseFloat(globalStats.value?.successRate || '0')
  if (rate >= 95) return 'text-green-600 dark:text-green-400'
  if (rate >= 80) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const formatNumber = (num: number) => {
  return num.toLocaleString()
}

const formatTokens = (num: number) => {
  if (!Number.isFinite(num)) return '0'
  const absValue = Math.abs(num)
  const formatWithUnit = (value: number, unit: string, digits: number) => {
    return `${value.toFixed(digits).replace(/\.0+$/, '')}${unit}`
  }
  if (absValue >= 1_000_000) {
    const digits = absValue >= 100_000_000 ? 0 : 1
    return formatWithUnit(num / 1_000_000, 'M', digits)
  }
  if (absValue >= 1_000) {
    const digits = absValue >= 100_000 ? 0 : 1
    return formatWithUnit(num / 1_000, 'K', digits)
  }
  return num.toLocaleString()
}

const maskApiName = (value: string) => {
  if (!value) return '***'
  const trimmed = value.trim()
  if (trimmed.length <= 4) return `${trimmed[0] || '*'}***`
  const start = trimmed.slice(0, 2)
  const end = trimmed.slice(-2)
  return `${start}***${end}`
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatDayKey = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const formatHourKey = (date: Date) => {
  return `${formatDayKey(date)} ${pad2(date.getHours())}`
}

const getSortedSeries = (record?: Record<string, number>) => {
  if (!record) return { dates: [], values: [] }
  const sortedEntries = Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  return {
    dates: sortedEntries.map(([date]) => date),
    values: sortedEntries.map(([, value]) => value)
  }
}

const dailyCombined = computed(() => ({
  dates: requestsData.value.dates.length ? requestsData.value.dates : tokensData.value.dates,
  series: [
    {
      name: '请求数',
      data: requestsData.value.values,
      type: 'bar' as const,
      color: '#3b82f6',
      yAxisIndex: 0
    },
    {
      name: 'Token 消耗',
      data: tokensData.value.values,
      type: 'bar' as const,
      color: '#f59e0b',
      yAxisIndex: 1
    }
  ]
}))

const requestsHourData = computed(() => getSortedSeries(usageData.value?.requests_by_hour))
const tokensHourData = computed(() => getSortedSeries(usageData.value?.tokens_by_hour))

const last24hRequests = computed(() => {
  const entries = Object.entries(usageData.value?.requests_by_hour || {}).sort(([a], [b]) => a.localeCompare(b))
  return entries.slice(-24).reduce((sum, [, value]) => sum + (value || 0), 0)
})

const last24hTokens = computed(() => {
  const entries = Object.entries(usageData.value?.tokens_by_hour || {}).sort(([a], [b]) => a.localeCompare(b))
  return entries.slice(-24).reduce((sum, [, value]) => sum + (value || 0), 0)
})

const avgTokensPerRequest = computed(() => {
  const totalRequests = globalStats.value?.totalRequests || 0
  const totalTokens = globalStats.value?.totalTokens || 0
  if (totalRequests === 0) return 0
  return Number((totalTokens / totalRequests).toFixed(2))
})

const topApis = computed(() => {
  const apis = usageData.value?.apis || {}
  return Object.entries(apis)
    .map(([name, entry]) => ({
      name,
      requests: entry?.total_requests || 0,
      tokens: entry?.total_tokens || 0
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 6)
})

const topModels = computed(() => {
  const apis = usageData.value?.apis || {}
  const modelMap = new Map<string, { requests: number; tokens: number }>()
  Object.values(apis).forEach((apiEntry: any) => {
    const models = apiEntry?.models || {}
    Object.entries(models).forEach(([modelName, modelEntry]: [string, any]) => {
      const prev = modelMap.get(modelName) || { requests: 0, tokens: 0 }
      modelMap.set(modelName, {
        requests: prev.requests + (modelEntry?.total_requests || 0),
        tokens: prev.tokens + (modelEntry?.total_tokens || 0)
      })
    })
  })

  return Array.from(modelMap.entries())
    .map(([name, values]) => ({ name, requests: values.requests, tokens: values.tokens }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 6)
})

const tokenBreakdown = computed(() => {
  const totals = {
    input: 0,
    output: 0,
    reasoning: 0,
    cached: 0,
    total: 0
  }

  usageDetails.value.forEach((detail: any) => {
    const tokens = detail?.tokens || {}
    const input = tokens.input_tokens || 0
    const output = tokens.output_tokens || 0
    const reasoning = tokens.reasoning_tokens || 0
    const cached = tokens.cached_tokens || 0
    const total = Number.isFinite(tokens.total_tokens)
      ? tokens.total_tokens
      : input + output + reasoning + cached

    totals.input += input
    totals.output += output
    totals.reasoning += reasoning
    totals.cached += cached
    totals.total += total
  })

  return totals
})

const hasTokenDetails = computed(() => tokenBreakdown.value.total > 0)

const tokenBreakdownItems = computed(() => {
  const total = tokenBreakdown.value.total || 0
  if (total <= 0) return []
  const buildItem = (key: string, label: string, value: number) => ({
    key,
    label,
    value,
    percent: (value / total) * 100
  })

  return [
    buildItem('input', 'Input Tokens', tokenBreakdown.value.input),
    buildItem('output', 'Output Tokens', tokenBreakdown.value.output),
    buildItem('reasoning', 'Reasoning Tokens', tokenBreakdown.value.reasoning),
    buildItem('cached', 'Cached Tokens', tokenBreakdown.value.cached)
  ].filter((item) => item.value > 0)
})

const errorByDayData = computed(() => {
  const map = new Map<string, number>()
  usageDetails.value.forEach((detail: any) => {
    if (!detail?.failed) return
    const timestamp = Date.parse(detail.timestamp)
    if (Number.isNaN(timestamp)) return
    const key = formatDayKey(new Date(timestamp))
    map.set(key, (map.get(key) || 0) + 1)
  })
  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  return {
    dates: entries.map(([key]) => key),
    values: entries.map(([, value]) => value)
  }
})

const errorByHourData = computed(() => {
  const map = new Map<string, number>()
  usageDetails.value.forEach((detail: any) => {
    if (!detail?.failed) return
    const timestamp = Date.parse(detail.timestamp)
    if (Number.isNaN(timestamp)) return
    const key = formatHourKey(new Date(timestamp))
    map.set(key, (map.get(key) || 0) + 1)
  })
  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  return {
    dates: entries.map(([key]) => key),
    values: entries.map(([, value]) => value)
  }
})

const sourceErrorRows = computed(() => {
  const sourceTotals = new Map<string, number>()
  const sourceFailed = new Map<string, number>()
  const sourceModels = new Map<string, Map<string, { total: number; failed: number }>>()

  usageDetails.value.forEach((detail: any) => {
    const source = detail?.source || 'unknown'
    sourceTotals.set(source, (sourceTotals.get(source) || 0) + 1)
    if (detail?.failed) {
      sourceFailed.set(source, (sourceFailed.get(source) || 0) + 1)
    }
  })

  const apis = usageData.value?.apis || {}
  Object.values(apis).forEach((apiEntry: any) => {
    const models = apiEntry?.models || {}
    Object.entries(models).forEach(([modelName, modelEntry]: [string, any]) => {
      const details = Array.isArray(modelEntry?.details) ? modelEntry.details : []
      details.forEach((detail: any) => {
        const source = detail?.source || 'unknown'
        const modelMap = sourceModels.get(source) || new Map<string, { total: number; failed: number }>()
        const current = modelMap.get(modelName) || { total: 0, failed: 0 }
        current.total += 1
        if (detail?.failed) {
          current.failed += 1
        }
        modelMap.set(modelName, current)
        sourceModels.set(source, modelMap)
      })
    })
  })

  const rows = Array.from(sourceTotals.entries()).map(([name, total]) => {
    const failed = sourceFailed.get(name) || 0
    const modelMap = sourceModels.get(name) || new Map<string, { total: number; failed: number }>()
    const models = Array.from(modelMap.entries())
      .map(([modelName, stats]) => ({
        key: `${name}:${modelName}`,
        name: modelName,
        failed: stats.failed,
        rate: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0
      }))
      .filter((entry) => entry.failed > 0)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 5)

    return {
      key: `source:${name}`,
      name,
      failed,
      rate: total > 0 ? (failed / total) * 100 : 0,
      models
    }
  })

  return rows
    .filter((row) => row.failed > 0)
    .sort((a, b) => b.failed - a.failed)
})

const {
  currentPage: sourceErrorPage,
  totalPages: rawSourceErrorPages,
  paginatedData: pagedSourceErrorRows
} = usePagination(sourceErrorRows, {
  defaultPageSize: 15,
  resetWatchers: [sourceErrorRows]
})

const sourceErrorTotalPages = computed(() => Math.max(1, rawSourceErrorPages.value))

const refreshData = () => {
  store.fetchUsage(true)
}

onMounted(() => {
  store.fetchUsage()
  store.startPolling()
})

onUnmounted(() => {
  store.stopPolling()
})
</script>
