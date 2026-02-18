import type { MetricData } from '@/types'

export interface MetricGroup {
  /** Display name for the group (e.g. "Temperature") */
  label: string
  /** Unit suffix (e.g. "°C") — can be empty */
  unit: string
  /** Metric keys + data in this group */
  series: { key: string; data: MetricData }[]
}

/**
 * Prefixes that are stripped to find the "base keyword" of a metric.
 * E.g. "sensorTemperature" → "temperature", "targetTemperature" → "temperature"
 */
const STRIP_PREFIXES = [
  'sensor', 'target', 'min', 'max', 'set', 'avg', 'current', 'desired', 'mean',
]

/**
 * Known unit mappings by base keyword.
 */
const UNIT_MAP: [RegExp, string][] = [
  [/temp/i, '°C'],
  [/humid|rh/i, '%'],
  [/batt/i, '%'],
  [/voltage/i, 'V'],
  [/co2/i, 'ppm'],
  [/lux|light|luminosity/i, 'lx'],
  [/press/i, 'hPa'],
  [/rssi/i, 'dBm'],
  [/snr/i, 'dB'],
]

function getBaseKeyword(key: string): string {
  let base = key
  for (const prefix of STRIP_PREFIXES) {
    if (base.toLowerCase().startsWith(prefix) && base.length > prefix.length) {
      base = base.slice(prefix.length)
      // Remove leading underscore or capitalize boundary
      base = base.replace(/^[_-]/, '')
      break
    }
  }
  return base.toLowerCase()
}

function guessUnit(baseKey: string): string {
  for (const [re, unit] of UNIT_MAP) {
    if (re.test(baseKey)) return unit
  }
  return ''
}

/**
 * Group metrics that share the same base keyword into a single chart group.
 * Metrics without any companion stay as solo groups.
 */
export function groupMetrics(metrics: Record<string, MetricData>): MetricGroup[] {
  const buckets = new Map<string, { key: string; data: MetricData }[]>()

  for (const [key, data] of Object.entries(metrics)) {
    const base = getBaseKeyword(key)
    if (!buckets.has(base)) {
      buckets.set(base, [])
    }
    buckets.get(base)!.push({ key, data })
  }

  const groups: MetricGroup[] = []
  for (const [base, series] of buckets) {
    // Use the first metric's label as group label, or capitalize the base keyword
    const label = series.length === 1
      ? series[0].data.label
      : base.charAt(0).toUpperCase() + base.slice(1)
    groups.push({
      label,
      unit: guessUnit(base),
      series,
    })
  }

  return groups
}
