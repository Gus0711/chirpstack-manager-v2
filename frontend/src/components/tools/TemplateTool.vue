<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { api } from '@/composables/useApi'
import type { ImportProfile } from '@/types'

const conn = useConnectionStore()
const profiles = ref<ImportProfile[]>([])
const selectedDpId = ref('')
const selectedProfileId = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get<ImportProfile[]>('/api/profiles')
    profiles.value = data
  } catch { /* ignore */ }
})

function downloadTemplate() {
  const columns: string[] = ['name', 'dev_eui', 'description', 'app_key']
  if (!selectedDpId.value) columns.push('device_profile_id')

  const selectedProf = profiles.value.find(p => p.id === selectedProfileId.value)
  if (selectedProf) {
    selectedProf.required_tags.forEach(tag => {
      if (!columns.includes(tag)) columns.push(tag)
    })
  }

  const example = columns.map(col => {
    switch (col) {
      case 'name': return 'Capteur-001'
      case 'dev_eui': return '70B3D52DD3000001'
      case 'description': return 'Mon capteur'
      case 'app_key': return '2B7E151628AED2A6ABF7158809CF4F3C'
      case 'device_profile_id': return selectedDpId.value || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      default: return 'valeur_' + col
    }
  })

  const csv = columns.join(';') + '\n' + example.join(';') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_chirpstack.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4 max-w-lg">
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Generer un template CSV</h3>

      <div class="space-y-4">
        <div>
          <label class="label">Device Profile (optionnel)</label>
          <select v-model="selectedDpId" class="input">
            <option value="">-- Inclure la colonne device_profile_id --</option>
            <option v-for="dp in conn.deviceProfiles" :key="dp.id" :value="dp.id">
              {{ dp.name }}
            </option>
          </select>
          <p class="text-xs text-zinc-600 mt-1">
            Si selectionne, la colonne device_profile_id ne sera pas incluse
          </p>
        </div>

        <div>
          <label class="label">Profil d'import (optionnel)</label>
          <select v-model="selectedProfileId" class="input">
            <option value="">-- Sans profil --</option>
            <option v-for="p in profiles" :key="p.id" :value="p.id">
              {{ p.name }} ({{ p.required_tags.join(', ') }})
            </option>
          </select>
          <p class="text-xs text-zinc-600 mt-1">
            Ajoute les colonnes de tags obligatoires du profil
          </p>
        </div>

        <button class="btn-primary w-full" @click="downloadTemplate">
          Telecharger le template
        </button>
      </div>
    </div>
  </div>
</template>
