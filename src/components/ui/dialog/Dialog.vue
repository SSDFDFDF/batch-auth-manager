<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  open: boolean
  title?: string
  description?: string
  class?: string
}>()

const emit = defineEmits(['update:open'])

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" @click="close" />
    </Transition>
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        :class="cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg md:w-full',
          $props.class
        )"
        @click.stop
      >
         <div v-if="title || description" class="flex flex-col space-y-1.5 text-center sm:text-left">
            <h2 v-if="title" class="text-lg font-semibold leading-none tracking-tight">{{ title }}</h2>
            <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
         </div>
         <slot />
      </div>
    </Transition>
  </Teleport>
</template>