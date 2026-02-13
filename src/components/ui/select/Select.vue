<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  modelValue: string
  class?: string
}

defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const updateValue = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div :class="cn('relative', $props.class)">
    <select
      :value="modelValue"
      @change="updateValue"
      :class="cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        $props.class
      )"
    >
      <slot />
    </select>
  </div>
</template>