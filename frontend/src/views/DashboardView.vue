<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useAuthStore } from '@/stores/auth'
import { useDevices } from '@/composables/useDevices'
import { useDeviceMetricsBatch } from '@/composables/useDeviceMetricsBatch'
import { api } from '@/composables/useApi'
import type { ChirpStackServer, Device, DeviceEvent, DeviceMetricsEntry, AnalyzeStats, DeviceStatus, MetricData } from '@/types'
import CopyButton from '@/components/common/CopyButton.vue'
import Modal from '@/components/common/Modal.vue'
import AppSelect from '@/components/common/AppSelect.vue'

const conn = useConnectionStore()
const auth = useAuthStore()
const {
  loadAllDevices, getDeviceStatus, getStatusLabel, formatTimeAgo,
  getRecentEvents, getDeviceAppMetrics, getDeviceMetrics, base64ToHex,
} = useDevices()
const {
  getEntry: getMetricsEntry,
  fetchAllMetrics,
  cancelAll: cancelMetrics,
  reset: resetMetrics,
  progress: metricsProgress,
} = useDeviceMetricsBatch()

// Auto-connect state
const autoConnecting = ref(false)
const autoConnectFailed = ref(false)

// Saved servers from settings
const savedServers = ref<ChirpStackServer[]>([])
const selectedSavedServer = ref('')

// Connection form
const serverHost = ref('')
const serverPort = ref('8090')
const apiToken = ref('')
const connecting = ref(false)
const connectionError = ref('')

// Dashboard data
const devices = ref<Device[]>([])
const stats = ref<AnalyzeStats | null>(null)
const loadingDevices = ref(false)

// Filters & sort
const searchQuery = ref('')
const statusFilter = ref('')
const dpFilter = ref('')
const tagFilter = ref('')
const sortField = ref('lastSeenAt')
const sortAsc = ref(false)

// Event stream modal
const showEvents = ref(false)
const eventsDevice = ref<{ devEui: string; name: string } | null>(null)
const eventsList = ref<DeviceEvent[]>([])
const eventsStatus = ref<'connecting' | 'connected' | 'error' | 'idle'>('idle')
const eventsError = ref('')
let stopStream: (() => void) | null = null

// App metrics (decoded measurements)
const appMetrics = ref<Record<string, MetricData>>({})
const appStates = ref<Record<string, { name: string; value: string }>>({})
const appMetricsRaw = ref<unknown>(null)
const appMetricsLoading = ref(false)

// Recent events (buffered historical)
const recentEventsLoading = ref(false)

// Link metrics (RSSI, SNR, packets)
const linkMetrics = ref<MetricData[]>([])
const linkMetricsLoading = ref(false)

async function loadSavedServers() {
  try {
    const { data } = await api.get<ChirpStackServer[]>('/api/auth/servers')
    savedServers.value = data
  } catch {
    // Not logged in or no servers saved - that's fine
  }
}

function selectSavedServer(serverId: string) {
  selectedSavedServer.value = serverId
  if (!serverId) return
  const srv = savedServers.value.find(s => s.id === serverId)
  if (!srv) return

  // Parse URL into host + port
  try {
    const url = new URL(srv.url.includes('://') ? srv.url : `http://${srv.url}`)
    serverHost.value = `${url.protocol}//${url.hostname}`
    serverPort.value = url.port || ''
  } catch {
    // URL without protocol, try to split on last ':'
    const lastColon = srv.url.lastIndexOf(':')
    if (lastColon > 0) {
      const afterColon = srv.url.substring(lastColon + 1)
      if (/^\d+$/.test(afterColon)) {
        serverHost.value = srv.url.substring(0, lastColon)
        serverPort.value = afterColon
      } else {
        serverHost.value = srv.url
        serverPort.value = ''
      }
    } else {
      serverHost.value = srv.url
      serverPort.value = ''
    }
  }
  apiToken.value = srv.api_token
}

