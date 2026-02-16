<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useImport } from '@/composables/useImport'
import { useConnectionStore } from '@/stores/connection'
import { api } from '@/composables/useApi'
import ProgressBar from '@/components/common/ProgressBar.vue'
import LogViewer from '@/components/common/LogViewer.vue'
import type { ImportProfile } from '@/types'

const conn = useConnectionStore()
const imp = useImport()

// Profiles
const profiles = ref<ImportProfile[]>([])
const selectedProfileId = ref<string>('')

onMounted(async () => {
  try {
    const { data } = await api.get<ImportProfile[]>('/api/profiles')
    profiles.value = data
  } catch { /* ignore */ }
})

watch(selectedProfileId, (id) => {
  if (id === '' || id === '__none__') {
    imp.selectedProfile.value = null
    imp.requiredTagValues.value = {}
  } else {
    const prof = profiles.value.find(p => p.id === id)
    if (prof) {
      imp.selectedProfile.value = prof
      const vals: Record<string, { type: 'fixed' | 'column'; value: string }> = {}
      prof.required_tags.forEach(t => { vals[t] = { type: 'fixed', value: '' } })
      imp.requiredTagValues.value = vals
    }
  }
})

// File drop
function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) imp.handleFile(file)
}
function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) imp.handleFile(file)
}

// Manual tags
const newTagKey = ref('')
const newTagValue = ref('')
function addManualTag() {
  if (newTagKey.value.trim()) {
    imp.manualTags.value[newTagKey.value.trim()] = newTagValue.value.trim()
    newTagKey.value = ''
    newTagValue.value = ''
  }
}
function removeManualTag(key: string) {
  delete imp.manualTags.value[key]
  imp.manualTags.value = { ...imp.manualTags.value }
}

// CSV tag toggle
function toggleCsvTag(col: string) {
  const idx = imp.csvTags.value.indexOf(col)
  if (idx >= 0) imp.csvTags.value.splice(idx, 1)
  else imp.csvTags.value.push(col)
}

// Mapping columns = headers minus mapped fields
function getMappableColumns(): string[] {
  return imp.csvHeaders.value
}

