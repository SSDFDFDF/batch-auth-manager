import { ref } from 'vue'
import { authFilesApi, type AuthFile } from '../api/authFiles'

export function useAuthFiles() {
  const files = ref<AuthFile[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const loadFiles = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await authFilesApi.list()
      files.value = response.files || []
    } catch (err: any) {
      error.value = err.message || 'Failed to load files'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  const deleteFile = async (name: string) => {
    try {
      await authFilesApi.delete(name)
      await loadFiles() // Refresh list
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to delete file'
      return false
    }
  }

  const setStatus = async (name: string, disabled: boolean) => {
    try {
      await authFilesApi.setStatus(name, disabled)
      const file = files.value.find(f => f.name === name)
      if (file) {
        file.disabled = disabled
        const normalized = (file.status || '').toLowerCase().trim()
        if (!normalized || normalized === 'active' || normalized === 'disabled') {
          file.status = disabled ? 'disabled' : 'active'
        }
      }
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to update status'
      return false
    }
  }

  const batchSetStatus = async (names: string[], disabled: boolean) => {
    try {
      await authFilesApi.batchSetStatus(names, disabled)
      await loadFiles()
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to batch update status'
      return false
    }
  }

  const batchDelete = async (names: string[]) => {
    try {
      await authFilesApi.batchDelete(names)
      await loadFiles()
      return true
    } catch (err: any) {
      error.value = err.message || 'Failed to batch delete'
      return false
    }
  }

  return {
    files,
    loading,
    error,
    loadFiles,
    deleteFile,
    setStatus,
    batchSetStatus,
    batchDelete
  }
}