async function connect() {
  connecting.value = true
  connectionError.value = ''
  try {
    const url = serverPort.value
      ? `${serverHost.value}:${serverPort.value}`
      : serverHost.value
    const success = await conn.testConnection(url, apiToken.value)
    if (!success) {
      connectionError.value = 'Connexion echouee. Verifiez l\'URL et le token.'
      return
    }

    conn.currentServer = {
      id: '',
      name: 'Current',
      url,
      api_token: apiToken.value,
      created_at: '',
    }

    if (conn.selectedTenantId) {
      await conn.loadApplications(conn.selectedTenantId)
      await conn.loadDeviceProfiles(conn.selectedTenantId)
    }
  } catch {
    connectionError.value = 'Erreur de connexion au serveur ChirpStack'
  } finally {
    connecting.value = false
  }
}

async function selectTenant(tenantId: string) {
  conn.selectedTenantId = tenantId
  conn.selectedApplicationId = ''
  conn.selectedApplicationName = ''
  devices.value = []
  stats.value = null
  resetMetrics()
  await conn.loadApplications(tenantId)
  await conn.loadDeviceProfiles(tenantId)
}

async function switchClientConnection(index: number) {
  devices.value = []
  stats.value = null
  resetMetrics()
  await conn.switchConnection(index)
  if (conn.selectedApplicationId) {
    await loadDashboardDevices()
  }
}

async function selectApp(appId: string) {
  if (!appId) {
    conn.selectedApplicationId = ''
    conn.selectedApplicationName = ''
    devices.value = []
    stats.value = null
    resetMetrics()
    return
  }
  conn.selectApplication(appId)
  await loadDashboardDevices()
}

async function loadDashboardDevices() {
  if (!conn.currentServer || !conn.selectedApplicationId) return
  loadingDevices.value = true
  try {
    devices.value = await loadAllDevices(
      conn.currentServer.url,
      conn.currentServer.api_token,
      conn.selectedApplicationId
    )
    computeStats()
    // Fetch metrics progressively for all devices
    fetchAllMetrics(devices.value, conn.currentServer.url, conn.currentServer.api_token)
  } finally {
    loadingDevices.value = false
  }
}

function computeStats() {
  const s: AnalyzeStats = {
    total: devices.value.length,
    active: 0,
    recent: 0,
    inactive: 0,
    offline: 0,
    never: 0,
    byProfile: {},
  }
  for (const d of devices.value) {
    const status = getDeviceStatus(d)
    s[status]++
    const pn = d.deviceProfileName || 'Unknown'
    s.byProfile[pn] = (s.byProfile[pn] || 0) + 1
  }
  stats.value = s
}

// Filtering & sorting
const filteredDevices = computed(() => {
  let result = devices.value

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(d =>
      (d.name && d.name.toLowerCase().includes(q)) ||
      d.devEui.toLowerCase().includes(q) ||
      (d.deviceProfileName && d.deviceProfileName.toLowerCase().includes(q)) ||
      (d.tags && Object.entries(d.tags).some(([k, v]) =>
        k.toLowerCase().includes(q) || v.toLowerCase().includes(q)
      ))
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
        d.tags && Object.entries(d.tags).some(([k, v]) =>
          k.toLowerCase().includes(q) || v.toLowerCase().includes(q)
        )
      )
    }
  }

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

function sortIndicator(field: string) {
  if (sortField.value !== field) return ''
  return sortAsc.value ? ' ▲' : ' ▼'
}

// Event stream + app metrics
async function openEvents(device: Device) {
  closeEvents()
  eventsDevice.value = { devEui: device.devEui, name: device.name }
  eventsList.value = []
  eventsStatus.value = 'connecting'
  eventsError.value = ''
  appMetrics.value = {}
  appStates.value = {}
  appMetricsRaw.value = null
  linkMetrics.value = []
  recentEventsLoading.value = false
  showEvents.value = true

  if (!conn.currentServer) return

  // Load metrics + recent events in parallel
  loadAppMetrics(device.devEui)
  loadLinkMetrics(device.devEui)
  loadRecentEvents(device.devEui)
}

async function loadRecentEvents(devEui: string) {
  if (!conn.currentServer) return
  recentEventsLoading.value = true
  try {
    const events = await getRecentEvents(
      conn.currentServer.url,
      conn.currentServer.api_token,
      devEui,
      20
    )
    // Show most recent first
    eventsList.value = events.reverse()
    eventsStatus.value = 'connected'
  } catch (err) {
    eventsStatus.value = 'error'
    eventsError.value = err instanceof Error ? err.message : 'Erreur chargement evenements'
  } finally {
    recentEventsLoading.value = false
  }
}

