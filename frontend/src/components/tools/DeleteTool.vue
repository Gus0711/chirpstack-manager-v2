<script setup lang="ts">
import { ref } from 'vue'
import { useBulkOperation } from '@/composables/useBulkOperation'
import { useDevices } from '@/composables/useDevices'
import { useConnectionStore } from '@/stores/connection'
import { parseApiError } from '@/composables/useApi'
import BulkOperationView from './BulkOperationView.vue'
import Modal from '@/components/common/Modal.vue'

const conn = useConnectionStore()
const { deleteDevice } = useDevices()
const bulk = useBulkOperation()

const showConfirm = ref(false)
const confirmInput = ref('')

const columns = [
  { key: 'name', label: 'Nom' },
  { key: 'devEui', label: 'DevEUI', mono: true },
  { key: 'deviceProfileName', label: 'Profil' },
  { key: 'lastSeenAt', label: 'Dernier vu' },
]

function requestDelete() {
  if (bulk.selectionCount.value === 0) return
  confirmInput.value = ''
  showConfirm.value = true
}

async function confirmDelete() {
  if (confirmInput.value !== String(bulk.selectionCount.value)) return
  showConfirm.value = false

  await bulk.execute(async (device) => {
    try {
      await deleteDevice(conn.currentServer!.url, conn.currentServer!.api_token, device.devEui)
      return { status: 'success', message: `${device.name || device.devEui} supprime` }
    } catch (err) {
      return { status: 'error', message: `${device.name || device.devEui}: ${parseApiError(err)}` }
    }
  }, (results) => {
    // Remove deleted devices from list
    if (results.success > 0) {
      bulk.devices.value = bulk.devices.value.filter(d => !bulk.selection.value.has(d.devEui))
      bulk.deselectAll()
    }
  })
}
</script>

<template>
  <BulkOperationView
    :devices="bulk.devices.value"
    :filtered-devices="bulk.filteredDevices.value"
    :selection="bulk.selection.value"
    :selection-count="bulk.selectionCount.value"
    :is-loading="bulk.isLoading.value"
    :is-executing="bulk.isExecuting.value"
    :load-progress="bulk.loadProgress.value"
    :load-progress-text="bulk.loadProgressText.value"
    :execute-progress="bulk.executeProgress.value"
    :execute-progress-text="bulk.executeProgressText.value"
    :logs="bulk.logs.value"
    :results="bulk.results.value"
    :columns="columns"
    execute-label="Supprimer"
    :danger-button="true"
    @load="bulk.loadDevices()"
    @toggle-select="bulk.toggleSelection"
    @select-all="bulk.selectAll()"
    @deselect-all="bulk.deselectAll()"
    @filter="bulk.setFilter"
    @execute="requestDelete"
  />

  <!-- Confirmation Modal -->
  <Modal title="Confirmer la suppression" :show="showConfirm" @close="showConfirm = false">
    <div class="space-y-4">
      <p class="text-zinc-400">
        Vous allez supprimer <strong class="text-red-400">{{ bulk.selectionCount.value }}</strong> device(s).
        Cette action est irreversible.
      </p>
      <div>
        <label class="label">Tapez "{{ bulk.selectionCount.value }}" pour confirmer</label>
        <input v-model="confirmInput" class="input" :placeholder="String(bulk.selectionCount.value)" />
      </div>
    </div>
    <template #footer>
      <button class="btn-secondary" @click="showConfirm = false">Annuler</button>
      <button
        class="btn-danger"
        :disabled="confirmInput !== String(bulk.selectionCount.value)"
        @click="confirmDelete"
      >
        Supprimer {{ bulk.selectionCount.value }} device(s)
      </button>
    </template>
  </Modal>
</template>
