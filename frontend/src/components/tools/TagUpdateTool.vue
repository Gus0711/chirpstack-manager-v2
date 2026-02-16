<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useDevices } from '@/composables/useDevices'
import { parseApiError } from '@/composables/useApi'
import ProgressBar from '@/components/common/ProgressBar.vue'
import LogViewer from '@/components/common/LogViewer.vue'
import type { BulkLogEntry, ImportRow } from '@/types'

const conn = useConnectionStore()
const { getDevice, updateDevice } = useDevices()

const headers = ref<string[]>([])
const data = ref<ImportRow[]>([])
const fileName = ref('')
const mode = ref<'merge' | 'replace'>('merge')

const logs = ref<BulkLogEntry[]>([])
const isExecuting = ref(false)
const progress = ref(0)
const progressText = ref('')
const results = ref<{ success: number; errors: number } | null>(null)

const devEuiCol = computed(() =>
  headers.value.find(h => {
    const n = h.toLowerCase().replace(/[_\s-]/g, '')
    return n === 'deveui' || h.toLowerCase() === 'dev_eui'
  }) || null
)

const tagColumns = computed(() =>
  headers.value.filter(h => h !== devEuiCol.value)
)

function detectSeparator(content: string): string {
  const lines = content.split('\n').slice(0, 5).filter(l => l.trim())
  if (lines.length === 0) return ';'
  const seps = [';', ',', '\t']
  let best = ';'
  let bestScore = 0
  for (const sep of seps) {
    const counts = lines.map(line => {
      let count = 0; let inQ = false
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQ = !inQ
        else if (line[i] === sep && !inQ) count++
      }
      return count
    })
    const unique = [...new Set(counts)]
    const score = unique.length === 1 && counts[0] > 0 ? counts[0] * 10 : counts.every(c => c > 0) ? Math.min(...counts) : 0
    if (score > bestScore) { best = sep; bestScore = score }
  }
  return best
}

function parseLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQ = !inQ
    else if (line[i] === sep && !inQ) { result.push(current.trim()); current = '' }
    else current += line[i]
  }
  result.push(current.trim())
  return result
}

function handleFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  fileName.value = file.name

  if (ext === 'csv') {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const sep = detectSeparator(content)
      const lines = content.split('\n').filter(l => l.trim())
      if (lines.length < 2) return
      headers.value = parseLine(lines[0], sep)
      data.value = lines.slice(1).map(line => {
        const vals = parseLine(line, sep)
        const row: ImportRow = {}
        headers.value.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
        return row
      }).filter(r => Object.values(r).some(v => v))
    }
    reader.readAsText(file)
  } else if (['xls', 'xlsx'].includes(ext)) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const XLSX = (window as unknown as Record<string, unknown>).XLSX as {
        read: (d: ArrayBuffer, o: { type: string }) => { Sheets: Record<string, unknown>; SheetNames: string[] }
        utils: { sheet_to_json: (s: unknown, o: { header: number; defval: string }) => string[][] }
      }
      const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (json.length < 2) return
      headers.value = (json[0] as string[]).map(h => String(h).trim())
      data.value = (json.slice(1) as string[][]).map(row => {
        const obj: ImportRow = {}
        headers.value.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : '' })
        return obj
      }).filter(r => Object.values(r).some(v => v))
    }
    reader.readAsArrayBuffer(file)
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) handleFile(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

async function startTagUpdate() {
  if (!devEuiCol.value || !conn.currentServer) return

  const srv = conn.currentServer
  isExecuting.value = true
  logs.value = []
  results.value = null
  let success = 0; let errors = 0

  for (let i = 0; i < data.value.length; i++) {
    const row = data.value[i]
    const devEui = row[devEuiCol.value!]
    if (!devEui) { errors++; continue }

    try {
      const deviceData = await getDevice(srv.url, srv.api_token, devEui)
      const device = deviceData.device

      const csvTags: Record<string, string> = {}
      tagColumns.value.forEach(col => {
        if (row[col] !== undefined && row[col] !== '') csvTags[col] = row[col]
      })

      const updatedDevice = { ...device } as Record<string, unknown>
      if (mode.value === 'merge') {
        updatedDevice.tags = { ...(device.tags || {}), ...csvTags }
      } else {
        updatedDevice.tags = csvTags
      }

      await updateDevice(srv.url, srv.api_token, devEui, updatedDevice)
      logs.value.push({ status: 'success', message: `${device.name || devEui}: tags mis a jour` })
      success++
    } catch (err) {
      logs.value.push({ status: 'error', message: `${devEui}: ${parseApiError(err)}` })
      errors++
    }

    progress.value = Math.round(((i + 1) / data.value.length) * 100)
    progressText.value = `${i + 1}/${data.value.length}`
    await new Promise(r => setTimeout(r, 50))
  }

  results.value = { success, errors }
  isExecuting.value = false
}
</script>

<template>
  <div class="space-y-4">
    <!-- Mode -->
    <div class="card">
      <h3 class="text-sm font-semibold text-zinc-300 mb-3">Mode de mise a jour</h3>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="mode" type="radio" value="merge" class="text-cyan-500 focus:ring-cyan-500/40" />
          <span class="text-sm text-zinc-200">Fusion (ajouter/modifier)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="mode" type="radio" value="replace" class="text-cyan-500 focus:ring-cyan-500/40" />
          <span class="text-sm text-zinc-200">Remplacement (supprimer les anciens)</span>
        </label>
      </div>
    </div>

    <!-- Drop zone -->
    <div
      class="card border-dashed border-2 border-zinc-700 hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all cursor-pointer text-center py-8"
      @drop.prevent="onDrop"
      @dragover.prevent
      @click="($refs.fileInput as HTMLInputElement)?.click()"
    >
      <input ref="fileInput" type="file" accept=".csv,.xls,.xlsx" class="hidden" @change="onFileSelect" />
      <p v-if="!fileName" class="text-zinc-500">
        Fichier CSV/XLSX avec colonne <span class="font-mono text-cyan-400">dev_eui</span> + colonnes tags
      </p>
      <p v-else class="text-zinc-200 font-medium">{{ fileName }} - {{ data.length }} lignes</p>
    </div>

    <!-- Preview -->
    <div v-if="data.length > 0" class="card">
      <div class="mb-3">
        <p v-if="devEuiCol" class="text-sm text-zinc-400">
          Colonne DevEUI: <span class="font-mono text-cyan-400">{{ devEuiCol }}</span>
          | Tags: <span class="text-zinc-200">{{ tagColumns.join(', ') }}</span>
        </p>
        <p v-else class="text-sm text-red-400">Colonne dev_eui introuvable</p>
      </div>

      <div class="overflow-x-auto max-h-40">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-white/[0.06]">
              <th v-for="h in headers" :key="h" class="px-2 py-1 text-left text-zinc-500">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in data.slice(0, 5)" :key="i" class="border-b border-white/[0.03]">
              <td v-for="h in headers" :key="h" class="px-2 py-1 text-zinc-300">{{ row[h] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        class="btn-primary mt-4"
        :disabled="!devEuiCol || isExecuting"
        @click="startTagUpdate"
      >
        {{ isExecuting ? 'Mise a jour...' : `Mettre a jour ${data.length} device(s)` }}
      </button>
    </div>

    <!-- Results -->
    <template v-if="logs.length > 0 || isExecuting">
      <ProgressBar v-if="isExecuting" :progress="progress" :text="progressText" />
      <div v-if="results" class="flex gap-4 text-sm">
        <span class="text-emerald-400">Succes: <strong>{{ results.success }}</strong></span>
        <span v-if="results.errors > 0" class="text-red-400">Erreurs: <strong>{{ results.errors }}</strong></span>
      </div>
      <LogViewer :logs="logs" />
    </template>
  </div>
</template>
