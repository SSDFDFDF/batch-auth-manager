<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: number | null
  max?: number
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
  max: 100,
})
</script>

<template>
  <div
    :class="cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', props.class)"
  >
    <div
      class="h-full w-full flex-1 bg-primary transition-all"
      :style="{ transform: `translateX(-${100 - (props.modelValue || 0)}%)` }"
    />
  </div>
</template>