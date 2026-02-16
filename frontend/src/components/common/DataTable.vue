<script setup lang="ts">
import { computed } from 'vue'

export interface Column {
  key: string
  label: string
  mono?: boolean
  sortable?: boolean
  class?: string
}

const props = defineProps<{
  columns: Column[]
  rows: Record<string, unknown>[]
  rowKey?: string
  selectable?: boolean
  selectedKeys?: Set<string>
  sortField?: string
  sortAsc?: boolean
  emptyText?: string
}>()

const emit = defineEmits<{
  'toggle-select': [key: string]
  'sort': [field: string]
}>()

const keyField = computed(() => props.rowKey ?? 'devEui')
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-white/[0.06]">
          <th v-if="selectable" class="px-3 py-3 text-left w-10">
            <span class="sr-only">Select</span>
          </th>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
            :class="[col.class, col.sortable ? 'cursor-pointer hover:text-zinc-300' : '']"
            @click="col.sortable && emit('sort', col.key)"
          >
            <span class="flex items-center gap-1">
              {{ col.label }}
              <template v-if="col.sortable && sortField === col.key">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path v-if="sortAsc" d="M5.293 9.707l4-4a1 1 0 011.414 0l4 4" />
                  <path v-else d="M14.707 10.293l-4 4a1 1 0 01-1.414 0l-4-4" />
                </svg>
              </template>
            </span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/[0.03]">
        <tr
          v-for="row in rows"
          :key="String(row[keyField])"
          class="hover:bg-white/[0.02] transition-colors"
        >
          <td v-if="selectable" class="px-3 py-2">
            <input
              type="checkbox"
              class="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/40"
              :checked="selectedKeys?.has(String(row[keyField]))"
              @change="emit('toggle-select', String(row[keyField]))"
            />
          </td>
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-2 text-zinc-300"
            :class="col.mono ? 'font-mono text-xs' : ''"
          >
            <slot :name="col.key" :row="row" :value="row[col.key]">
              {{ row[col.key] ?? '-' }}
            </slot>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td
            :colspan="columns.length + (selectable ? 1 : 0)"
            class="px-3 py-8 text-center text-zinc-600"
          >
            {{ emptyText ?? 'Aucune donnee' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
