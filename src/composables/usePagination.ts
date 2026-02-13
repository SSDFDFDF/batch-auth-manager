import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

export function usePagination<T>(
  data: ComputedRef<T[]> | Ref<T[]>,
  options: { defaultPageSize?: number; pageSizeOptions?: number[]; resetWatchers?: Ref[] } = {}
) {
  const { defaultPageSize = 30, pageSizeOptions = [30, 50, 100, 200], resetWatchers = [] } = options

  const currentPage = ref(1)
  const pageSize = ref(defaultPageSize)

  const totalItems = computed(() => data.value.length)
  const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value))

  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return data.value.slice(start, start + pageSize.value)
  })

  // Reset to page 1 when filters or page size change
  if (resetWatchers.length > 0) {
    watch([...resetWatchers, pageSize], () => {
      currentPage.value = 1
    })
  }

  return {
    currentPage,
    pageSize,
    pageSizeOptions,
    totalItems,
    totalPages,
    paginatedData
  }
}
