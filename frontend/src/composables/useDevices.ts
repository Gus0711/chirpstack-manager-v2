import type { Device, DeviceEvent, DeviceKeys, DeviceStatus, LinkMetrics, MetricData } from '@/types'
import { useChirpstack } from './useApi'

/**
 * Composable for ChirpStack device operations.
 * Provides all device-related API calls used across tools.
 */
export function useDevices() {
  /**
   * Load all devices from an application with pagination.
   */
  async function loadAllDevices(
    serverUrl: string,
    apiToken: string,
    applicationId: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Device[]> {
    const cs = useChirpstack(serverUrl, apiToken)
    const allDevices: Device[] = []
    const limit = 100
    let offset = 0
    let total = 0

    do {
      const data = await cs.get<{ result: Device[]; totalCount: string }>(
        '/api/devices',
        { applicationId, limit, offset }
      )
      total = parseInt(data.totalCount || '0', 10)
      if (data.result) {
        allDevices.push(...data.result)
      }
      offset += limit
      onProgress?.(allDevices.length, total)
    } while (allDevices.length < total)

    return allDevices
  }

  /**
   * Get a single device by DevEUI.
   */
  async function getDevice(
    serverUrl: string,
    apiToken: string,
    devEui: string
  ): Promise<{ device: Device }> {
    const cs = useChirpstack(serverUrl, apiToken)
    return cs.get<{ device: Device }>(`/api/devices/${devEui}`)
  }

  /**
   * Create a device.
   */
  async function createDevice(
    serverUrl: string,
    apiToken: string,
    device: {
      applicationId: string
      name: string
      description: string
      devEui: string
      deviceProfileId: string
      tags: Record<string, string>
    }
  ): Promise<void> {
    const cs = useChirpstack(serverUrl, apiToken)
    await cs.post('/api/devices', { device })
  }

  /**
   * Update a device.
   */
  async function updateDevice(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    device: Record<string, unknown>
  ): Promise<void> {
    const cs = useChirpstack(serverUrl, apiToken)
    await cs.put(`/api/devices/${devEui}`, { device })
  }

  /**
   * Delete a device.
   */
  async function deleteDevice(
    serverUrl: string,
    apiToken: string,
    devEui: string
  ): Promise<void> {
    const cs = useChirpstack(serverUrl, apiToken)
    await cs.del(`/api/devices/${devEui}`)
  }

  /**
   * Get device keys.
   */
  async function getDeviceKeys(
    serverUrl: string,
    apiToken: string,
    devEui: string
  ): Promise<DeviceKeys | null> {
    const cs = useChirpstack(serverUrl, apiToken)
    try {
      const data = await cs.get<{ deviceKeys: DeviceKeys }>(
        `/api/devices/${devEui}/keys`
      )
      return data.deviceKeys
    } catch {
      return null
    }
  }

  /**
   * Set device keys.
   */
  async function setDeviceKeys(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    keys: { nwkKey?: string; appKey?: string }
  ): Promise<void> {
    const cs = useChirpstack(serverUrl, apiToken)
    await cs.post(`/api/devices/${devEui}/keys`, {
      deviceKeys: { devEui, ...keys },
    })
  }

  /**
   * Get device link metrics.
   */
  async function getDeviceMetrics(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    period: '24h' | '7d' | '30d'
  ): Promise<MetricData[]> {
    const cs = useChirpstack(serverUrl, apiToken)

    const now = new Date()
    const start = new Date()
    let aggregation: string

    switch (period) {
      case '24h':
        start.setHours(start.getHours() - 24)
        aggregation = 'HOUR'
        break
      case '7d':
        start.setDate(start.getDate() - 7)
        aggregation = 'HOUR'
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        aggregation = 'DAY'
        break
    }

    const data = await cs.get<LinkMetrics>(`/api/devices/${devEui}/link-metrics`, {
      start: start.toISOString(),
      end: now.toISOString(),
      aggregation,
    })

    return parseMetricDatasets(data)
  }

  /**
   * Determine device status based on lastSeenAt.
   */
  function getDeviceStatus(device: Device): DeviceStatus {
    if (!device.lastSeenAt) return 'never'

    const diff = Date.now() - new Date(device.lastSeenAt).getTime()
    const hours = diff / (1000 * 60 * 60)

    if (hours < 24) return 'active'
    if (hours < 24 * 7) return 'recent'
    if (hours < 24 * 30) return 'inactive'
    return 'offline'
  }

  /**
   * Get French label for device status.
   */
  function getStatusLabel(status: DeviceStatus): string {
    const labels: Record<DeviceStatus, string> = {
      active: 'Actif',
      recent: 'Recent',
      inactive: 'Inactif',
      offline: 'Hors ligne',
      never: 'Jamais vu',
    }
    return labels[status]
  }

  /**
   * Format a date as relative time in French.
   */
  function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Jamais'
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "a l'instant"
    if (minutes < 60) return `il y a ${minutes}min`
    if (hours < 24) return `il y a ${hours}h`
    if (days < 7) return `il y a ${days}j`
    if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`
    if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
    return `il y a ${Math.floor(days / 365)} an(s)`
  }

  /**
   * Stream device events via gRPC (through backend SSE endpoint).
   * Returns an abort function to stop the stream.
   */
  function streamDeviceEvents(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    onEvent: (event: DeviceEvent) => void,
    onError?: (error: string) => void,
    onConnected?: () => void,
  ): () => void {
    const controller = new AbortController()
    const streamUrl = `/api/proxy/device-events/${devEui}?server=${encodeURIComponent(serverUrl)}`

    const token = localStorage.getItem('cs_access_token') || ''

    fetch(streamUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Grpc-Metadata-Authorization': `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          onError?.(`Erreur ${response.status}: ${response.statusText}`)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEventType = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEventType = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
              const jsonStr = line.slice(5).trim()
              if (jsonStr) {
                try {
                  const parsed = JSON.parse(jsonStr)
                  if (currentEventType === 'error') {
                    onError?.(parsed.message || 'Erreur du flux')
                  } else if (currentEventType === 'connected') {
                    onConnected?.()
                  } else {
                    onEvent({ type: currentEventType, ...parsed })
                  }
                } catch { /* ignore parse errors */ }
              }
              currentEventType = ''
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onError?.(err.message || 'Erreur de connexion au flux')
        }
      })

    return () => controller.abort()
  }

  /**
   * Get device application metrics (decoded measurements from codec).
   * Uses /api/devices/{devEui}/metrics endpoint.
   */
  async function getDeviceAppMetrics(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    period: '24h' | '7d' | '30d' = '24h'
  ): Promise<{ metrics: Record<string, MetricData>; states: Record<string, { name: string; value: string }>; raw: unknown }> {
    const cs = useChirpstack(serverUrl, apiToken)

    const now = new Date()
    const start = new Date()
    let aggregation: string

    switch (period) {
      case '24h':
        start.setHours(start.getHours() - 24)
        aggregation = 'HOUR'
        break
      case '7d':
        start.setDate(start.getDate() - 7)
        aggregation = 'HOUR'
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        aggregation = 'DAY'
        break
    }

    const data = await cs.get<{
      metrics: Record<string, {
        name: string
        timestamps: string[]
        datasets: Array<{ label: string; data: number[] }>
        kind: string
      }>
      states: Record<string, { name: string; value: string }>
    }>(`/api/devices/${devEui}/metrics`, {
      start: start.toISOString(),
      end: now.toISOString(),
      aggregation,
    })

    // Parse metrics into MetricData format
    const metrics: Record<string, MetricData> = {}
    if (data.metrics) {
      for (const [key, m] of Object.entries(data.metrics)) {
        if (m.datasets && m.datasets.length > 0) {
          const ds = m.datasets[0]
          const values = ds.data || []
          const total = values.reduce((s, v) => s + v, 0)
          metrics[key] = {
            label: m.name || key,
            values,
            timestamps: m.timestamps || [],
            total,
            avg: values.length > 0 ? total / values.length : 0,
          }
        }
      }
    }

    return { metrics, states: data.states || {}, raw: data }
  }

  /**
   * Fetch recent buffered events for a device (non-streaming, immediate result).
   */
  async function getRecentEvents(
    serverUrl: string,
    apiToken: string,
    devEui: string,
    limit: number = 10
  ): Promise<DeviceEvent[]> {
    const token = localStorage.getItem('cs_access_token') || ''
    const url = `/api/proxy/device-events-recent/${devEui}?server=${encodeURIComponent(serverUrl)}&limit=${limit}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Grpc-Metadata-Authorization': `Bearer ${apiToken}`,
      },
    })

    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const err = await response.json()
        if (err.detail) detail = err.detail
      } catch { /* ignore */ }
      throw new Error(detail)
    }

    const data = await response.json()
    return data.events || []
  }

  /**
   * Convert base64 to hex string.
   */
  function base64ToHex(b64: string): string {
    try {
      const raw = atob(b64)
      return Array.from(raw, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ').toUpperCase()
    } catch {
      return b64
    }
  }

  return {
    loadAllDevices,
    getDevice,
    createDevice,
    updateDevice,
    deleteDevice,
    getDeviceKeys,
    setDeviceKeys,
    getDeviceMetrics,
    getDeviceStatus,
    getStatusLabel,
    formatTimeAgo,
    streamDeviceEvents,
    getRecentEvents,
    getDeviceAppMetrics,
    base64ToHex,
  }
}

/**
 * Parse ChirpStack link-metrics response into usable MetricData.
 */
function parseMetricDatasets(metrics: LinkMetrics): MetricData[] {
  if (!metrics.datasets) return []

  return metrics.datasets.map((ds) => {
    const values: number[] = []
    const timestamps: string[] = []

    if (metrics.timestamps && ds.data) {
      for (const ts of metrics.timestamps) {
        const val = ds.data[ts] ?? 0
        values.push(val)
        timestamps.push(ts)
      }
    }

    const total = values.reduce((sum, v) => sum + v, 0)
    const avg = values.length > 0 ? total / values.length : 0

    return {
      label: ds.label,
      values,
      timestamps,
      total,
      avg,
    }
  })
}
