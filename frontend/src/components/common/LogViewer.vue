<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { BulkLogEntry } from '@/types'

const props = defineProps<{
  logs: BulkLogEntry[]
  maxHeight?: string
}>()

const container = ref<HTMLDivElement>()

watch(
  () => props.logs.length,
  async () => {
    await nextTick()
    if (container.value) {
      container.value.scrollTop = container.value.scrollHeight
    }
  }
)

const statusColors: Record<string, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
}

const statusIcons: Record<string, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
}
</script>

<template>
  <div
    ref="container"
    class="bg-black rounded-xl border border-zinc-800 p-3 overflow-y-auto font-mono text-xs space-y-0.5"
    :style="{ maxHeight: maxHeight ?? '300px' }"
  >
    <div
      v-for="(log, i) in logs"
      :key="i"
      class="py-0.5"
      :class="statusColors[log.status]"
    >
      <span class="text-zinc-600 select-none">$ </span>{{ statusIcons[log.status] }} {{ log.message }}
    </div>
    <div v-if="logs.length === 0" class="text-zinc-600 text-center py-4">
      En attente...
    </div>
  </div>
</template>
