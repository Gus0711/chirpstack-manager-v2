<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDevices } from '@/composables/useDevices'
import { useConnectionStore } from '@/stores/connection'
import CopyButton from '@/components/common/CopyButton.vue'
import Modal from '@/components/common/Modal.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import type { Device, DeviceStatus, AnalyzeStats, MetricData } from '@/types'

const conn = useConnectionStore()
const {
  loadAllDevices, getDeviceMetrics, getDeviceStatus, getStatusLabel, formatTimeAgo
} = useDevices()

// State
const devices = ref<Device[]>([])
const loading = ref(false)
const stats = ref<AnalyzeStats | null>(null)

// Filters
const searchQuery = ref('')
const statusFilter = ref('')
const dpFilter = ref('')
const tagFilter = ref('')
const sortField = ref('lastSeenAt')
const sortAsc = ref(false)

// Metrics modal
const showMetrics = ref(false)
const metricsDevice = ref<{ devEui: string; name: string } | null>(null)
const metricsData = ref<MetricData[]>([])
const metricsPeriod = ref<'24h' | '7d' | '30d'>('24h')
const metricsLoading = ref(false)

async function loadDevices() {
  if (!conn.currentServer) return
  loading.value = true
  try {
    devices.value = await loadAllDevices(
      conn.currentServer.url, conn.currentServer.api_token,
      conn.selectedApplicationId
    )
    computeStats()
  } finally {
    loading.value = false
  }
}

function computeStats() {
  const s: AnalyzeStats = { total: devices.value.length, active: 0, recent: 0, inactive: 0, offline: 0, never: 0, byProfile: {} }
  for (const d of devices.value) {
    const status = getDeviceStatus(d)
    s[status]++
    const pn = d.deviceProfileName || 'Unknown'
    s.byProfile[pn] = (s.byProfile[pn] || 0) + 1
  }
  stats.value = s
}

const filteredDevices = computed(() => {
  let result = devices.value

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(d =>
      (d.name && d.name.toLowerCase().includes(q)) ||
      d.devEui.toLowerCase().includes(q)
    )
  }
  if (statusFilter.value) {
    result = result.filter(d => getDeviceStatus(d) === statusFilter.value)
  }
  if (dpFilter.value) {
    result = result.filter(d => d.deviceProfileId === dpFilter.value)
  }
  if (tagFilter.value) {
    const q = tagFilter.value.toLowerCase()
    if (q.includes('=')) {
      const [key, val] = q.split('=')
      result = result.filter(d => d.tags?.[key.trim()]?.toLowerCase().includes(val.trim()))
    } else {
      result = result.filter(d =>
        d.tags && Object.entries(d.tags).some(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
      )
    }
  }

  // Sort
  result = [...result].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortField.value]
    const bVal = (b as Record<string, unknown>)[sortField.value]
    const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''))
    return sortAsc.value ? cmp : -cmp
  })

  return result
})

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

async function openMetrics(device: Device) {
  metricsDevice.value = { devEui: device.devEui, name: device.name }
  metricsPeriod.value = '24h'
  showMetrics.value = true
  await loadMetrics()
}

async function loadMetrics() {
  if (!conn.currentServer || !metricsDevice.value) return
  metricsLoading.value = true
  try {
    metricsData.value = await getDeviceMetrics(
      conn.currentServer.url, conn.currentServer.api_token,
      metricsDevice.value.devEui, metricsPeriod.value
    )
  } finally {
    metricsLoading.value = false
  }
}

async function changePeriod(period: '24h' | '7d' | '30d') {
  metricsPeriod.value = period
  await loadMetrics()
}

function exportCsv() {
  const headers = ['Nom', 'DevEUI', 'Profil', 'Dernier vu', 'Statut']
  const rows = filteredDevices.value.map(d => [
    d.name || '', d.devEui, d.deviceProfileName || '',
    d.lastSeenAt || '', getStatusLabel(getDeviceStatus(d)),
  ])
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers.join(';'), ...rows.map(r => r.map(escape).join(';'))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analyse_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function tagClass(key: string): string {
  const k = key.toLowerCase()
  if (k.includes('site')) return 'tag-site'
  if (k.includes('bat') || k.includes('build')) return 'tag-batiment'
  if (k.includes('etage') || k.includes('floor') || k.includes('level')) return 'tag-etage'
  if (k.includes('emplacement') || k.includes('loc') || k.includes('room') || k.includes('zone')) return 'tag-emplacement'
  return 'tag-default'
}

const statusColors: Record<DeviceStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  recent: 'bg-cyan-500/15 text-cyan-400',
  inactive: 'bg-amber-500/15 text-amber-400',
  offline: 'bg-red-500/15 text-red-400',
  never: 'bg-zinc-800 text-zinc-400',
}
</script>

