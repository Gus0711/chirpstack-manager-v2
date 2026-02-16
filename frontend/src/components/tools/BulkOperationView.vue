<script setup lang="ts">
/**
 * Generic Bulk Operation UI component.
 * Used by DeleteTool, MigrateTool, DpChangeTool.
 * Renders: load button, search/filter, select all/deselect, device table,
 *          execute button with progress, and log viewer.
 */
import { computed } from 'vue'
import type { BulkLogEntry } from '@/types'
import type { Device } from '@/types'
import CopyButton from '@/components/common/CopyButton.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import LogViewer from '@/components/common/LogViewer.vue'

export interface BulkColumn {
  key: string
  label: string
  mono?: boolean
}

const props = defineProps<{
  // State from useBulkOperation
  devices: Device[]
  filteredDevices: Device[]
  selection: Set<string>
  selectionCount: number
  isLoading: boolean
  isExecuting: boolean
  loadProgress: number
  loadProgressText: string
  executeProgress: number
  executeProgressText: string
  logs: BulkLogEntry[]
  results: { total: number; success: number; errors: number } | null
  // Config
  columns: BulkColumn[]
  executeLabel?: string
  executeDisabled?: boolean
  dangerButton?: boolean
}>()

const emit = defineEmits<{
  load: []
  'toggle-select': [devEui: string]
  'select-all': []
  'deselect-all': []
  filter: [query: string]
  execute: []
}>()

const hasDevices = computed(() => props.devices.length > 0)
</script>

<template>
  <div class="space-y-4">
    <!-- Header slot for tool-specific controls -->
    <slot name="header" />

    <!-- Load button -->
    <div class="card">
      <div class="flex items-center gap-4">
        <button
          class="btn-primary"
          :disabled="isLoading"
          @click="emit('load')"
        >
          {{ isLoading ? 'Chargement...' : 'Charger les devices' }}
        </button>
        <span v-if="hasDevices" class="text-sm text-zinc-500">
          {{ devices.length }} devices charges
        </span>
      </div>
      <ProgressBar
        v-if="isLoading || loadProgressText"
        :progress="loadProgress"
        :text="loadProgressText"
        class="mt-3"
      />
    </div>

    <!-- Device list -->
    <div v-if="hasDevices" class="card">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input
          class="input max-w-xs"
          placeholder="Rechercher (nom ou DevEUI)..."
          @input="emit('filter', ($event.target as HTMLInputElement).value)"
        />
        <button class="btn-sm btn-secondary" @click="emit('select-all')">
          Tout selectionner
        </button>
        <button class="btn-sm btn-secondary" @click="emit('deselect-all')">
          Deselectionner
        </button>
        <span class="text-sm text-zinc-500 ml-auto">
          <strong class="text-zinc-300">{{ selectionCount }}</strong> selectionne(s)
          sur {{ filteredDevices.length }}
        </span>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto max-h-96 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-zinc-900/90 backdrop-blur-sm">
            <tr class="border-b border-white/[0.06]">
              <th class="px-3 py-2 text-left w-10">
                <span class="sr-only">Select</span>
              </th>
              <th
                v-for="col in columns"
                :key="col.key"
                class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            <tr
              v-for="d in filteredDevices"
              :key="d.devEui"
              class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors"
            >
              <td class="px-3 py-2.5">
                <input
                  type="checkbox"
                  class="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/40"
                  :checked="selection.has(d.devEui)"
                  @change="emit('toggle-select', d.devEui)"
                />
              </td>
              <td
                v-for="col in columns"
                :key="col.key"
                class="px-3 py-2.5 text-zinc-300"
                :class="col.mono ? 'font-mono text-xs' : ''"
              >
                <template v-if="col.key === 'devEui'">
                  {{ d.devEui }}
                  <CopyButton :text="d.devEui" />
                </template>
                <template v-else-if="col.key === 'lastSeenAt'">
                  {{ d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('fr-FR') : 'Jamais' }}
                </template>
                <template v-else>
                  {{ (d as unknown as Record<string, unknown>)[col.key] ?? '-' }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Execute button slot + default -->
      <div class="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
        <slot name="execute-area">
          <button
            :class="dangerButton ? 'btn-danger' : 'btn-primary'"
            :disabled="selectionCount === 0 || isExecuting || executeDisabled"
            @click="emit('execute')"
          >
            {{ executeLabel ?? 'Executer' }} ({{ selectionCount }})
          </button>
        </slot>
      </div>
    </div>

    <!-- Execution progress + logs -->
    <div v-if="logs.length > 0 || isExecuting" class="card">
      <ProgressBar
        v-if="isExecuting || results"
        :progress="executeProgress"
        :text="executeProgressText"
        :color="results ? (results.errors > 0 ? 'bg-amber-500' : 'bg-emerald-500') : undefined"
        class="mb-4"
      />

      <div v-if="results" class="flex gap-4 mb-4 text-sm">
        <span class="text-zinc-500">Total: <strong class="text-zinc-300">{{ results.total }}</strong></span>
        <span class="text-emerald-400">Succes: <strong>{{ results.success }}</strong></span>
        <span v-if="results.errors > 0" class="text-red-400">Erreurs: <strong>{{ results.errors }}</strong></span>
      </div>

      <LogViewer :logs="logs" />
    </div>

    <!-- Footer slot -->
    <slot name="footer" />
  </div>
</template>