async function loadAppMetrics(devEui: string) {
  if (!conn.currentServer) return
  appMetricsLoading.value = true
  try {
    const result = await getDeviceAppMetrics(
      conn.currentServer.url,
      conn.currentServer.api_token,
      devEui,
      '24h'
    )
    appMetrics.value = result.metrics
    appStates.value = result.states
    appMetricsRaw.value = result.raw
  } catch {
    // Metrics endpoint might not be available, that's OK
  } finally {
    appMetricsLoading.value = false
  }
}

async function loadLinkMetrics(devEui: string) {
  if (!conn.currentServer) return
  linkMetricsLoading.value = true
  try {
    linkMetrics.value = await getDeviceMetrics(
      conn.currentServer.url,
      conn.currentServer.api_token,
      devEui,
      '24h'
    )
  } catch {
    // Link metrics might not be available
  } finally {
    linkMetricsLoading.value = false
  }
}

function closeEvents() {
  if (stopStream) {
    stopStream()
    stopStream = null
  }
  showEvents.value = false
  eventsStatus.value = 'idle'
}

function formatEventTime(time: string) {
  try {
    return new Date(time).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return time }
}

function eventTypeLabel(type: string) {
  const labels: Record<string, string> = {
    up: 'Uplink',
    join: 'Join',
    ack: 'Ack',
    log: 'Log',
    status: 'Status',
    txack: 'TX Ack',
  }
  return labels[type] || type
}

function eventTypeColor(type: string) {
  const colors: Record<string, string> = {
    up: 'bg-emerald-500/15 text-emerald-400',
    join: 'bg-cyan-500/15 text-cyan-400',
    ack: 'bg-amber-500/15 text-amber-400',
    log: 'bg-zinc-800 text-zinc-400',
    status: 'bg-cyan-500/15 text-cyan-400',
  }
  return colors[type] || 'bg-zinc-800 text-zinc-400'
}

function formatDecodedObject(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch { return String(obj) }
}

function lastMetricValue(m: MetricData): string {
  for (let i = m.values.length - 1; i >= 0; i--) {
    if (m.values[i] !== 0) return m.values[i].toFixed(1)
  }
  return '-'
}

function tagClass(key: string): string {
  const k = key.toLowerCase()
  if (k.includes('site')) return 'tag-site'
  if (k.includes('bat') || k.includes('build')) return 'tag-batiment'
  if (k.includes('etage') || k.includes('floor') || k.includes('level')) return 'tag-etage'
  if (k.includes('emplacement') || k.includes('loc') || k.includes('room') || k.includes('zone')) return 'tag-emplacement'
  return 'tag-default'
}

interface MeasureBadge {
  label: string
  value: string
  colorClass: string
}

function formatMeasuresCompact(entry: DeviceMetricsEntry): MeasureBadge[] {
  const badges: MeasureBadge[] = []

  // States first (last known values)
  for (const [key, state] of Object.entries(entry.states)) {
    const k = key.toLowerCase()
    badges.push({
      label: state.name || key,
      value: state.value,
      colorClass: getMeasureColor(k, state.value),
    })
  }

  // Metrics (last non-zero value)
  for (const [key, m] of Object.entries(entry.metrics)) {
    const k = key.toLowerCase()
    let lastVal = '-'
    for (let i = m.values.length - 1; i >= 0; i--) {
      if (m.values[i] !== 0) {
        lastVal = m.values[i].toFixed(1)
        break
      }
    }
    if (lastVal === '-') continue
    badges.push({
      label: m.label || key,
      value: lastVal + getMeasureUnit(k),
      colorClass: getMeasureColor(k),
    })
  }

  return badges.slice(0, 4)
}

function getMeasureColor(key: string, value?: string): string {
  if (key.startsWith('temp') || key.includes('temperature')) return 'text-orange-400'
  if (key.startsWith('humid') || key.includes('humidity') || key.includes('rh')) return 'text-blue-400'
  if (key.startsWith('batt') || key === 'voltage') return 'text-yellow-400'
  if (key === 'contact' || key === 'door' || key === 'window') {
    const v = (value ?? '').toLowerCase()
    if (v === 'open' || v === 'ouvert' || v === '1' || v === 'true') return 'text-red-400'
    return 'text-emerald-400'
  }
  if (key === 'co2' || key.includes('co2')) return 'text-violet-400'
  if (key === 'lux' || key.includes('light') || key.includes('luminosity')) return 'text-amber-400'
  return 'text-zinc-300'
}

