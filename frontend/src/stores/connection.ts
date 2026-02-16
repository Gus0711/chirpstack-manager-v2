import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ChirpStackServer,
  Tenant,
  Application,
  DeviceProfile,
  ClientConnection,
} from '@/types'
import { api, useChirpstack } from '@/composables/useApi'

export const useConnectionStore = defineStore('connection', () => {
  // ChirpStack connection
  const servers = ref<ChirpStackServer[]>([])
  const currentServer = ref<ChirpStackServer | null>(null)
  const isConnected = ref(false)
  const isAdminKey = ref(false)

  // Tenant / Application
  const tenants = ref<Tenant[]>([])
  const selectedTenantId = ref<string>('')
  const applications = ref<Application[]>([])
  const selectedApplicationId = ref<string>('')
  const selectedApplicationName = ref<string>('')
  const deviceProfiles = ref<DeviceProfile[]>([])

  const selectedTenant = computed(() =>
    tenants.value.find(t => t.id === selectedTenantId.value) ?? null
  )

  async function testConnection(serverUrl: string, apiToken: string): Promise<boolean> {
    const cs = useChirpstack(serverUrl, apiToken)
    try {
      const data = await cs.get<{ result: Tenant[] }>('/api/tenants', { limit: 100 })
      tenants.value = data.result || []
      isAdminKey.value = tenants.value.length > 0
      isConnected.value = true

      if (tenants.value.length === 1) {
        selectedTenantId.value = tenants.value[0].id
      }
      return true
    } catch {
      isConnected.value = false
      return false
    }
  }

  async function loadApplications(tenantId: string): Promise<void> {
    if (!currentServer.value) return
    const cs = useChirpstack(currentServer.value.url, currentServer.value.api_token)

    const data = await cs.get<{ result: Application[] }>('/api/applications', {
      tenant_id: tenantId,
      limit: 100,
    })
    applications.value = data.result || []
  }

  async function loadDeviceProfiles(tenantId: string): Promise<void> {
    if (!currentServer.value) return
    const cs = useChirpstack(currentServer.value.url, currentServer.value.api_token)

    const data = await cs.get<{ result: DeviceProfile[] }>('/api/device-profiles', {
      tenant_id: tenantId,
      limit: 100,
    })
    deviceProfiles.value = data.result || []
  }

  function selectApplication(appId: string) {
    selectedApplicationId.value = appId
    const app = applications.value.find(a => a.id === appId)
    selectedApplicationName.value = app?.name ?? ''
  }

  // Auto-connect state
  const autoConnected = ref(false)
  const clientConnections = ref<ClientConnection[]>([])
  const selectedConnectionIndex = ref(0)

  async function connectToClientConnection(conn: ClientConnection): Promise<void> {
    currentServer.value = {
      id: '',
      name: 'Auto',
      url: conn.server_url,
      api_token: conn.server_api_token,
      created_at: '',
    }
    isConnected.value = true
    selectedTenantId.value = conn.tenant_id
    tenants.value = [{ id: conn.tenant_id, name: conn.tenant_name, description: '' }]

    await loadApplications(conn.tenant_id)
    await loadDeviceProfiles(conn.tenant_id)

    // Filter applications if restriction is set
    if (conn.allowed_application_ids.length > 0) {
      applications.value = applications.value.filter(
        a => conn.allowed_application_ids.includes(a.id)
      )
    }

    // Auto-select application if only one
    if (applications.value.length === 1) {
      selectApplication(applications.value[0].id)
    }
  }

  async function autoConnect(): Promise<boolean> {
    try {
      const { data } = await api.get<ClientConnection[]>('/api/auth/me/connections')
      if (data.length === 0) return false

      clientConnections.value = data
      selectedConnectionIndex.value = 0

      await connectToClientConnection(data[0])

      autoConnected.value = true
      return true
    } catch {
      // Reset on failure
      currentServer.value = null
      isConnected.value = false
      return false
    }
  }

  async function switchConnection(index: number): Promise<void> {
    if (index < 0 || index >= clientConnections.value.length) return
    selectedConnectionIndex.value = index

    // Reset current state
    applications.value = []
    deviceProfiles.value = []
    selectedApplicationId.value = ''
    selectedApplicationName.value = ''

    await connectToClientConnection(clientConnections.value[index])
  }

  function disconnect() {
    isConnected.value = false
    isAdminKey.value = false
    tenants.value = []
    applications.value = []
    deviceProfiles.value = []
    selectedTenantId.value = ''
    selectedApplicationId.value = ''
    selectedApplicationName.value = ''
    currentServer.value = null
    autoConnected.value = false
    clientConnections.value = []
    selectedConnectionIndex.value = 0
  }

  return {
    servers,
    currentServer,
    isConnected,
    isAdminKey,
    tenants,
    selectedTenantId,
    selectedTenant,
    applications,
    selectedApplicationId,
    selectedApplicationName,
    deviceProfiles,
    autoConnected,
    clientConnections,
    selectedConnectionIndex,
    testConnection,
    loadApplications,
    loadDeviceProfiles,
    selectApplication,
    autoConnect,
    switchConnection,
    disconnect,
  }
})
