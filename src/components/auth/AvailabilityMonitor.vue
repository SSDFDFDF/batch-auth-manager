<script setup lang="ts">
import { computed } from 'vue'
import type { AvailabilityPoint } from '../../utils/availability'
import { calculateAvailabilityStats, formatTimestamp } from '../../utils/availability'
import {
  getAvailabilityStatusColor,
  getAvailabilityStatusLabel,
  getAvailabilityRateClass
} from '../../config/constants'

interface Props {
  points: AvailabilityPoint[]
  compact?: boolean
  showStats?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: true,
  showStats: false
})

const stats = computed(() => calculateAvailabilityStats(props.points))

// 获取最近的 N 个点用于显示
const displayPoints = computed(() => {
  const count = props.compact ? 24 : props.points.length
  return props.points.slice(-count)
})

// 获取状态颜色类（使用配置）
const getPointClass = (point: AvailabilityPoint) => {
  // 优先使用 status 字段
  if (point.status) {
    return getAvailabilityStatusColor(point.status, false) + ' dark:' + getAvailabilityStatusColor(point.status, true).replace('dark:', '')
  }

  // 回退到 available 字段
  return getAvailabilityStatusColor(point.available, false) + ' dark:' + getAvailabilityStatusColor(point.available, true).replace('dark:', '')
}

// 获取点的 tooltip（使用配置）
const getPointTooltip = (point: AvailabilityPoint) => {
  const time = formatTimestamp(point.timestamp)
  const statusText = point.status ? getAvailabilityStatusLabel(point.status) : getAvailabilityStatusLabel(point.available)
  return `${time}: ${statusText}`
}

// 获取可用率样式类（使用配置）
const getRateClass = () => {
  return getAvailabilityRateClass(stats.value.availabilityRate)
}
</script>

<template>
  <div :class="['availability-monitor', { compact }]">
    <div class="flex items-center gap-0.5 flex-1 min-w-[180px]">
      <div
        v-for="(point, index) in displayPoints"
        :key="index"
        :class="['availability-point', getPointClass(point)]"
        :title="getPointTooltip(point)"
      />
    </div>

    <!-- 可用率显示 -->
    <span v-if="showStats" :class="['text-xs font-semibold whitespace-nowrap px-2 py-1 rounded-md', getRateClass()]">
      {{ stats.availabilityRate.toFixed(1) }}%
    </span>
  </div>
</template>

<style scoped>
.availability-monitor {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  max-width: 280px;
}

.availability-point {
  flex: 1;
  height: 8px;
  border-radius: 2px;
  min-width: 6px;
  transition: transform 0.15s ease, opacity 0.15s ease;
  cursor: help;
}

.availability-point:hover {
  transform: scaleY(1.5);
  opacity: 0.85;
}

/* 更紧凑的样式 */
.availability-monitor.compact .availability-point {
  height: 6px;
  min-width: 4px;
}
</style>
