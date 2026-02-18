/**
 * Chart color utility — returns border + background RGBA for Chart.js datasets.
 * Uses keyword matching (same logic as getMeasureColor in DashboardView)
 * with a fallback palette for unknown metrics.
 */

const KEYWORD_COLORS: [RegExp, string][] = [
  [/temp/i, '249, 115, 22'],   // orange
  [/humid|rh/i, '59, 130, 246'],  // blue
  [/batt|voltage/i, '234, 179, 8'],  // yellow
  [/co2/i, '139, 92, 246'],     // violet
  [/lux|light|luminosity/i, '245, 158, 11'],  // amber
  [/press/i, '16, 185, 129'],   // emerald
  [/rssi/i, '6, 182, 212'],     // cyan
  [/snr/i, '168, 85, 247'],     // purple
]

const FALLBACK_PALETTE = [
  '6, 182, 212',     // cyan
  '16, 185, 129',    // emerald
  '139, 92, 246',    // violet
  '236, 72, 153',    // pink
  '245, 158, 11',    // amber
  '59, 130, 246',    // blue
  '249, 115, 22',    // orange
  '234, 179, 8',     // yellow
]

export function getChartColor(key: string, index: number): { borderColor: string; backgroundColor: string } {
  let rgb: string | undefined

  for (const [re, color] of KEYWORD_COLORS) {
    if (re.test(key)) {
      rgb = color
      break
    }
  }

  if (!rgb) {
    rgb = FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
  }

  return {
    borderColor: `rgba(${rgb}, 0.9)`,
    backgroundColor: `rgba(${rgb}, 0.15)`,
  }
}
