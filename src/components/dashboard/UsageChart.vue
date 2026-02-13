<template>
  <div class="w-full" :style="{ height: height || '300px' }">
    <div ref="chartRef" class="w-full h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

type SeriesConfig = {
  name?: string
  data: number[]
  color?: string
  type?: 'line' | 'bar'
  area?: boolean
  yAxisIndex?: number
}

const props = defineProps<{
  xAxisData: string[]
  seriesData?: number[]
  series?: SeriesConfig[]
  type?: 'line' | 'bar'
  color?: string
  yAxisLabel?: string
  yAxis?: Array<{ name?: string }>
  height?: string
}>()

const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  updateChart()

  window.addEventListener('resize', handleResize)
}

const updateChart = () => {
  if (!chartInstance) return

  // 检测 dark mode
  const isDarkMode = document.documentElement.classList.contains('dark')

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.9)',
      borderColor: isDarkMode ? '#374151' : '#e5e7eb',
      textStyle: {
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.xAxisData,
      axisTick: {
        alignWithLabel: true
      },
      axisLine: {
        lineStyle: {
          color: isDarkMode ? '#4b5563' : '#e5e7eb'
        }
      },
      axisLabel: {
        color: isDarkMode ? '#9ca3af' : '#6b7280'
      }
    },
    yAxis: props.yAxis && props.yAxis.length
      ? props.yAxis.map((axis, index) => ({
          type: 'value',
          name: axis.name || '',
          position: index === 0 ? 'left' : 'right',
          nameTextStyle: {
            color: isDarkMode ? '#9ca3af' : '#6b7280'
          },
          axisLine: {
            lineStyle: {
              color: isDarkMode ? '#4b5563' : '#e5e7eb'
            }
          },
          axisLabel: {
            color: isDarkMode ? '#9ca3af' : '#6b7280'
          },
          splitLine: {
            show: index === 0,
            lineStyle: {
              color: isDarkMode ? '#374151' : '#f3f4f6'
            }
          }
        }))
      : {
          type: 'value',
          name: props.yAxisLabel || '',
          nameTextStyle: {
            color: isDarkMode ? '#9ca3af' : '#6b7280'
          },
          axisLine: {
            lineStyle: {
              color: isDarkMode ? '#4b5563' : '#e5e7eb'
            }
          },
          axisLabel: {
            color: isDarkMode ? '#9ca3af' : '#6b7280'
          },
          splitLine: {
            lineStyle: {
              color: isDarkMode ? '#374151' : '#f3f4f6'
            }
          }
        },
    series: (props.series && props.series.length > 0
      ? props.series
      : [{
        name: 'Value',
        data: props.seriesData || [],
        type: props.type,
        color: props.color
      }]
    ).map((entry) => {
      const seriesType = entry.type || props.type || 'line'
      const seriesColor = entry.color || props.color || (seriesType === 'line' ? '#3b82f6' : '#22c55e')
      const useArea = entry.area ?? (props.series ? false : seriesType === 'line')
      return {
        name: entry.name || 'Value',
        type: seriesType,
        data: entry.data,
        yAxisIndex: entry.yAxisIndex,
        itemStyle: {
          color: seriesColor
        },
        smooth: seriesType === 'line',
        areaStyle: useArea && seriesType === 'line' ? {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${seriesColor}40` },
              { offset: 1, color: `${seriesColor}00` }
            ]
          }
        } : undefined
      }
    })
  }

  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

// Watch for dark mode changes
const observer = new MutationObserver(() => {
  updateChart()
})

watch(() => [props.xAxisData, props.seriesData, props.series], () => {
  nextTick(() => {
    updateChart()
  })
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    initChart()
    // Observe dark mode changes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  observer.disconnect()
  chartInstance?.dispose()
})
</script>
