<script setup lang="ts">
import { useNotificationStore } from '../../../stores/notification'
import ToastItem from './ToastItem.vue'

const notificationStore = useNotificationStore()

const handleRemove = (id: string) => {
  notificationStore.removeToast(id)
}
</script>

<template>
  <div
    class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    aria-live="polite"
    aria-atomic="true"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in notificationStore.toasts"
        :key="toast.id"
        class="pointer-events-auto"
      >
        <ToastItem :toast="toast" @remove="handleRemove" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
