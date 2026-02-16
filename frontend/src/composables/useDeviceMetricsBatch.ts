import { reactive, ref, type Ref } from 'vue'
import type { Device, DeviceMetricsEntry } from '@/types'
import { useDevices } from './useDevices'

const CONCURRENCY = 5

export function useDeviceMetricsBatch() {
  const { getDeviceAppMetrics } = useDevices()

  const entries = reactive(new Map<string, DeviceMetricsEntry>())
  const progress = ref({ done: 0, total: 0 })
  let controller: AbortController | null = null

  function getEntry(devEui: string): DeviceMetricsEntry | undefined {
    return entries.get(devEui)
  }

  function reset() {
    cancelAll()
    entries.clear()
    progress.value = { done: 0, total: 0 }
  }

  function cancelAll() {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  async function fetchAllMetrics(
    devices: Device[],
    serverUrl: string,
    apiToken: string,
  ) {
    cancelAll()
    entries.clear()

    if (devices.length === 0) {
      progress.value = { done: 0, total: 0 }
      return
    }

    controller = new AbortController()
    const signal = controller.signal

    // Initialize all entries as loading
    for (const d of devices) {
      entries.set(d.devEui, { status: 'loading', states: {}, metrics: {} })
    }

    progress.value = { done: 0, total: devices.length }

    // Shared index for worker pool
    let idx = 0

    async function worker() {
      while (idx < devices.length) {
        if (signal.aborted) return
        const i = idx++
        const device = devices[i]
        try {
          const result = await getDeviceAppMetrics(
            serverUrl,
            apiToken,
            device.devEui,
            '24h',
          )
          if (signal.aborted) return
          entries.set(device.devEui, {
            status: 'loaded',
            states: result.states,
            metrics: result.metrics,
          })
        } catch {
          if (signal.aborted) return
          entries.set(device.devEui, { status: 'error', states: {}, metrics: {} })
        }
        progress.value = { ...progress.value, done: progress.value.done + 1 }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, devices.length) }, () => worker())
    await Promise.all(workers)
  }

  return {
    entries,
    progress: progress as Ref<{ done: number; total: number }>,
    getEntry,
    fetchAllMetrics,
    cancelAll,
    reset,
  }
}
