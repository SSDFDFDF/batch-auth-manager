<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Tooltip } from './ui/tooltip'
import {
  Waypoints,
  Tag,
  Coins,
  Server,
  Bot,
  Thermometer,
  Loader2
} from 'lucide-vue-next'
import type { FileAttribute } from '../composables/useFileAttributes'
import { useFileAttributes } from '../composables/useFileAttributes'

interface Props {
  fileName: string
  maxDisplay?: number  // 最多显示多少个图标
}

const props = withDefaults(defineProps<Props>(), {
  maxDisplay: 3
})

const { getFileAttributes } = useFileAttributes()
const attributes = ref<FileAttribute[]>([])
const isLoading = ref(false)

// 图标组件映射
const iconComponents: Record<string, any> = {
  Waypoints,
  Tag,
  Coins,
  Server,
  Bot,
  Thermometer
}

const loadAttributes = async () => {
  isLoading.value = true
  try {
    attributes.value = await getFileAttributes(props.fileName)
  } finally {
    isLoading.value = false
  }
}

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

onMounted(() => {
  loadAttributes()
})

// 监听文件名变化
watch(() => props.fileName, () => {
  loadAttributes()
})
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- 加载状态 -->
    <Loader2
      v-if="isLoading"
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
