<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Tooltip } from './ui/tooltip'
import {
  Waypoints,
  Tag,
  Coins,
  Server,
  Bot,
  Thermometer,
  User,
  UserCircle,
  Loader2
} from 'lucide-vue-next'
import type { FileAttribute } from '../composables/useFileAttributes'
import { useFileAttributes } from '../composables/useFileAttributes'

interface Props {
  fileName: string
  fileMeta?: Record<string, any>
  maxDisplay?: number  // 最多显示多少个图标
}

const props = withDefaults(defineProps<Props>(), {
  maxDisplay: 3
})

const { getFileAttributes, loading } = useFileAttributes()
const attributes = ref<FileAttribute[]>([])

// 图标组件映射
const iconComponents: Record<string, any> = {
  Waypoints,
  Tag,
  Coins,
  Server,
  Bot,
  Thermometer,
  User,
  UserCircle
}

const loadAttributes = async () => {
  attributes.value = await getFileAttributes(props.fileName, props.fileMeta)
}

const versionKey = computed(() => {
  const meta = props.fileMeta
  if (!meta) return ''
  return String(meta.modtime ?? meta.updated_at ?? meta.last_refresh ?? meta.created_at ?? '')
})

// 显示的属性（限制数量）
const displayedAttributes = computed(() => {
  return attributes.value.slice(0, props.maxDisplay)
})

// 隐藏的属性数量
const hiddenCount = computed(() => {
  return Math.max(0, attributes.value.length - props.maxDisplay)
})

// 所有属性的摘要（用于显示完整信息）
const allAttributesSummary = computed(() => {
  return attributes.value
    .map(attr => `${attr.label}: ${attr.value}`)
    .join('\n')
})

watch([() => props.fileName, () => versionKey.value], () => {
  loadAttributes()
}, { immediate: true })
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- 加载状态 -->
    <Loader2
      v-if="loading[props.fileName]"
      class="h-3.5 w-3.5 animate-spin text-muted-foreground"
    />

    <!-- 显示属性图标 -->
    <template v-else>
      <Tooltip
        v-for="(attr, index) in displayedAttributes"
        :key="index"
        :content="`${attr.label}: ${attr.value}`"
      >
        <component
          :is="iconComponents[attr.icon]"
          :class="['h-3.5 w-3.5 cursor-help transition-colors', attr.color || 'text-muted-foreground']"
        />
      </Tooltip>

      <!-- 更多属性指示器 -->
      <Tooltip
        v-if="hiddenCount > 0"
        :content="`还有 ${hiddenCount} 个属性:\n${allAttributesSummary}`"
      >
        <div class="h-3.5 px-1 rounded text-[10px] bg-muted text-muted-foreground cursor-help font-medium">
          +{{ hiddenCount }}
        </div>
      </Tooltip>
    </template>
  </div>
</template>