<template>
  <div class="space-y-4">
    <!-- Load -->
    <div class="card">
      <button class="btn-primary" :disabled="loading" @click="loadDevices">
        {{ loading ? 'Chargement...' : 'Charger les devices' }}
      </button>
    </div>

    <template v-if="stats">
      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="card text-center py-3 border border-white/[0.06]">
          <p class="text-xl font-bold">{{ stats.total }}</p>
          <p class="text-xs text-zinc-500">Total</p>
        </div>
        <button
          v-for="status in (['active', 'recent', 'inactive', 'offline', 'never'] as DeviceStatus[])"
          :key="status"
          class="card text-center py-3 border cursor-pointer hover:scale-105 transition-transform"
          :class="statusColors[status]"
          @click="statusFilter = statusFilter === status ? '' : status"
        >
          <p class="text-xl font-bold">{{ stats[status] }}</p>
          <p class="text-xs text-zinc-400">{{ getStatusLabel(status) }}</p>
        </button>
      </div>

      <!-- Filters -->
      <div class="card">
        <div class="flex flex-wrap gap-3">
          <input v-model="searchQuery" class="input max-w-xs" placeholder="Rechercher..." />
          <AppSelect
            v-model="statusFilter"
            class="max-w-[160px]"
            :options="(['active', 'recent', 'inactive', 'offline', 'never'] as DeviceStatus[]).map(s => ({ value: s, label: getStatusLabel(s) }))"
            placeholder="Tout statut"
          />
          <AppSelect
            v-model="dpFilter"
            class="max-w-xs"
            :options="conn.deviceProfiles.map(dp => ({ value: dp.id, label: dp.name }))"
            placeholder="Tous profils"
          />
          <input v-model="tagFilter" class="input max-w-xs" placeholder="Tag (ex: Site=Paris)" />
          <button class="btn-sm btn-secondary ml-auto" @click="exportCsv">Exporter CSV</button>
        </div>
        <p class="text-xs text-zinc-500 mt-2">{{ filteredDevices.length }} / {{ devices.length }} devices</p>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-zinc-900/90 backdrop-blur-sm">
              <tr class="border-b border-white/[0.06]">
                <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer" @click="toggleSort('name')">Nom</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer" @click="toggleSort('devEui')">DevEUI</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Profil</th>
                <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Tags</th>
                <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer" @click="toggleSort('lastSeenAt')">Dernier vu</th>
                <th class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">Statut</th>
                <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.03]">
              <tr v-for="d in filteredDevices" :key="d.devEui" class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors">
                <td class="px-3 py-2.5 text-zinc-200">{{ d.name || '-' }}</td>
                <td class="px-3 py-2.5 font-mono text-xs text-zinc-300">
                  {{ d.devEui }} <CopyButton :text="d.devEui" />
                </td>
                <td class="px-3 py-2.5 text-zinc-400 text-xs">{{ d.deviceProfileName || '-' }}</td>
                <td class="px-3 py-2.5">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="([k, v]) in Object.entries(d.tags || {}).slice(0, 3)"
                      :key="k"
                      :class="tagClass(k)"
                    >{{ k }}={{ v }}</span>
                    <span
                      v-if="Object.keys(d.tags || {}).length > 3"
                      class="tag-default cursor-help"
                      :title="Object.entries(d.tags).slice(3).map(([k,v]) => `${k}=${v}`).join(', ')"
                    >+{{ Object.keys(d.tags).length - 3 }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-zinc-500 text-xs text-right">{{ formatTimeAgo(d.lastSeenAt) }}</td>
                <td class="px-3 py-2.5 text-center">
                  <span class="badge" :class="statusColors[getDeviceStatus(d)]">
                    {{ getStatusLabel(getDeviceStatus(d)) }}
                  </span>
                </td>
                <td class="px-3 py-2.5 text-right">
                  <button class="btn-sm btn-secondary text-xs" @click="openMetrics(d)">Metriques</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Metrics Modal -->
    <Modal :title="`Metriques - ${metricsDevice?.name || ''}`" :show="showMetrics" size="lg" @close="showMetrics = false">
      <div class="space-y-4">
        <div class="flex gap-2">
          <button
            v-for="p in (['24h', '7d', '30d'] as const)"
            :key="p"
            class="btn-sm"
            :class="metricsPeriod === p ? 'btn-primary' : 'btn-secondary'"
            @click="changePeriod(p)"
          >{{ p }}</button>
        </div>

        <div v-if="metricsLoading" class="text-zinc-400">Chargement...</div>

        <div v-else-if="metricsData.length > 0" class="space-y-4">
          <div v-for="metric in metricsData" :key="metric.label" class="bg-zinc-900/50 rounded-xl border border-white/[0.06] p-4">
            <div class="flex justify-between mb-2">
              <h4 class="text-sm font-semibold text-zinc-200">{{ metric.label }}</h4>
              <div class="text-xs text-zinc-500">
                Total: {{ metric.total.toFixed(1) }} | Moy: {{ metric.avg.toFixed(1) }}
              </div>
            </div>
            <div class="space-y-0.5">
              <div
                v-for="(val, i) in metric.values.slice(-24)"
                :key="i"
                class="flex items-center gap-2 text-xs"
              >
                <span class="text-zinc-500 w-16 text-right shrink-0">
                  {{ new Date(metric.timestamps[metric.timestamps.length - 24 + i] || '').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}
                </span>
                <div class="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded"
                    :style="{ width: `${Math.max(val, 0) / Math.max(...metric.values, 1) * 100}%` }"
                  />
                </div>
                <span class="text-zinc-500 w-8 text-right">{{ val }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-zinc-500 text-center py-4">Aucune donnee</div>
      </div>
    </Modal>
  </div>
</template>
