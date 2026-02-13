import { defineStore } from 'pinia'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
}

interface ConfirmState {
  visible: boolean
  options: ConfirmOptions
  resolve?: (value: boolean) => void
}

interface NotificationState {
  toasts: Toast[]
  confirm: ConfirmState
}

let toastIdCounter = 0

export const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    toasts: [],
    confirm: {
      visible: false,
      options: {
        message: ''
      }
    }
  }),

  actions: {
    showNotification(message: string, type: ToastType = 'info', duration: number = 3000) {
      const id = `toast-${++toastIdCounter}-${Date.now()}`
      const toast: Toast = {
        id,
        message,
        type,
        duration
      }

      this.toasts.push(toast)

      // Auto remove after duration
      if (duration > 0) {
        setTimeout(() => {
          this.removeToast(id)
        }, duration)
      }

      return id
    },

    success(message: string, duration?: number) {
      return this.showNotification(message, 'success', duration)
    },

    error(message: string, duration?: number) {
      return this.showNotification(message, 'error', duration)
    },

    warning(message: string, duration?: number) {
      return this.showNotification(message, 'warning', duration)
    },

    info(message: string, duration?: number) {
      return this.showNotification(message, 'info', duration)
    },

    removeToast(id: string) {
      const index = this.toasts.findIndex(t => t.id === id)
      if (index > -1) {
        this.toasts.splice(index, 1)
      }
    },

    clearAll() {
      this.toasts = []
    },

    // Confirmation dialog
    async showConfirmation(options: ConfirmOptions): Promise<boolean> {
      return new Promise((resolve) => {
        this.confirm = {
          visible: true,
          options: {
            title: options.title || '确认',
            message: options.message,
            confirmText: options.confirmText || '确定',
            cancelText: options.cancelText || '取消',
            variant: options.variant || 'primary'
          },
          resolve
        }
      })
    },

    resolveConfirmation(result: boolean) {
      if (this.confirm.resolve) {
        this.confirm.resolve(result)
      }
      this.confirm.visible = false
      this.confirm.resolve = undefined
    }
  }
})