// Start import
function startImport() {
  if (imp.mode.value === 'manual') {
    imp.importManualDevices()
  } else {
    imp.executeImport(null)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Config Card -->
    <div class="card">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="label">Application</label>
          <p class="text-zinc-200 font-medium text-sm">{{ conn.selectedApplicationName }}</p>
        </div>
        <div>
          <label class="label">Profil d'import</label>
          <select v-model="selectedProfileId" class="input">
            <option value="">-- Selectionner --</option>
            <option value="__none__">Sans profil</option>
            <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Device Profile</label>
          <select v-model="imp.selectedDpId.value" class="input">
            <option value="">-- Depuis le fichier --</option>
            <option v-for="dp in conn.deviceProfiles" :key="dp.id" :value="dp.id">{{ dp.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Mode Toggle -->
    <div class="flex gap-2">
      <button
        class="btn-sm"
        :class="imp.mode.value === 'file' ? 'btn-primary' : 'btn-secondary'"
        @click="imp.mode.value = 'file'"
      >Import fichier</button>
      <button
        class="btn-sm"
        :class="imp.mode.value === 'manual' ? 'btn-primary' : 'btn-secondary'"
        @click="imp.mode.value = 'manual'"
      >Saisie manuelle</button>
    </div>

    <!-- FILE MODE -->
    <template v-if="imp.mode.value === 'file'">
      <!-- Drop Zone -->
      <div
        class="card border-dashed border-2 border-zinc-700 hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all cursor-pointer text-center py-10"
        @drop.prevent="onDrop"
        @dragover.prevent
        @click="($refs.fileInput as HTMLInputElement)?.click()"
      >
        <input ref="fileInput" type="file" accept=".csv,.xls,.xlsx" class="hidden" @change="onFileSelect" />
        <svg class="w-10 h-10 mx-auto text-zinc-600 mb-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <p v-if="!imp.currentFileName.value" class="text-zinc-500">
          Glissez un fichier CSV / XLSX ou <span class="text-cyan-400">cliquez pour parcourir</span>
        </p>
        <p v-else class="text-zinc-200 font-medium">
          {{ imp.currentFileName.value }} - {{ imp.csvData.value.length }} lignes
        </p>
      </div>

      <!-- Mapping Section (after file loaded) -->
      <template v-if="imp.hasFile.value">
        <div class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Mapping des colonnes</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div v-for="field in ['dev_eui', 'name', 'description', 'device_profile_id', 'app_key']" :key="field">
              <label class="label">{{ field }}{{ field === 'dev_eui' ? ' *' : '' }}</label>
              <select
                class="input text-sm"
                :value="(imp.mapping.value as Record<string, string | null>)[field]"
                @change="(imp.mapping.value as Record<string, string | null>)[field] = ($event.target as HTMLSelectElement).value || null"
              >
                <option value="">-- Non mappe --</option>
                <option v-for="h in getMappableColumns()" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Required Tags (from profile) -->
        <div v-if="imp.selectedProfile.value?.required_tags.length" class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Tags obligatoires (profil: {{ imp.selectedProfile.value.name }})</h3>
          <div class="space-y-3">
            <div v-for="tag in imp.selectedProfile.value.required_tags" :key="tag" class="flex items-end gap-3">
              <span class="text-sm text-zinc-300 w-32 shrink-0">{{ tag }}</span>
              <select
                class="input max-w-[140px]"
                :value="imp.requiredTagValues.value[tag]?.type || 'fixed'"
                @change="imp.requiredTagValues.value[tag] = { type: ($event.target as HTMLSelectElement).value as 'fixed' | 'column', value: '' }"
              >
                <option value="fixed">Valeur fixe</option>
                <option value="column">Colonne CSV</option>
              </select>
              <input
                v-if="imp.requiredTagValues.value[tag]?.type === 'fixed'"
                class="input flex-1"
                :value="imp.requiredTagValues.value[tag]?.value"
                placeholder="Valeur"
                @input="imp.requiredTagValues.value[tag].value = ($event.target as HTMLInputElement).value"
              />
              <select
                v-else
                class="input flex-1"
                :value="imp.requiredTagValues.value[tag]?.value"
                @change="imp.requiredTagValues.value[tag].value = ($event.target as HTMLSelectElement).value"
              >
                <option value="">-- Colonne --</option>
                <option v-for="h in imp.csvHeaders.value" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- CSV Tags (columns to import as tags) -->
        <div class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Colonnes a importer comme tags</h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="col in imp.csvHeaders.value.filter(h =>
                h !== imp.mapping.value.dev_eui &&
                h !== imp.mapping.value.name &&
                h !== imp.mapping.value.description &&
                h !== imp.mapping.value.device_profile_id &&
                h !== imp.mapping.value.app_key
              )"
              :key="col"
              class="px-3 py-1 rounded-full text-xs border transition-all duration-200"
              :class="imp.csvTags.value.includes(col)
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.1)]'
                : 'bg-zinc-900/50 border-white/[0.06] text-zinc-500 hover:border-zinc-600'"
              @click="toggleCsvTag(col)"
            >
              {{ col }}
            </button>
          </div>
        </div>

        <!-- Manual Tags -->
        <div class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Tags manuels (fixes)</h3>
          <div class="flex flex-wrap gap-2 mb-3">
            <span
              v-for="(val, key) in imp.manualTags.value"
              :key="String(key)"
              class="badge-info flex items-center gap-1"
            >
              {{ key }}={{ val }}
              <button class="hover:text-red-400" @click="removeManualTag(String(key))">&times;</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newTagKey" class="input max-w-[140px]" placeholder="Cle" @keyup.enter="addManualTag" />
            <input v-model="newTagValue" class="input max-w-[140px]" placeholder="Valeur" @keyup.enter="addManualTag" />
            <button class="btn-sm btn-secondary" @click="addManualTag">Ajouter</button>
          </div>
        </div>

        <!-- Preview -->
        <div class="card">
          <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Apercu ({{ imp.csvData.value.length }} lignes)</h3>
          <div class="overflow-x-auto max-h-48">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-white/[0.06]">
                  <th class="px-2 py-1 text-left text-zinc-500">#</th>
                  <th v-for="h in imp.csvHeaders.value" :key="h" class="px-2 py-1 text-left text-zinc-500">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in imp.previewData.value" :key="i" class="border-b border-white/[0.03]">
                  <td class="px-2 py-1 text-zinc-600">{{ i + 2 }}</td>
                  <td v-for="h in imp.csvHeaders.value" :key="h" class="px-2 py-1 text-zinc-400">{{ row[h] || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <!-- MANUAL MODE -->
    <template v-if="imp.mode.value === 'manual'">
      <div class="space-y-3">
        <div v-for="device in imp.manualDevices.value" :key="device.id" class="card">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Device #{{ imp.manualDevices.value.indexOf(device) + 1 }}</span>
            <button
              v-if="imp.manualDevices.value.length > 1"
              class="text-zinc-600 hover:text-red-400 text-sm transition-colors"
              @click="imp.removeManualDevice(device.id)"
            >&times; Supprimer</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="label">DevEUI *</label>
              <input
                v-model="device.devEui"
                class="input font-mono"
                placeholder="70B3D52DD3000001"
                maxlength="16"
                @input="device.devEui = device.devEui.toUpperCase().replace(/[^0-9A-F]/g, '')"
              />
              <p v-if="device.devEui && !/^[0-9A-F]{16}$/.test(device.devEui)" class="text-xs text-red-400 mt-1">
                16 caracteres hexadecimaux requis
              </p>
            </div>
            <div>
              <label class="label">Nom</label>
              <input v-model="device.name" class="input" placeholder="Capteur-001" />
            </div>
            <div>
              <label class="label">AppKey</label>
              <input
                v-model="device.appKey"
                class="input font-mono text-xs"
                placeholder="32 hex (optionnel)"
                maxlength="32"
                @input="device.appKey = device.appKey.toUpperCase().replace(/[^0-9A-F]/g, '')"
              />
            </div>
          </div>
          <!-- Manual device tags -->
          <div v-if="imp.selectedProfile.value?.required_tags.length" class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div v-for="tag in imp.selectedProfile.value!.required_tags" :key="tag">
              <label class="label text-xs">{{ tag }}</label>
              <input
                v-model="device.tags[tag]"
                class="input text-sm"
                :placeholder="tag"
              />
            </div>
          </div>
        </div>
        <button
          v-if="imp.manualDevices.value.length < 5"
          class="btn-sm btn-secondary"
          @click="imp.addManualDevice()"
        >+ Ajouter un device</button>
      </div>
    </template>

    <!-- DUPLICATE PANEL -->
    <div v-if="imp.showDuplicatePanel.value" class="card border-amber-500/20">
      <h3 class="text-sm font-semibold text-amber-400 mb-3">
        {{ imp.duplicatesFound.value.length }} doublon(s) detecte(s)
      </h3>
      <div class="overflow-x-auto max-h-32 mb-4">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-white/[0.06]">
              <th class="px-2 py-1 text-left text-zinc-500">DevEUI</th>
              <th class="px-2 py-1 text-left text-zinc-500">Existant</th>
              <th class="px-2 py-1 text-left text-zinc-500">CSV</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in imp.duplicatesFound.value" :key="d.devEui" class="border-b border-white/[0.03]">
              <td class="px-2 py-1 font-mono text-zinc-400">{{ d.devEui }}</td>
              <td class="px-2 py-1 text-zinc-500">{{ d.existingName }}</td>
              <td class="px-2 py-1 text-zinc-400">{{ d.csvName }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex gap-3">
        <button class="btn-sm btn-secondary" @click="imp.executeImport('ignore')">Ignorer les doublons</button>
        <button class="btn-sm btn-danger" @click="imp.executeImport('overwrite')">Ecraser les doublons</button>
        <button class="btn-sm btn-secondary" @click="imp.showDuplicatePanel.value = false; imp.duplicatesFound.value = []">Annuler</button>
      </div>
    </div>

    <!-- IMPORT BUTTON -->
    <div v-if="!imp.showDuplicatePanel.value" class="flex items-center gap-4">
      <button
        class="btn-primary"
        :disabled="!imp.canImport.value || imp.isImporting.value"
        @click="startImport"
      >
        {{ imp.isImporting.value ? 'Import en cours...' : 'Lancer l\'import' }}
      </button>
      <button
        v-if="imp.lastImportedDevEuis.value.length > 0 && !imp.isImporting.value"
        class="btn-danger btn-sm"
        @click="imp.undoLastImport()"
      >
        Annuler l'import ({{ imp.lastImportedDevEuis.value.length }} devices)
      </button>
      <button
        v-if="imp.hasFile.value || imp.logs.value.length > 0"
        class="btn-secondary btn-sm"
        @click="imp.reset()"
      >
        Reinitialiser
      </button>
    </div>

    <!-- RESULTS -->
    <template v-if="imp.logs.value.length > 0 || imp.isImporting.value">
      <!-- Stats -->
      <div class="flex gap-4 text-sm">
        <span class="text-zinc-500">Total: <strong class="text-zinc-300">{{ imp.statTotal.value }}</strong></span>
        <span class="text-emerald-400">Succes: <strong>{{ imp.statSuccess.value }}</strong></span>
        <span v-if="imp.statError.value > 0" class="text-red-400">Erreurs: <strong>{{ imp.statError.value }}</strong></span>
        <span v-if="imp.statSkipped.value > 0" class="text-amber-400">Ignores: <strong>{{ imp.statSkipped.value }}</strong></span>
      </div>

      <ProgressBar
        v-if="imp.isImporting.value"
        :progress="imp.progress.value"
        :text="imp.progressText.value"
      />

      <LogViewer :logs="imp.logs.value" max-height="400px" />

      <!-- Error Summary -->
      <div v-if="imp.importErrors.value.length > 0" class="card border-red-500/20">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-red-400">{{ imp.importErrors.value.length }} erreur(s)</h3>
          <button class="btn-sm btn-secondary" @click="imp.exportImportErrors()">Exporter CSV</button>
        </div>
        <div class="overflow-x-auto max-h-48">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-white/[0.06]">
                <th class="px-2 py-1 text-left text-zinc-500">Ligne</th>
                <th class="px-2 py-1 text-left text-zinc-500">DevEUI</th>
                <th class="px-2 py-1 text-left text-zinc-500">Erreur</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(err, i) in imp.importErrors.value" :key="i" class="border-b border-white/[0.03]">
                <td class="px-2 py-1 text-zinc-500">{{ err.row }}</td>
                <td class="px-2 py-1 font-mono text-zinc-400">{{ err.devEui }}</td>
                <td class="px-2 py-1 text-red-400">{{ err.error }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- DP Fix -->
      <div v-if="imp.showDpFix.value" class="card border-amber-500/20">
        <h3 class="text-sm font-semibold text-amber-400 mb-3">
          Device Profile invalide pour {{ imp.failedRows.value.length }} device(s)
        </h3>
        <div class="flex gap-3 items-end">
          <div class="flex-1">
            <label class="label">Corriger avec ce Device Profile :</label>
            <select ref="fixDpSelect" class="input">
              <option value="">-- Selectionnez --</option>
              <option v-for="dp in conn.deviceProfiles" :key="dp.id" :value="dp.id">{{ dp.name }}</option>
            </select>
          </div>
          <button
            class="btn-primary btn-sm"
            @click="() => {
              const sel = ($refs.fixDpSelect as HTMLSelectElement)?.value
              if (sel) imp.retryWithDeviceProfile(sel)
            }"
          >Relancer</button>
        </div>
      </div>
    </template>
  </div>
</template>
