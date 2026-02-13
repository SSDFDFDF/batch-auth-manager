<script setup lang="ts">
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import Button from '../Button.vue'

interface Props {
  currentPage: number
  totalPages: number
}

defineProps<Props>()
const emit = defineEmits(['update:currentPage'])

const changePage = (page: number) => {
  emit('update:currentPage', page)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      :disabled="currentPage === 1"
      @click="changePage(1)"
    >
      <ChevronsLeft class="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      :disabled="currentPage === 1"
      @click="changePage(currentPage - 1)"
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>
    
    <div class="text-sm font-medium">
      {{ currentPage }} / {{ totalPages }}
    </div>

    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      :disabled="currentPage === totalPages"
      @click="changePage(currentPage + 1)"
    >
      <ChevronRight class="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      :disabled="currentPage === totalPages"
      @click="changePage(totalPages)"
    >
      <ChevronsRight class="h-4 w-4" />
    </Button>
  </div>
</template>