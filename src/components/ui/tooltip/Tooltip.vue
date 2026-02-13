<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  content?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
}

const props = withDefaults(defineProps<Props>(), {
  side: 'top',
  align: 'center',
  delayDuration: 200
})

const isVisible = ref(false)
let timeoutId: NodeJS.Timeout | null = null

const showTooltip = () => {
  timeoutId = setTimeout(() => {
    isVisible.value = true
  }, props.delayDuration)
}

const hideTooltip = () => {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  isVisible.value = false
}

const tooltipClasses = computed(() => {
  const base = 'absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95'
  const position: Record<string, string> = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  }
  const alignment: Record<string, string> = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0'
  }

  return `${base} ${position[props.side]} ${alignment[props.align]}`
})
</script>

<template>
  <div class="relative inline-block" @mouseenter="showTooltip" @mouseleave="hideTooltip">
    <slot />
    <div v-if="isVisible && (content || $slots.content)" :class="tooltipClasses">
      <slot name="content">{{ content }}</slot>
    </div>
  </div>
</template>
