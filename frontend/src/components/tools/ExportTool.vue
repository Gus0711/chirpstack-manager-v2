<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDevices } from '@/composables/useDevices'
import { useConnectionStore } from '@/stores/connection'
import ProgressBar from '@/components/common/ProgressBar.vue'
import CopyButton from '@/components/common/CopyButton.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import type { Device, DeviceKeys } from '@/types'

const conn = useConnectionStore()
const { loadAllDevices, getDeviceKeys, getDeviceStatus, formatTimeAgo } = useDevices()

const devices = ref<Device[]>([])
const deviceKeys = ref<Record<string, DeviceKeys>>({})
const loading = ref(false)
const loadProgress = ref(0)
const loadProgressText = ref('')
const includeKeys = ref(false)


// Filters
const filterDp = ref('')
const filterActivity = ref('')
const filterTag = ref('')

const filteredDevices = computed(() => {
  let result = devices.value

  if (filterDp.value) {
    result = result.filter(d => d.deviceProfileId === filterDp.value)
  }

  if (filterActivity.value) {
    result = result.filter(d => {
      const status = getDeviceStatus(d)
      if (filterActivity.value === 'active') return status === 'active'
      if (filterActivity.value === 'inactive') return status !== 'active' && status !== 'never'
      if (filterActivity.value === 'never') return status === 'never'
      return true
    })
  }

  if (filterTag.value) {
    const q = filterTag.value.toLowerCase()
    if (q.includes('=')) {
      const [key, val] = q.split('=')
      result = result.filter(d =>
        d.tags && d.tags[key.trim()] && d.tags[key.trim()].toLowerCase().includes(val.trim())
      )
    } else {
      result = result.filter(d =>
        d.tags && Object.entries(d.tags).some(
          ([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q)
        )
      )
    }
  }

  return result
})

async function loadDevices() {
  if (!conn.currentServer) return
  loading.value = true
  loadProgress.value = 0
  const srv = conn.currentServer

  try {
    devices.value = await loadAllDevices(srv.url, srv.api_token, conn.selectedApplicationId, (loaded, total) => {
      loadProgress.value = total > 0 ? Math.round((loaded / total) * 100) : 0
      loadProgressText.value = `Chargement: ${loaded}/${total}`
    })

    if (includeKeys.value) {
      loadProgressText.value = 'Recuperation des cles...'
      for (let i = 0; i < devices.value.length; i++) {
        const d = devices.value[i]
        const keys = await getDeviceKeys(srv.url, srv.api_token, d.devEui)
        if (keys) deviceKeys.value[d.devEui] = keys
        loadProgress.value = Math.round(((i + 1) / devices.value.length) * 100)
      }
    }

    loadProgressText.value = `${devices.value.length} devices charges`
  } finally {
    loading.value = false
  }
}

function downloadExport() {
  const data = filteredDevices.value

  // Discover all tag keys
  const tagKeys = new Set<string>()
  for (const d of data) {
    if (d.tags) Object.keys(d.tags).forEach(k => tagKeys.add(k))
  }
  const sortedTags = [...tagKeys].sort()

  // Build headers
  const headers = ['dev_eui', 'name', 'description', 'device_profile_id', 'device_profile_name', 'created_at', 'last_seen_at']
  headers.push(...sortedTags)
  if (includeKeys.value) headers.push('nwk_key', 'app_key')

  // Build rows
  const rows = data.map(d => {
    const row: string[] = [
      d.devEui, d.name || '', d.description || '',
      d.deviceProfileId || '', d.deviceProfileName || '',
      d.createdAt || '', d.lastSeenAt || '',
    ]
    for (const tag of sortedTags) {
      row.push(d.tags?.[tag] || '')
    }
    if (includeKeys.value) {
      const k = deviceKeys.value[d.devEui]
      row.push(k?.nwkKey || '', k?.appKey || '')
    }
    return row
  })

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers.join(';'), ...rows.map(r => r.map(escape).join(';'))].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().slice(0, 10)
  a.download = `export_${conn.selectedApplicationName}_${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Exporter les devices</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="label">Application</label>
          <p class="text-zinc-200 font-medium">{{ conn.selectedApplicationName }}</p>
        </div>
        <div class="flex items-center gap-2">
          <input id="incKeys" v-model="includeKeys" type="checkbox" class="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/40" />
          <label for="incKeys" class="text-sm text-zinc-400">Inclure les cles</label>
        </div>
        <button class="btn-primary" :disabled="loading" @click="loadDevices">
          {{ loading ? 'Chargement...' : 'Charger' }}
        </button>
      </div>
      <ProgressBar v-if="loading" :progress="loadProgress" :text="loadProgressText" class="mt-3" />
      <p v-if="includeKeys" class="text-xs text-amber-400 mt-2">Les cles sont des donnees sensibles.</p>
    </div>

    <div v-if="devices.length > 0" class="card">
      <div class="flex flex-wrap gap-3 mb-4">
        <AppSelect
          v-model="filterDp"
          class="max-w-xs"
          :options="conn.deviceProfiles.map(dp => ({ value: dp.id, label: dp.name }))"
          placeholder="Tous les profils"
        />
        <AppSelect
          v-model="filterActivity"
          class="max-w-xs"
          :options="[
            { value: 'active', label: 'Actifs (< 24h)' },
            { value: 'inactive', label: 'Inactifs (> 24h)' },
            { value: 'never', label: 'Jamais vu' },
          ]"
          placeholder="Toute activite"
        />
        <input v-model="filterTag" class="input max-w-xs" placeholder="Filtre tag (ex: Site=Paris)" />
      </div>

      <p class="text-sm text-zinc-500 mb-3">{{ filteredDevices.length }} / {{ devices.length }} devices</p>

      <div class="overflow-x-auto max-h-64 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-zinc-900/90 backdrop-blur-sm">
            <tr class="border-b border-white/[0.06]">
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">DevEUI</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Nom</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Profil</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Dernier vu</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            <tr v-for="d in filteredDevices.slice(0, 20)" :key="d.devEui" class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors">
              <td class="px-3 py-2.5 font-mono text-xs text-zinc-300">
                {{ d.devEui }} <CopyButton :text="d.devEui" />
              </td>
              <td class="px-3 py-2.5 text-zinc-200">{{ d.name || '-' }}</td>
              <td class="px-3 py-2.5 text-zinc-400">{{ d.deviceProfileName || '-' }}</td>
              <td class="px-3 py-2.5 text-zinc-500">{{ formatTimeAgo(d.lastSeenAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex gap-3 mt-4 pt-4 border-t border-white/[0.06]">
        <button class="btn-primary" @click="downloadExport">
          Telecharger CSV ({{ filteredDevices.length }} devices)
        </button>
      </div>
    </div>
  </div>
</template>
