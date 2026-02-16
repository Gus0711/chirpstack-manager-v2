import { ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useDevices } from './useDevices'
import { parseApiError } from './useApi'
import type { ImportRow, ImportMapping, ImportError, ImportProfile, BulkLogEntry } from '@/types'

export type ImportMode = 'file' | 'manual'
export type DuplicateAction = 'ignore' | 'overwrite' | null

export interface ManualDevice {
  id: number
  devEui: string
  name: string
  appKey: string
  tags: Record<string, string>
}

export interface ValidationResult {
  valid: boolean
  errors: Array<{ row: number; field: string; message: string }>
}

export interface Duplicate {
  devEui: string
  existingName: string
  csvName: string
}

export function useImport() {
  const conn = useConnectionStore()
  const { loadAllDevices, createDevice, deleteDevice, setDeviceKeys } = useDevices()

  // ── File State ──
  const csvHeaders = ref<string[]>([])
  const csvData = ref<ImportRow[]>([])
  const detectedSeparator = ref<string>(';')
  const currentFileName = ref('')

  // ── Mapping ──
  const mapping = ref<ImportMapping>({
    name: null, dev_eui: null, description: null,
    device_profile_id: null, app_key: null,
  })
  const csvTags = ref<string[]>([])
  const manualTags = ref<Record<string, string>>({})

  // ── Profile ──
  const selectedProfile = ref<ImportProfile | null>(null)
  const requiredTagValues = ref<Record<string, { type: 'fixed' | 'column'; value: string }>>({})

  // ── Manual Mode ──
  const manualDevices = ref<ManualDevice[]>([
    { id: 1, devEui: '', name: '', appKey: '', tags: {} },
  ])
  let nextId = 2

  // ── Import State ──
  const mode = ref<ImportMode>('file')
  const isImporting = ref(false)
  const logs = ref<BulkLogEntry[]>([])
  const importErrors = ref<ImportError[]>([])
  const lastImportedDevEuis = ref<string[]>([])
  const progress = ref(0)
  const progressText = ref('')

  // Stats
  const statTotal = ref(0)
  const statSuccess = ref(0)
  const statError = ref(0)
  const statSkipped = ref(0)

  // Duplicates
  const duplicatesFound = ref<Duplicate[]>([])
  const showDuplicatePanel = ref(false)
  const duplicateAction = ref<DuplicateAction>(null)

  // DP fix
  const failedRows = ref<ImportRow[]>([])
  const hasDeviceProfileError = ref(false)
  const showDpFix = ref(false)

  // ── CSV Parsing ──

  function detectSep(content: string): string {
    const lines = content.split('\n').slice(0, 5).filter(l => l.trim())
    if (lines.length === 0) return ';'

    const separators = [';', ',', '\t']
    const scores: Record<string, number> = {}

    for (const sep of separators) {
      scores[sep] = 0
      const counts = lines.map(line => {
        let count = 0
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') inQuotes = !inQuotes
          else if (line[i] === sep && !inQuotes) count++
        }
        return count
      })

      const unique = [...new Set(counts)]
      if (unique.length === 1 && counts[0] > 0) {
        scores[sep] = counts[0] * 10
      } else if (counts.every(c => c > 0)) {
        scores[sep] = Math.min(...counts)
      }
    }

    let best = ';'
    let bestScore = 0
    for (const [sep, score] of Object.entries(scores)) {
      if (score > bestScore) { best = sep; bestScore = score }
    }
    return best
  }

  function parseCSVLine(line: string, sep: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === sep && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  function parseCSV(content: string): void {
    const sep = detectSep(content)
    detectedSeparator.value = sep
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) return

    csvHeaders.value = parseCSVLine(lines[0], sep)
    csvData.value = lines.slice(1).map(line => {
      const values = parseCSVLine(line, sep)
      const row: ImportRow = {}
      csvHeaders.value.forEach((h, i) => { row[h] = (values[i] || '').trim() })
      return row
    }).filter(r => Object.values(r).some(v => v))
  }

  function parseExcel(buffer: ArrayBuffer): void {
    // Dynamic import handled at component level
    const XLSX = (window as unknown as Record<string, unknown>).XLSX as {
      read: (data: ArrayBuffer, opts: { type: string }) => { Sheets: Record<string, unknown>; SheetNames: string[] }
      utils: { sheet_to_json: (sheet: unknown, opts: { header: number; defval: string }) => string[][] }
    }

    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (json.length < 2) return

    csvHeaders.value = (json[0] as string[]).map(h => String(h).trim())
    csvData.value = (json.slice(1) as string[][]).map(row => {
      const obj: ImportRow = {}
      csvHeaders.value.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : '' })
      return obj
    }).filter(r => Object.values(r).some(v => v))
  }

  function handleFile(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    currentFileName.value = file.name

    if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = (e) => {
        parseCSV(e.target?.result as string)
        autoDetectMapping()
      }
      reader.readAsText(file)
    } else if (['xls', 'xlsx'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = (e) => {
        parseExcel(e.target?.result as ArrayBuffer)
        autoDetectMapping()
      }
      reader.readAsArrayBuffer(file)
    }
  }

  // ── Auto-detect Mapping ──

  function autoDetectMapping(): void {
    const normalize = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '')
    const m: ImportMapping = { name: null, dev_eui: null, description: null, device_profile_id: null, app_key: null }

    for (const h of csvHeaders.value) {
      const n = normalize(h)
      if (n === 'deveui' || n === 'dev_eui') m.dev_eui = h
      else if (n === 'name' || n === 'nom') m.name = h
      else if (n === 'description') m.description = h
      else if (n === 'deviceprofileid' || n === 'device_profile_id') m.device_profile_id = h
      else if (n === 'appkey' || n === 'app_key' || n === 'nwkkey' || n === 'nwk_key') m.app_key = h
    }

    mapping.value = m
  }

  // ── Validation ──

  function validateImportData(): ValidationResult {
    if (!mapping.value.dev_eui) {
      return { valid: false, errors: [{ row: -1, field: 'dev_eui', message: 'Mapping dev_eui obligatoire' }] }
    }

    const errors: ValidationResult['errors'] = []
    const seen = new Set<string>()

    csvData.value.forEach((row, i) => {
      const devEui = (row[mapping.value.dev_eui!] || '').trim()

      if (!devEui || !/^[0-9a-fA-F]{16}$/.test(devEui)) {
        errors.push({ row: i, field: 'dev_eui', message: 'DevEUI invalide (16 hex attendus)' })
      }

      if (devEui && seen.has(devEui.toLowerCase())) {
        errors.push({ row: i, field: 'dev_eui', message: 'DevEUI en doublon dans le fichier' })
      }
      if (devEui) seen.add(devEui.toLowerCase())

      if (mapping.value.app_key) {
        const appKey = (row[mapping.value.app_key] || '').trim()
        if (appKey && !/^[0-9a-fA-F]{32}$/.test(appKey)) {
          errors.push({ row: i, field: 'app_key', message: 'AppKey invalide (32 hex attendus)' })
        }
      }
    })

    return { valid: errors.length === 0, errors }
  }

  // ── Tags ──

  function getRequiredTagsForRow(row: ImportRow): Record<string, string> {
    const tags: Record<string, string> = {}
    if (!selectedProfile.value) return tags

    for (const tag of selectedProfile.value.required_tags) {
      const config = requiredTagValues.value[tag]
      if (!config) continue
      if (config.type === 'fixed') {
        tags[tag] = config.value
      } else if (config.type === 'column' && config.value) {
        tags[tag] = row[config.value] || ''
      }
    }
    return tags
  }

  function buildTags(row: ImportRow): Record<string, string> {
    const profileTags = getRequiredTagsForRow(row)
    const tags = { ...profileTags, ...manualTags.value }
    csvTags.value.forEach(tagCol => {
      if (row[tagCol]) tags[tagCol] = row[tagCol]
    })
    return tags
  }

  // ── Duplicate Detection ──

  async function checkDuplicates(): Promise<boolean> {
    if (!mapping.value.dev_eui || !conn.currentServer) return false

    addLog('info', 'Verification des doublons...')

    let allExisting: Array<{ devEui: string; name: string }>
    try {
      allExisting = await loadAllDevices(
        conn.currentServer.url, conn.currentServer.api_token,
        conn.selectedApplicationId
      )
    } catch {
      addLog('warning', 'Impossible de verifier les doublons')
      return false
    }

    const existingMap = new Map(allExisting.map(d => [d.devEui.toLowerCase(), d.name]))
    const dupes: Duplicate[] = []

    csvData.value.forEach(row => {
      const devEui = (row[mapping.value.dev_eui!] || '').toLowerCase()
      if (existingMap.has(devEui)) {
        dupes.push({
          devEui,
          existingName: existingMap.get(devEui) || '?',
          csvName: row[mapping.value.name || ''] || devEui,
        })
      }
    })

    duplicatesFound.value = dupes
    return dupes.length > 0
  }

  // ── Import Execution ──

  function addLog(status: BulkLogEntry['status'], message: string) {
    logs.value.push({ status, message })
  }

  function getDeviceProfileId(row?: ImportRow): string {
    // 1. From step 2 selection
    const dpSelect = conn.deviceProfiles.find(dp => dp.id === selectedDpId.value)
    if (dpSelect) return dpSelect.id
    // 2. From CSV column
    if (row && mapping.value.device_profile_id) {
      return row[mapping.value.device_profile_id] || ''
    }
    return ''
  }

  const selectedDpId = ref('')

  async function executeImport(action: DuplicateAction = null): Promise<void> {
    if (!conn.currentServer) return

    const srv = conn.currentServer
    isImporting.value = true
    showDuplicatePanel.value = false
    duplicateAction.value = action
    importErrors.value = []
    failedRows.value = []
    hasDeviceProfileError.value = false
    showDpFix.value = false

    if (action === null) {
      // Check device profile is available
      if (!selectedDpId.value && !mapping.value.device_profile_id) {
        addLog('error', 'Aucun Device Profile selectionne. Choisissez un Device Profile dans la liste ou mappez une colonne "device_profile_id" depuis le fichier.')
        isImporting.value = false
        return
      }

      // Fresh import - validate first
      const validation = validateImportData()
      if (!validation.valid) {
        importErrors.value = validation.errors.map(e => ({
          row: e.row >= 0 ? e.row + 2 : -1,
          devEui: e.row >= 0 && mapping.value.dev_eui ? csvData.value[e.row][mapping.value.dev_eui] || '' : '',
          name: '',
          error: `${e.field}: ${e.message}`,
          type: 'validation',
        }))
        statTotal.value = csvData.value.length
        statError.value = validation.errors.length
        addLog('error', `${validation.errors.length} erreur(s) de format. Corrigez votre fichier.`)
        isImporting.value = false
        return
      }

      // Check duplicates
      lastImportedDevEuis.value = []
      logs.value = []
      const hasDupes = await checkDuplicates()
      if (hasDupes) {
        showDuplicatePanel.value = true
        isImporting.value = false
        return
      }
    }

    // Reset for import run
    if (action !== null) {
      lastImportedDevEuis.value = []
      logs.value = []
    }

    const duplicateEuis = new Set(duplicatesFound.value.map(d => d.devEui))
    let success = 0
    let errors = 0
    let skipped = 0
    const total = csvData.value.length

    statTotal.value = total
    statSuccess.value = 0
    statError.value = 0
    statSkipped.value = 0

    for (let i = 0; i < csvData.value.length; i++) {
      const row = csvData.value[i]
      const devEui = (row[mapping.value.dev_eui!] || '').trim()
      const deviceName = (mapping.value.name ? row[mapping.value.name] : '') || devEui
      const isDupe = duplicateEuis.has(devEui.toLowerCase())
      const csvLineNum = i + 2

      // Handle duplicates
      if (isDupe && action === 'ignore') {
        addLog('warning', `Ligne ${csvLineNum} - ${deviceName} (${devEui}): ignore (doublon)`)
        skipped++
        statSkipped.value = skipped
        continue
      }

      if (isDupe && action === 'overwrite') {
        try {
          await deleteDevice(srv.url, srv.api_token, devEui)
          addLog('info', `  Ligne ${csvLineNum} - ${deviceName}: ancien device supprime`)
        } catch (err) {
          addLog('error', `Ligne ${csvLineNum} - ${deviceName}: echec suppression: ${parseApiError(err)}`)
          errors++
          statError.value = errors
          importErrors.value.push({ row: csvLineNum, devEui, name: deviceName, error: `Suppression: ${parseApiError(err)}`, type: 'device' })
          continue
        }
      }

      // Build tags
      const tags = buildTags(row)
      const dpId = getDeviceProfileId(row)

      if (!dpId) {
        const msg = 'Device Profile manquant. Selectionnez un Device Profile ou verifiez la colonne mappee.'
        addLog('error', `Ligne ${csvLineNum} - ${deviceName}: ${msg}`)
        errors++
        statError.value = errors
        importErrors.value.push({ row: csvLineNum, devEui, name: deviceName, error: msg, type: 'device' })
        continue
      }

      try {
        await createDevice(srv.url, srv.api_token, {
          applicationId: conn.selectedApplicationId,
          name: deviceName,
          description: mapping.value.description ? row[mapping.value.description] || '' : '',
          devEui,
          deviceProfileId: dpId,
          tags,
        })
        addLog('success', `Ligne ${csvLineNum} - Device ${deviceName} cree`)
        lastImportedDevEuis.value.push(devEui)

        // Keys
        if (mapping.value.app_key && row[mapping.value.app_key]) {
          try {
            await setDeviceKeys(srv.url, srv.api_token, devEui, {
              nwkKey: row[mapping.value.app_key],
            })
            addLog('info', `  Cles ajoutees`)
          } catch (err) {
            addLog('error', `  Ligne ${csvLineNum} - Cles non ajoutees: ${parseApiError(err)}`)
            importErrors.value.push({ row: csvLineNum, devEui, name: deviceName, error: `Cle: ${parseApiError(err)}`, type: 'key' })
          }
        }
        success++
      } catch (err) {
        const msg = parseApiError(err)
        addLog('error', `Ligne ${csvLineNum} - ${deviceName}: ${msg}`)
        errors++
        importErrors.value.push({ row: csvLineNum, devEui, name: deviceName, error: msg, type: 'device' })

        if (String(err).includes('invalid length') && String(err).includes('found 0')) {
          hasDeviceProfileError.value = true
          failedRows.value.push(row)
        }
      }

      statSuccess.value = success
      statError.value = errors
      progress.value = Math.round(((i + 1) / total) * 100)
      progressText.value = `${i + 1}/${total}`

      await new Promise(r => setTimeout(r, 50))
    }

    if (hasDeviceProfileError.value && failedRows.value.length > 0) {
      showDpFix.value = true
    }

    const summary = skipped > 0
      ? `${success} crees, ${skipped} ignores, ${errors} erreurs`
      : `${success}/${total} devices crees`
    addLog(success + skipped === total ? 'success' : 'warning', `Import termine: ${summary}`)
    isImporting.value = false
  }

  // ── Retry with fixed DP ──

  async function retryWithDeviceProfile(dpId: string): Promise<void> {
    if (!conn.currentServer || failedRows.value.length === 0) return

    const srv = conn.currentServer
    isImporting.value = true
    addLog('info', `Relance avec Device Profile: ${conn.deviceProfiles.find(dp => dp.id === dpId)?.name}`)

    let success = 0
    let errors = 0

    for (let i = 0; i < failedRows.value.length; i++) {
      const row = failedRows.value[i]
      const devEui = (row[mapping.value.dev_eui!] || '').trim()
      const deviceName = (mapping.value.name ? row[mapping.value.name] : '') || devEui
      const tags = buildTags(row)

      try {
        await createDevice(srv.url, srv.api_token, {
          applicationId: conn.selectedApplicationId,
          name: deviceName,
          description: mapping.value.description ? row[mapping.value.description] || '' : '',
          devEui,
          deviceProfileId: dpId,
          tags,
        })
        addLog('success', `Device ${deviceName} cree (relance)`)
        lastImportedDevEuis.value.push(devEui)

        if (mapping.value.app_key && row[mapping.value.app_key]) {
          try {
            await setDeviceKeys(srv.url, srv.api_token, devEui, { nwkKey: row[mapping.value.app_key] })
          } catch { /* ignore */ }
        }
        success++
      } catch (err) {
        addLog('error', `${deviceName}: ${parseApiError(err)}`)
        errors++
      }

      await new Promise(r => setTimeout(r, 50))
    }

    addLog(errors === 0 ? 'success' : 'warning', `Relance terminee: ${success} crees, ${errors} erreurs`)
    showDpFix.value = false
    failedRows.value = []
    isImporting.value = false
  }

  // ── Manual Import ──

  function addManualDevice(): void {
    if (manualDevices.value.length >= 5) return
    manualDevices.value.push({ id: nextId++, devEui: '', name: '', appKey: '', tags: {} })
  }

  function removeManualDevice(id: number): void {
    if (manualDevices.value.length <= 1) return
    manualDevices.value = manualDevices.value.filter(d => d.id !== id)
  }

  function validateManualDevices(): boolean {
    return manualDevices.value.every(d => /^[0-9a-fA-F]{16}$/.test(d.devEui))
  }

  async function importManualDevices(): Promise<void> {
    if (!validateManualDevices() || !conn.currentServer) return
    if (!selectedDpId.value) return

    const srv = conn.currentServer
    isImporting.value = true
    lastImportedDevEuis.value = []
    importErrors.value = []
    logs.value = []

    let success = 0
    let errors = 0
    const devices = manualDevices.value
    statTotal.value = devices.length

    addLog('info', `Import manuel de ${devices.length} device(s)...`)

    for (const device of devices) {
      const tags: Record<string, string> = { ...device.tags }

      try {
        await createDevice(srv.url, srv.api_token, {
          applicationId: conn.selectedApplicationId,
          name: device.name || device.devEui,
          description: '',
          devEui: device.devEui,
          deviceProfileId: selectedDpId.value,
          tags,
        })

        if (device.appKey) {
          try {
            await setDeviceKeys(srv.url, srv.api_token, device.devEui, {
              nwkKey: device.appKey,
              appKey: device.appKey,
            })
          } catch (err) {
            addLog('error', `  ${device.name || device.devEui}: Cles non ajoutees: ${parseApiError(err)}`)
          }
        }

        addLog('success', `${device.name || device.devEui} (${device.devEui})`)
        lastImportedDevEuis.value.push(device.devEui)
        success++
      } catch (err) {
        addLog('error', `${device.name || device.devEui}: ${parseApiError(err)}`)
        errors++
        importErrors.value.push({
          row: devices.indexOf(device) + 1,
          devEui: device.devEui,
          name: device.name,
          error: parseApiError(err),
          type: 'device',
        })
      }
    }

    statSuccess.value = success
    statError.value = errors
    addLog(errors === 0 ? 'success' : 'warning', `Termine: ${success} succes, ${errors} erreur(s)`)

    if (errors === 0 && success > 0) {
      manualDevices.value = [{ id: nextId++, devEui: '', name: '', appKey: '', tags: {} }]
    }

    isImporting.value = false
  }

  // ── Undo ──

  async function undoLastImport(): Promise<void> {
    if (lastImportedDevEuis.value.length === 0 || !conn.currentServer) return

    const srv = conn.currentServer
    isImporting.value = true
    addLog('info', 'Annulation du dernier import...')

    let deleted = 0
    let errCount = 0

    for (const devEui of lastImportedDevEuis.value) {
      try {
        await deleteDevice(srv.url, srv.api_token, devEui)
        addLog('success', `${devEui} supprime`)
        deleted++
      } catch (err) {
        addLog('error', `${devEui}: ${parseApiError(err)}`)
        errCount++
      }
      await new Promise(r => setTimeout(r, 50))
    }

    addLog(deleted > 0 ? 'success' : 'error', `Annulation: ${deleted} supprime(s), ${errCount} erreur(s)`)
    lastImportedDevEuis.value = []
    isImporting.value = false
  }

  // ── Export Errors ──

  function exportImportErrors(): void {
    if (importErrors.value.length === 0) return
    const headers = ['Ligne', 'DevEUI', 'Nom', 'Erreur', 'Type']
    const rows = importErrors.value.map(e => [e.row, e.devEui, e.name, e.error, e.type])
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [headers.join(';'), ...rows.map(r => r.map(escape).join(';'))].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Reset ──

  function reset(): void {
    csvHeaders.value = []
    csvData.value = []
    mapping.value = { name: null, dev_eui: null, description: null, device_profile_id: null, app_key: null }
    csvTags.value = []
    manualTags.value = {}
    currentFileName.value = ''
    logs.value = []
    importErrors.value = []
    lastImportedDevEuis.value = []
    duplicatesFound.value = []
    showDuplicatePanel.value = false
    duplicateAction.value = null
    failedRows.value = []
    hasDeviceProfileError.value = false
    showDpFix.value = false
    statTotal.value = 0
    statSuccess.value = 0
    statError.value = 0
    statSkipped.value = 0
    progress.value = 0
    progressText.value = ''
  }

  // ── Preview ──

  const previewData = computed(() => csvData.value.slice(0, 5))

  const hasFile = computed(() => csvData.value.length > 0)

  const canImport = computed(() => {
    if (mode.value === 'file') return hasFile.value && !!mapping.value.dev_eui
    return validateManualDevices() && !!selectedDpId.value
  })

  return {
    // State
    csvHeaders, csvData, detectedSeparator, currentFileName,
    mapping, csvTags, manualTags,
    selectedProfile, requiredTagValues, selectedDpId,
    manualDevices,
    mode, isImporting, logs, importErrors,
    lastImportedDevEuis,
    progress, progressText,
    statTotal, statSuccess, statError, statSkipped,
    duplicatesFound, showDuplicatePanel, duplicateAction,
    failedRows, hasDeviceProfileError, showDpFix,

    // Computed
    previewData, hasFile, canImport,

    // Actions
    handleFile, autoDetectMapping,
    validateImportData,
    executeImport, retryWithDeviceProfile,
    addManualDevice, removeManualDevice, validateManualDevices, importManualDevices,
    undoLastImport,
    exportImportErrors,
    reset,
  }
}
