<script setup lang="ts">
defineProps<{
  progress: number
  text?: string
  color?: string
}>()
</script>

<template>
  <div class="space-y-1">
    <div class="flex justify-between text-xs text-zinc-500">
      <span>{{ text }}</span>
      <span>{{ progress }}%</span>
    </div>
    <div class="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="color ?? 'bg-gradient-to-r from-cyan-500 to-cyan-400'"
        :style="{ width: `${progress}%`, boxShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }"
      />
    </div>
  </div>
</template>
