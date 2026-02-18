<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import type { MetricGroup } from '@/utils/metricGrouping'
import { getChartColor } from '@/utils/chartColors'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend)

const props = defineProps<{
  group: MetricGroup
}>()

const chartData = computed(() => {
  // Use timestamps from the first series
  const timestamps = props.group.series[0]?.data.timestamps ?? []

  const labels = timestamps.map(ts => {
    try {
      return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ts
    }
  })

  const datasets = props.group.series.map((s, i) => {
    const color = getChartColor(s.key, i)
    const isPrimary = i === 0
    return {
      label: s.data.label || s.key,
      data: s.data.values,
      borderColor: color.borderColor,
      backgroundColor: isPrimary ? color.backgroundColor : 'transparent',
      borderWidth: isPrimary ? 2 : 1.5,
      borderDash: isPrimary ? [] : [5, 3],
      fill: isPrimary,
      tension: 0.3,
      pointRadius: 0,
      pointHitRadius: 8,
    }
  })

  return { labels, datasets }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    legend: {
      display: props.group.series.length > 1,
      labels: {
        color: 'rgba(161,161,170,0.8)',
        font: { size: 11 },
        boxWidth: 12,
        padding: 8,
      },
    },
    tooltip: {
      backgroundColor: 'rgb(24, 24, 27)',
      titleColor: 'rgba(161,161,170,0.9)',
      bodyColor: 'rgba(228,228,231,0.9)',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 8,
      callbacks: {
        label: (ctx: { dataset: { label: string }; parsed: { y: number | null } }) => {
          const val = ctx.parsed.y
          if (val === null || val === undefined) return ''
          return `${ctx.dataset.label}: ${val.toFixed(1)}${props.group.unit ? ' ' + props.group.unit : ''}`
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: 'rgba(113,113,122,0.7)', font: { size: 10 }, maxTicksLimit: 8 },
      grid: { color: 'rgba(255,255,255,0.03)' },
      border: { color: 'rgba(255,255,255,0.06)' },
    },
    y: {
      ticks: {
        color: 'rgba(113,113,122,0.7)',
        font: { size: 10 },
        callback: (v: number | string) => `${v}${props.group.unit ? ' ' + props.group.unit : ''}`,
      },
      grid: { color: 'rgba(255,255,255,0.03)' },
      border: { color: 'rgba(255,255,255,0.06)' },
    },
  },
}))

// Mini-stats: Last / Min / Max / Avg for the primary series
const miniStats = computed(() => {
  return props.group.series.map(s => {
    const vals = s.data.values.filter(v => v !== 0)
    const last = vals.length > 0 ? vals[vals.length - 1] : null
    const min = vals.length > 0 ? Math.min(...vals) : null
    const max = vals.length > 0 ? Math.max(...vals) : null
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    return {
      label: s.data.label || s.key,
      last,
      min,
      max,
      avg,
    }
  })
})
</script>

<template>
  <div class="bg-zinc-900/50 rounded-xl border border-white/[0.06] p-4 space-y-2">
    <h5 class="text-xs font-medium uppercase tracking-wider text-zinc-500">
      {{ group.label }}
      <span v-if="group.unit" class="text-zinc-600 font-normal">({{ group.unit }})</span>
    </h5>
    <div class="h-48">
      <Line :data="chartData" :options="(chartOptions as any)" />
    </div>
    <!-- Mini stats -->
    <div class="flex flex-wrap gap-x-4 gap-y-1 pt-1">
      <template v-for="s in miniStats" :key="s.label">
        <div class="flex items-center gap-1 text-[10px]">
          <span v-if="miniStats.length > 1" class="text-zinc-600">{{ s.label }}:</span>
          <span class="text-zinc-500">Dernier</span>
          <span class="text-zinc-300 font-medium">{{ s.last !== null ? s.last.toFixed(1) : '-' }}</span>
          <span class="text-zinc-700 mx-0.5">|</span>
          <span class="text-zinc-500">Min</span>
          <span class="text-zinc-300 font-medium">{{ s.min !== null ? s.min.toFixed(1) : '-' }}</span>
          <span class="text-zinc-700 mx-0.5">|</span>
          <span class="text-zinc-500">Max</span>
          <span class="text-zinc-300 font-medium">{{ s.max !== null ? s.max.toFixed(1) : '-' }}</span>
          <span class="text-zinc-700 mx-0.5">|</span>
          <span class="text-zinc-500">Moy</span>
          <span class="text-zinc-300 font-medium">{{ s.avg !== null ? s.avg.toFixed(1) : '-' }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