function getMeasureUnit(key: string): string {
  if (key.startsWith('temp') || key.includes('temperature')) return '°C'
  if (key.startsWith('humid') || key.includes('humidity') || key.includes('rh')) return '%'
  if (key.startsWith('batt')) return '%'
  if (key === 'voltage') return 'V'
  if (key === 'co2' || key.includes('co2')) return ' ppm'
  if (key === 'lux' || key.includes('light') || key.includes('luminosity')) return ' lx'
  return ''
}

const statusColors: Record<DeviceStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  recent: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  inactive: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  offline: 'bg-red-500/15 text-red-400 border-red-500/20',
  never: 'bg-zinc-800/80 text-zinc-400 border-zinc-700',
}

const statusGlows: Record<DeviceStatus, string> = {
  active: 'hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]',
  recent: 'hover:shadow-[0_0_15px_rgba(6,182,212,0.15)]',
  inactive: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]',
  offline: 'hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]',
  never: 'hover:shadow-[0_0_15px_rgba(161,161,170,0.1)]',
}

onMounted(async () => {
  loadSavedServers()

  // Auto-connect for client_visu users
  if (auth.isClientVisu && !conn.isConnected) {
    autoConnecting.value = true
    try {
      const ok = await conn.autoConnect()
      if (ok && conn.selectedApplicationId) {
        await loadDashboardDevices()
      } else if (!ok) {
        autoConnectFailed.value = true
      }
    } finally {
      autoConnecting.value = false
    }
  } else if (conn.isConnected && conn.selectedApplicationId) {
    loadDashboardDevices()
  }
})

