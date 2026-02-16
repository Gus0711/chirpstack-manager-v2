import { ref, computed } from 'vue'
import type { Device, BulkLogEntry, BulkResults } from '@/types'
import { useDevices } from './useDevices'
import { useConnectionStore } from '@/stores/connection'

export interface BulkOperationOptions {
  /** Delay between API calls in ms (default: 50) */
  delay?: number
}

/**
 * Generic composable that factorizes the Delete / Migrate / DPChange pattern.
 *
 * Covers: load devices, filter, select/deselect, execute with progress.
 * The caller only provides the `executeOne` callback for the actual API action.
 */
export function useBulkOperation(options: BulkOperationOptions = {}) {
  const delay = options.delay ?? 50

  // ── State ──
  const devices = ref<Device[]>([])
  const selection = ref<Set<string>>(new Set())
  const filterQuery = ref('')
  const isLoading = ref(false)
  const isExecuting = ref(false)

  // Progress
  const loadProgress = ref(0)
  const loadProgressText = ref('')
  const executeProgress = ref(0)
  const executeProgressText = ref('')

  // Results
  const logs = ref<BulkLogEntry[]>([])
  const results = ref<BulkResults | null>(null)

  // ── Computed ──
  const filteredDevices = computed(() => {
    if (!filterQuery.value) return devices.value
    const q = filterQuery.value.toLowerCase()
    return devices.value.filter(
      (d) =>
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.devEui && d.devEui.toLowerCase().includes(q))
    )
  })

  const selectionCount = computed(() => selection.value.size)
  const hasSelection = computed(() => selection.value.size > 0)

  // ── Load ──
  async function loadDevices(applicationId?: string): Promise<void> {
    const connStore = useConnectionStore()
    const appId = applicationId ?? connStore.selectedApplicationId
    if (!appId || !connStore.currentServer) return

    isLoading.value = true
    loadProgress.value = 0
    loadProgressText.value = 'Chargement...'

    try {
      const { loadAllDevices } = useDevices()
      devices.value = await loadAllDevices(
        connStore.currentServer.url,
        connStore.currentServer.api_token,
        appId,
        (loaded, total) => {
          loadProgress.value = total > 0 ? Math.round((loaded / total) * 100) : 0
          loadProgressText.value = `Chargement: ${loaded}/${total} devices`
        }
      )
      selection.value = new Set()
      filterQuery.value = ''
      loadProgressText.value = `${devices.value.length} devices charges`
    } catch (err) {
      loadProgressText.value = `Erreur: ${err}`
    } finally {
      isLoading.value = false
    }
  }

  // ── Selection ──
  function toggleSelection(devEui: string): void {
    if (selection.value.has(devEui)) {
      selection.value.delete(devEui)
    } else {
      selection.value.add(devEui)
    }
    // Trigger reactivity
    selection.value = new Set(selection.value)
  }

  function selectAll(): void {
    filteredDevices.value.forEach((d) => selection.value.add(d.devEui))
    selection.value = new Set(selection.value)
  }

  function deselectAll(): void {
    selection.value = new Set()
  }

  function setFilter(query: string): void {
    filterQuery.value = query
  }

  // ── Execute ──
  async function execute(
    executeFn: (device: Device) => Promise<BulkLogEntry>,
    onComplete?: (results: BulkResults) => void
  ): Promise<BulkResults> {
    if (selection.value.size === 0) {
      return { total: 0, success: 0, errors: 0 }
    }

    isExecuting.value = true
    logs.value = []
    executeProgress.value = 0

    const devEuis = [...selection.value]
    let success = 0
    let errors = 0

    for (let i = 0; i < devEuis.length; i++) {
      const devEui = devEuis[i]
      const device = devices.value.find((d) => d.devEui === devEui)
      if (!device) continue

      try {
        const entry = await executeFn(device)
        logs.value.push(entry)
        if (entry.status === 'success') success++
        else if (entry.status === 'error') errors++
      } catch (err) {
        logs.value.push({
          status: 'error',
          message: `${device.name || devEui}: ${err}`,
        })
        errors++
      }

      const pct = Math.round(((i + 1) / devEuis.length) * 100)
      executeProgress.value = pct
      executeProgressText.value = `${i + 1}/${devEuis.length}`

      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    const finalResults: BulkResults = {
      total: devEuis.length,
      success,
      errors,
    }
    results.value = finalResults
    isExecuting.value = false

    onComplete?.(finalResults)
    return finalResults
  }

  // ── Reset ──
  function reset(): void {
    devices.value = []
    selection.value = new Set()
    filterQuery.value = ''
    logs.value = []
    results.value = null
    loadProgress.value = 0
    loadProgressText.value = ''
    executeProgress.value = 0
    executeProgressText.value = ''
  }

  return {
    // State
    devices,
    selection,
    filterQuery,
    isLoading,
    isExecuting,
    loadProgress,
    loadProgressText,
    executeProgress,
    executeProgressText,
    logs,
    results,

    // Computed
    filteredDevices,
    selectionCount,
    hasSelection,

    // Actions
    loadDevices,
    toggleSelection,
    selectAll,
    deselectAll,
    setFilter,
    execute,
    reset,
  }
}
