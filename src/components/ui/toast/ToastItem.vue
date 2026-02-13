<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-vue-next'
import type { Toast, ToastType } from '../../../stores/notification'

const props = defineProps<{
  toast: Toast
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const iconMap: Record<ToastType, any> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info
}

const colorClasses: Record<ToastType, string> = {
  success: 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
  error: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
}

const iconColorClasses: Record<ToastType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400'
}

const IconComponent = computed(() => iconMap[props.toast.type])
const colorClass = computed(() => colorClasses[props.toast.type])
const iconColorClass = computed(() => iconColorClasses[props.toast.type])

const handleRemove = () => {
  emit('remove', props.toast.id)
}
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300 animate-in slide-in-from-top-2 fade-in',
      colorClass
    ]"
    role="alert"
  >
    <component :is="IconComponent" :class="['h-5 w-5 flex-shrink-0 mt-0.5', iconColorClass]" />
    <div class="flex-1 text-sm font-medium">
      {{ toast.message }}
    </div>
    <button
      @click="handleRemove"
      class="flex-shrink-0 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      aria-label="Close"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
