<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBulkOperation } from '@/composables/useBulkOperation'
import { useDevices } from '@/composables/useDevices'
import { useConnectionStore } from '@/stores/connection'
import { useConfirm } from '@/composables/useConfirm'
import { parseApiError } from '@/composables/useApi'
import BulkOperationView from './BulkOperationView.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'

const conn = useConnectionStore()
const { getDevice, updateDevice } = useDevices()
const bulk = useBulkOperation()
const confirm = useConfirm()

const newDpId = ref('')

const columns = [
  { key: 'name', label: 'Nom' },
  { key: 'devEui', label: 'DevEUI', mono: true },
  { key: 'deviceProfileName', label: 'Profil actuel' },
  { key: 'lastSeenAt', label: 'Dernier vu' },
]

const newDpName = computed(() =>
  conn.deviceProfiles.find(dp => dp.id === newDpId.value)?.name ?? ''
)

async function executeDpChange() {
  if (!newDpId.value) {
    await confirm.ask({
      title: 'Device Profile manquant',
      message: 'Selectionnez un Device Profile de destination avant de continuer.',
      confirmLabel: 'Compris',
    })
    return
  }

  const ok = await confirm.ask({
    title: 'Confirmer le changement',
    message: `Changer le Device Profile de ${bulk.selectionCount.value} device(s) vers "${newDpName.value}" ?`,
    confirmLabel: 'Changer le profil',
  })
  if (!ok) return

  const srv = conn.currentServer!

  await bulk.execute(async (device) => {
    try {
      const deviceData = await getDevice(srv.url, srv.api_token, device.devEui)
      const fullDevice = deviceData.device
      fullDevice.deviceProfileId = newDpId.value

      await updateDevice(srv.url, srv.api_token, device.devEui, fullDevice as unknown as Record<string, unknown>)
      return { status: 'success', message: `${device.name || device.devEui}: profil mis a jour` }
    } catch (err) {
      return { status: 'error', message: `${device.name || device.devEui}: ${parseApiError(err)}` }
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
    execute-label="Changer le profil"
    :execute-disabled="!newDpId"
    @load="bulk.loadDevices()"
    @toggle-select="bulk.toggleSelection"
    @select-all="bulk.selectAll()"
    @deselect-all="bulk.deselectAll()"
    @filter="bulk.setFilter"
    @execute="executeDpChange"
  >
    <template #header>
      <div class="card">
        <label class="label">Nouveau Device Profile</label>
        <AppSelect
          v-model="newDpId"
          class="max-w-md"
          :options="conn.deviceProfiles.map(dp => ({ value: dp.id, label: dp.name }))"
          placeholder="-- Choisir --"
        />
      </div>
    </template>
  </BulkOperationView>

  <ConfirmDialog
    :show="confirm.show.value"
    :title="confirm.title.value"
    :message="confirm.message.value"
    :confirm-label="confirm.confirmLabel.value"
    :danger="confirm.isDanger.value"
    @confirm="confirm.onConfirm()"
    @cancel="confirm.onCancel()"
  />
</template>
