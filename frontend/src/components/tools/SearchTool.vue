<script setup lang="ts">
import { ref } from 'vue'
import { useDevices } from '@/composables/useDevices'
import { useConnectionStore } from '@/stores/connection'
import CopyButton from '@/components/common/CopyButton.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import type { Device } from '@/types'

const conn = useConnectionStore()
const { loadAllDevices, getDevice, formatTimeAgo } = useDevices()

const searchQuery = ref('')
const results = ref<Array<Device & { applicationName?: string }>>([])
const searching = ref(false)
const searchProgress = ref(0)
const searchProgressText = ref('')
const searched = ref(false)

async function search() {
  const query = searchQuery.value.trim().toLowerCase()
  if (query.length < 4) return
  if (!conn.currentServer) return

  searching.value = true
  searched.value = true
  results.value = []
  searchProgress.value = 0
  const srv = conn.currentServer

  // Direct lookup if exact 16 hex chars
  if (/^[0-9a-f]{16}$/.test(query)) {
    try {
      const data = await getDevice(srv.url, srv.api_token, query)
      if (data.device) {
        const app = conn.applications.find(a => a.id === data.device.applicationId)
        results.value.push({
          ...data.device,
          applicationName: app?.name ?? data.device.applicationId,
        })
      }
    } catch {
      // Not found by direct lookup, continue with scan
    }
  }

  // Scan all applications
  if (results.value.length === 0) {
    for (let i = 0; i < conn.applications.length; i++) {
      const app = conn.applications[i]
      searchProgressText.value = `Scan: ${app.name} (${i + 1}/${conn.applications.length})`
      searchProgress.value = Math.round(((i + 1) / conn.applications.length) * 100)

      try {
        const devices = await loadAllDevices(srv.url, srv.api_token, app.id)
        const matches = devices.filter(d =>
          d.devEui.toLowerCase().includes(query) ||
          (d.name && d.name.toLowerCase().includes(query))
        )
        for (const d of matches) {
          results.value.push({ ...d, applicationName: app.name })
        }
      } catch {
        // Skip inaccessible apps
      }
    }
  }

  searchProgressText.value = `${results.value.length} resultat(s) trouve(s)`
  searching.value = false
}
</script>

<template>
  <div class="space-y-4">
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Rechercher un device</h3>
      <form class="flex gap-3" @submit.prevent="search">
        <input
          v-model="searchQuery"
          class="input max-w-md font-mono"
          placeholder="DevEUI ou nom (min 4 caracteres)"
          maxlength="16"
          :disabled="searching"
        />
        <button class="btn-primary" :disabled="searching || searchQuery.length < 4">
          {{ searching ? 'Recherche...' : 'Rechercher' }}
        </button>
      </form>
      <ProgressBar
        v-if="searching"
        :progress="searchProgress"
        :text="searchProgressText"
        class="mt-3"
      />
      <p v-if="!searching && searched" class="text-sm text-zinc-500 mt-2">
        {{ searchProgressText }}
      </p>
    </div>

    <div v-if="results.length > 0" class="card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/[0.06]">
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">DevEUI</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Nom</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Application</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Profil</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Dernier vu</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            <tr v-for="d in results" :key="d.devEui" class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors">
              <td class="px-3 py-2.5 font-mono text-xs text-zinc-300">
                {{ d.devEui }}
                <CopyButton :text="d.devEui" />
              </td>
              <td class="px-3 py-2.5 text-zinc-200">{{ d.name || '-' }}</td>
              <td class="px-3 py-2.5 text-zinc-400">{{ d.applicationName }}</td>
              <td class="px-3 py-2.5 text-zinc-400">{{ d.deviceProfileName || '-' }}</td>
              <td class="px-3 py-2.5 text-zinc-500">{{ formatTimeAgo(d.lastSeenAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