onUnmounted(() => {
  if (stopStream) stopStream()
  cancelMetrics()
})
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-semibold tracking-tight">Dashboard</h2>

    <!-- Connection Panel (if not connected) — hidden for client_visu (auto-connect) -->
    <div v-if="!conn.isConnected && auth.isClientVisu" class="card max-w-xl">
      <div v-if="autoConnecting" class="flex items-center gap-3">
        <div class="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p class="text-zinc-400">Connexion en cours...</p>
      </div>
      <div v-else-if="autoConnectFailed">
        <p class="text-red-400 text-sm">Connexion impossible. Contactez votre administrateur.</p>
      </div>
    </div>

    <div v-else-if="!conn.isConnected" class="card max-w-xl">
      <h3 class="text-lg font-semibold mb-4 text-zinc-100">Connexion ChirpStack</h3>

      <!-- Saved servers -->
      <div v-if="savedServers.length > 0" class="mb-4">
        <label class="label">Serveurs sauvegardes</label>
        <div class="flex gap-2">
          <select
            class="input flex-1"
            :value="selectedSavedServer"
            @change="selectSavedServer(($event.target as HTMLSelectElement).value)"
          >
            <option value="">-- Saisie manuelle --</option>
            <option v-for="s in savedServers" :key="s.id" :value="s.id">{{ s.name }} ({{ s.url }})</option>
          </select>
        </div>
      </div>

      <form class="space-y-4" @submit.prevent="connect">
        <div v-if="connectionError" class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {{ connectionError }}
        </div>
        <div>
          <label class="label">URL du serveur</label>
          <div class="flex gap-2">
            <input v-model="serverHost" class="input flex-1" placeholder="http://chirpstack" required />
            <input v-model="serverPort" class="input w-24" placeholder="8090" />
          </div>
        </div>
        <div>
          <label class="label">API Token</label>
          <input v-model="apiToken" type="password" class="input" placeholder="Token d'API ChirpStack" required />
        </div>
        <button type="submit" class="btn-primary" :disabled="connecting">
          {{ connecting ? 'Connexion...' : 'Tester la connexion' }}
        </button>
      </form>
    </div>

    <!-- Tenant / Application selection bar -->
    <div v-if="conn.isConnected" class="card relative z-10">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Client visu: read-only compact header -->
        <template v-if="conn.autoConnected">
          <!-- Connection selector for multi-tenant CLIENT_VISU -->
          <div v-if="conn.clientConnections.length > 1" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Connexion</label>
            <AppSelect
              class="max-w-xs"
              :model-value="String(conn.selectedConnectionIndex)"
              :options="conn.clientConnections.map((c, i) => ({ value: String(i), label: (c.tenant_name || c.tenant_id) + ' — ' + c.server_url }))"
              placeholder="-- Choisir --"
              @update:model-value="switchClientConnection(Number($event))"
            />
          </div>
          <div v-else class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Tenant</label>
            <span class="text-sm text-zinc-300">{{ conn.selectedTenant?.name || conn.selectedTenantId }}</span>
          </div>
          <div v-if="conn.applications.length > 1 && conn.selectedTenantId" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Application</label>
            <AppSelect
              class="max-w-xs"
              :model-value="conn.selectedApplicationId"
              :options="conn.applications.map(app => ({ value: app.id, label: app.name }))"
              placeholder="-- Choisir une application --"
              @update:model-value="selectApp($event)"
            />
          </div>
          <div v-else-if="conn.selectedApplicationName" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Application</label>
            <span class="text-sm text-zinc-300">{{ conn.selectedApplicationName }}</span>
          </div>
        </template>

        <!-- Admin/super_admin: full controls -->
        <template v-else>
          <div v-if="conn.tenants.length > 1" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Tenant</label>
            <AppSelect
              class="max-w-xs"
              :model-value="conn.selectedTenantId"
              :options="conn.tenants.map(t => ({ value: t.id, label: t.name }))"
              placeholder="-- Choisir un tenant --"
              @update:model-value="selectTenant($event)"
            />
          </div>
          <div v-else-if="conn.tenants.length === 1" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Tenant</label>
            <span class="text-sm text-zinc-300">{{ conn.tenants[0].name }}</span>
          </div>

          <div v-if="conn.selectedTenantId" class="flex items-center gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">Application</label>
            <AppSelect
              class="max-w-xs"
              :model-value="conn.selectedApplicationId"
              :options="conn.applications.map(app => ({ value: app.id, label: app.name }))"
              placeholder="-- Choisir une application --"
              @update:model-value="selectApp($event)"
            />
          </div>

          <button class="btn-sm btn-secondary ml-auto" @click="conn.disconnect()">Deconnecter</button>
        </template>
      </div>
    </div>

    <!-- Stats Dashboard -->
    <template v-if="conn.isConnected && conn.selectedApplicationId">
      <div v-if="loadingDevices" class="text-zinc-500">Chargement des devices...</div>

      <template v-if="stats">
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div class="card text-center">
            <p class="text-2xl font-bold text-zinc-100">{{ stats.total }}</p>
            <p class="text-xs text-zinc-400 mt-1">Total</p>
          </div>
          <button
            v-for="status in (['active', 'recent', 'inactive', 'offline', 'never'] as DeviceStatus[])"
            :key="status"
            class="card text-center border cursor-pointer hover:scale-105 transition-all duration-300"
            :class="[statusColors[status], statusGlows[status]]"
            @click="statusFilter = statusFilter === status ? '' : status"
          >
            <p class="text-2xl font-bold">{{ stats[status] }}</p>
            <p class="text-xs mt-1 text-zinc-400">{{ getStatusLabel(status) }}</p>
          </button>
        </div>

        <!-- Profile Distribution -->
        <div v-if="Object.keys(stats.byProfile).length > 1" class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-3">Repartition par profil</h3>
          <div class="space-y-2">
            <div v-for="(count, name) in stats.byProfile" :key="String(name)" class="flex items-center gap-3">
              <span class="text-sm text-zinc-400 w-40 truncate">{{ name }}</span>
              <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
                  :style="{ width: `${(count / stats.total) * 100}%` }"
                />
              </div>
              <span class="text-xs text-zinc-400 w-12 text-right">{{ count }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="Object.keys(stats.byProfile).length === 1" class="card">
          <div class="flex items-center gap-3">
            <span class="text-sm text-zinc-400">{{ Object.keys(stats.byProfile)[0] }}</span>
            <span class="text-sm font-medium text-zinc-200">{{ Object.values(stats.byProfile)[0] }} devices</span>
          </div>
        </div>

        <!-- Filters -->
        <div class="card relative z-10">
          <div class="flex flex-wrap gap-3">
            <input v-model="searchQuery" class="input max-w-xs" placeholder="Rechercher (nom, EUI, profil, tags)..." />
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
          </div>
          <p class="text-xs text-zinc-500 mt-2">{{ filteredDevices.length }} / {{ devices.length }} devices</p>
          <!-- Metrics loading progress -->
          <div v-if="metricsProgress.total > 0 && metricsProgress.done < metricsProgress.total" class="mt-2">
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full transition-all duration-300"
                  :style="{ width: `${(metricsProgress.done / metricsProgress.total) * 100}%` }"
                />
              </div>
              <span class="text-[10px] text-zinc-500 whitespace-nowrap">Mesures {{ metricsProgress.done }}/{{ metricsProgress.total }}</span>
            </div>
          </div>
        </div>

        <!-- Device Table -->
        <div class="card">
          <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-zinc-900/90 backdrop-blur-sm">
                <tr class="border-b border-white/[0.06]">
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer select-none" @click="toggleSort('name')">
                    Nom{{ sortIndicator('name') }}
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer select-none" @click="toggleSort('devEui')">
                    DevEUI{{ sortIndicator('devEui') }}
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Profil</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Tags</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Mesures</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 cursor-pointer select-none" @click="toggleSort('lastSeenAt')">
                    Dernier vu{{ sortIndicator('lastSeenAt') }}
                  </th>
                  <th class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">Statut</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/[0.03]">
                <tr v-for="d in filteredDevices" :key="d.devEui" class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors group">
                  <td class="px-3 py-2.5 text-zinc-200">{{ d.name || '-' }}</td>
                  <td class="px-3 py-2.5 font-mono text-xs text-zinc-300">
                    {{ d.devEui }}
                    <CopyButton :text="d.devEui" />
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
                  <td class="px-3 py-2.5 text-xs">
                    <template v-if="getMetricsEntry(d.devEui)?.status === 'loading'">
                      <div class="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin inline-block" />
                    </template>
                    <template v-else-if="getMetricsEntry(d.devEui)?.status === 'loaded'">
                      <div v-if="formatMeasuresCompact(getMetricsEntry(d.devEui)!).length > 0" class="flex flex-wrap gap-x-2 gap-y-0.5">
                        <span
                          v-for="badge in formatMeasuresCompact(getMetricsEntry(d.devEui)!)"
                          :key="badge.label"
                          class="whitespace-nowrap"
                          :class="badge.colorClass"
                        >{{ badge.label }} <span class="font-semibold">{{ badge.value }}</span></span>
                      </div>
                      <span v-else class="text-zinc-600">-</span>
                    </template>
                    <span v-else-if="getMetricsEntry(d.devEui)?.status === 'error'" class="text-zinc-600">-</span>
                    <span v-else class="text-zinc-700">...</span>
                  </td>
                  <td class="px-3 py-2.5 text-zinc-500 text-xs text-right">{{ formatTimeAgo(d.lastSeenAt) }}</td>
                  <td class="px-3 py-2.5 text-center">
                    <span class="badge" :class="statusColors[getDeviceStatus(d)]">
                      {{ getStatusLabel(getDeviceStatus(d)) }}
                    </span>
                  </td>
                  <td class="px-3 py-2.5 text-right">
                    <button class="btn-sm btn-secondary text-xs" @click="openEvents(d)">Messages</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <!-- Device Messages Modal -->
    <Modal
      :title="`Messages - ${eventsDevice?.name || ''}`"
      :show="showEvents"
      size="xl"
      @close="closeEvents"
    >
      <div class="space-y-4">
        <!-- Device info bar -->
        <div class="flex items-center gap-3 mb-3">
          <span v-if="eventsDevice" class="text-sm font-mono text-zinc-400">{{ eventsDevice.devEui }}</span>
        </div>

        <!-- App Metrics (decoded codec data via REST) -->
        <div v-if="appMetricsLoading" class="text-xs text-zinc-500">Chargement des mesures...</div>

        <div v-if="Object.keys(appStates).length > 0 || Object.keys(appMetrics).length > 0" class="bg-zinc-900/50 rounded-xl border border-white/[0.06] p-4 space-y-3">
          <h4 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Dernieres mesures decodees (24h)</h4>

          <!-- States (last known values) -->
          <div v-if="Object.keys(appStates).length > 0" class="flex flex-wrap gap-3">
            <div
              v-for="(state, key) in appStates"
              :key="String(key)"
              class="bg-white/[0.03] rounded-lg px-3 py-2 text-center min-w-[100px]"
            >
              <p class="text-2xl font-bold text-cyan-400">{{ state.value }}</p>
              <p class="text-[11px] text-zinc-500">{{ state.name || key }}</p>
            </div>
          </div>

          <!-- Metrics (aggregated values) -->
          <div v-if="Object.keys(appMetrics).length > 0" class="flex flex-wrap gap-3">
            <div
              v-for="(m, key) in appMetrics"
              :key="String(key)"
              class="bg-white/[0.03] rounded-lg px-3 py-2 text-center min-w-[100px]"
            >
              <p class="text-2xl font-bold text-emerald-400">{{ lastMetricValue(m) }}</p>
              <p class="text-[11px] text-zinc-500">{{ m.label }}</p>
              <p class="text-[10px] text-zinc-500">moy: {{ m.avg.toFixed(1) }}</p>
            </div>
          </div>

          <!-- Raw JSON (collapsible) -->
          <details v-if="appMetricsRaw" class="mt-2">
            <summary class="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">Voir le JSON complet</summary>
            <pre class="text-xs font-mono text-zinc-400 bg-zinc-950 border border-white/[0.06] px-3 py-2 rounded-lg overflow-x-auto max-h-64 mt-2">{{ formatDecodedObject(appMetricsRaw) }}</pre>
          </details>
        </div>

        <!-- Link Metrics (RSSI, SNR, packets - always available) -->
        <div v-if="linkMetricsLoading" class="text-xs text-zinc-500">Chargement des metriques radio...</div>

        <div v-if="linkMetrics.length > 0" class="bg-zinc-900/50 rounded-xl border border-white/[0.06] p-4 space-y-3">
          <h4 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Metriques radio (24h)</h4>
          <div class="flex flex-wrap gap-3">
            <div
              v-for="m in linkMetrics"
              :key="m.label"
              class="bg-white/[0.03] rounded-lg px-3 py-2 text-center min-w-[120px]"
            >
              <p class="text-2xl font-bold text-cyan-400">{{ lastMetricValue(m) }}</p>
              <p class="text-[11px] text-zinc-500">{{ m.label }}</p>
              <p class="text-[10px] text-zinc-500">moy: {{ m.avg.toFixed(1) }} | total: {{ m.total.toFixed(0) }}</p>
            </div>
          </div>
        </div>

        <!-- Events status bar -->
        <div class="flex items-center gap-3 border-t border-white/[0.06] pt-3 mt-4">
          <div
            class="w-2 h-2 rounded-full"
            :class="{
              'bg-amber-400 animate-pulse': eventsStatus === 'connecting',
              'bg-emerald-400': eventsStatus === 'connected',
              'bg-red-400': eventsStatus === 'error',
            }"
          />
          <span class="text-xs text-zinc-500">
            <template v-if="eventsStatus === 'connecting'">Chargement des derniers evenements...</template>
            <template v-else-if="eventsStatus === 'connected' && eventsList.length === 0">Aucun evenement recent pour ce device</template>
            <template v-else-if="eventsStatus === 'connected'">{{ eventsList.length }} dernier(s) evenement(s)</template>
            <template v-else-if="eventsStatus === 'error'">{{ eventsError }}</template>
          </span>
          <span class="ml-auto text-xs text-cyan-400 hover:underline cursor-help">Historique via gRPC</span>
        </div>

        <!-- Events list -->
        <div v-if="eventsList.length > 0" class="space-y-3">
          <div
            v-for="(evt, idx) in eventsList"
            :key="idx"
            class="bg-zinc-900/50 rounded-xl border border-white/[0.06] overflow-hidden"
          >
            <!-- Event header -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-white/[0.06]">
              <span class="badge text-xs" :class="eventTypeColor(evt.type)">{{ eventTypeLabel(evt.type) }}</span>
              <span class="text-xs text-zinc-500">{{ formatEventTime(evt.time) }}</span>
              <template v-if="evt.type === 'up'">
                <span v-if="evt.devAddr" class="text-xs text-zinc-500 font-mono">devAddr: {{ evt.devAddr }}</span>
                <span v-if="evt.fPort !== undefined" class="text-xs text-zinc-500">fPort: {{ evt.fPort }}</span>
                <span v-if="evt.fCnt !== undefined" class="text-xs text-zinc-500">fCnt: {{ evt.fCnt }}</span>
                <span v-if="evt.dr !== undefined" class="text-xs text-zinc-500">DR{{ evt.dr }}</span>
                <span v-if="evt.confirmed" class="badge text-[10px] bg-amber-500/15 text-amber-400">Confirmed</span>
              </template>
            </div>

            <!-- Uplink details -->
            <div v-if="evt.type === 'up'" class="px-4 py-3 space-y-3">
              <!-- Raw payload -->
              <div v-if="evt.data">
                <p class="text-xs font-medium text-zinc-500 mb-1">Trame brute (hex)</p>
                <div class="flex items-center gap-2">
                  <code class="text-xs font-mono text-cyan-400 bg-zinc-950 border border-cyan-500/20 px-2 py-1 rounded break-all">{{ base64ToHex(evt.data) }}</code>
                  <CopyButton :text="base64ToHex(evt.data)" />
                </div>
              </div>

              <!-- Decoded object -->
              <div v-if="evt.object">
                <p class="text-xs font-medium text-zinc-500 mb-1">Trame decodee</p>
                <pre class="text-xs font-mono text-emerald-400 bg-zinc-950 border border-emerald-500/20 px-3 py-2 rounded-lg overflow-x-auto max-h-48">{{ formatDecodedObject(evt.object) }}</pre>
              </div>

              <!-- RX Info -->
              <div v-if="evt.rxInfo && evt.rxInfo.length > 0">
                <p class="text-xs font-medium text-zinc-500 mb-1">Reception ({{ evt.rxInfo.length }} gateway{{ evt.rxInfo.length > 1 ? 's' : '' }})</p>
                <div class="flex flex-wrap gap-3">
                  <div
                    v-for="(rx, ri) in evt.rxInfo"
                    :key="ri"
                    class="bg-white/[0.03] rounded-lg px-3 py-1.5 text-xs space-y-0.5"
                  >
                    <div class="text-zinc-400">
                      RSSI: <span class="font-mono" :class="rx.rssi > -100 ? 'text-emerald-400' : 'text-red-400'">{{ rx.rssi }} dBm</span>
                    </div>
                    <div class="text-zinc-400">
                      SNR: <span class="font-mono" :class="rx.snr > 0 ? 'text-emerald-400' : 'text-amber-400'">{{ rx.snr }} dB</span>
                    </div>
                    <div class="text-zinc-500 font-mono text-[10px] truncate max-w-[200px]">{{ rx.gatewayId }}</div>
                  </div>
                </div>
              </div>

              <!-- TX Info -->
              <div v-if="evt.txInfo?.frequency" class="text-xs text-zinc-500">
                Frequence: {{ (evt.txInfo.frequency / 1000000).toFixed(1) }} MHz
              </div>

              <!-- Full raw JSON for uplink -->
              <details class="mt-2">
                <summary class="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">Voir JSON complet</summary>
                <pre class="text-xs font-mono text-zinc-400 bg-zinc-950 border border-white/[0.06] px-3 py-2 rounded-lg overflow-x-auto max-h-64 mt-1">{{ formatDecodedObject(evt) }}</pre>
              </details>
            </div>

            <!-- Non-uplink: show raw JSON -->
            <div v-else class="px-4 py-3">
              <pre class="text-xs font-mono text-zinc-400 bg-zinc-950 border border-white/[0.06] px-3 py-2 rounded-lg overflow-x-auto max-h-32">{{ formatDecodedObject(evt) }}</pre>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="eventsStatus === 'connected'" class="text-center py-6">
          <p class="text-zinc-500 text-sm">Aucun evenement recent pour ce device</p>
          <p class="text-zinc-500 text-xs mt-1">Ce device n'a pas encore envoye de messages, ou les evenements ont expire</p>
        </div>
      </div>
    </Modal>
  </div>
</template>
