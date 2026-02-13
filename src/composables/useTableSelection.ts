import { ref, computed, type Ref, type ComputedRef } from 'vue'

export function useTableSelection<T extends { name?: string; identifier?: string }>(
  paginatedData: ComputedRef<T[]>,
  identifierKey: keyof T = 'name' as keyof T
) {
  const selectedItems = ref<T[]>([]) as Ref<T[]>

  const getId = (item: T): string => String(item[identifierKey] || '')

  const allSelected = computed(() => {
    return paginatedData.value.length > 0 && paginatedData.value.every(item => isSelected(item))
  })

  const isSelected = (item: T): boolean => {
    const id = getId(item)
    return selectedItems.value.some(s => getId(s) === id)
  }

  const toggleSelection = (item: T) => {
    const id = getId(item)
    const index = selectedItems.value.findIndex(s => getId(s) === id)
    if (index > -1) {
      selectedItems.value.splice(index, 1)
    } else {
      selectedItems.value.push(item)
    }
  }

  const toggleSelectAll = () => {
    if (allSelected.value) {
      const pageIds = paginatedData.value.map(getId)
      selectedItems.value = selectedItems.value.filter(s => !pageIds.includes(getId(s)))
    } else {
      const newSelected = [...selectedItems.value]
      paginatedData.value.forEach(item => {
        if (!newSelected.some(s => getId(s) === getId(item))) {
          newSelected.push(item)
        }
      })
      selectedItems.value = newSelected
    }
  }

  const clearSelection = () => {
    selectedItems.value = []
  }

  return {
    selectedItems,
    allSelected,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection
  }
}
