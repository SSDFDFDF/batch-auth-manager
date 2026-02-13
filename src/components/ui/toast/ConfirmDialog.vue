<script setup lang="ts">
import { useNotificationStore } from '../../../stores/notification'
import Dialog from '../dialog/Dialog.vue'
import Button from '../Button.vue'

const notificationStore = useNotificationStore()

const handleConfirm = () => {
  notificationStore.resolveConfirmation(true)
}

const handleCancel = () => {
  notificationStore.resolveConfirmation(false)
}
</script>

<template>
  <Dialog
    :open="notificationStore.confirm.visible"
    @update:open="(val) => !val && handleCancel()"
    :title="notificationStore.confirm.options.title || '确认'"
  >
    <div class="py-4">
      <p class="text-sm text-foreground">
        {{ notificationStore.confirm.options.message }}
      </p>
    </div>
    <div class="flex justify-end gap-2">
      <Button variant="outline" @click="handleCancel">
        {{ notificationStore.confirm.options.cancelText || '取消' }}
      </Button>
      <Button
        :variant="notificationStore.confirm.options.variant === 'danger' ? 'destructive' : 'default'"
        @click="handleConfirm"
      >
        {{ notificationStore.confirm.options.confirmText || '确定' }}
      </Button>
    </div>
  </Dialog>
</template>
