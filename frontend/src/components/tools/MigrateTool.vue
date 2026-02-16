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
const { getDevice, getDeviceKeys, deleteDevice, createDevice, setDeviceKeys } = useDevices()
const bulk = useBulkOperation()
const confirm = useConfirm()

const destAppId = ref('')

const columns = [
  { key: 'name', label: 'Nom' },
  { key: 'devEui', label: 'DevEUI', mono: true },
  { key: 'deviceProfileName', label: 'Profil' },
]

const destApps = computed(() =>
  conn.applications.filter(a => a.id !== conn.selectedApplicationId)
)

const destAppName = computed(() =>
  conn.applications.find(a => a.id === destAppId.value)?.name ?? ''
)

async function executeMigration() {
  if (!destAppId.value) {
    await confirm.ask({
      title: 'Application manquante',
      message: 'Selectionnez une application de destination avant de continuer.',
      confirmLabel: 'Compris',
    })
    return
  }

  const ok = await confirm.ask({
    title: 'Confirmer la migration',
    message: `Migrer ${bulk.selectionCount.value} device(s) vers "${destAppName.value}" ? Les devices seront supprimes de l'application source puis recrees dans la destination.`,
    confirmLabel: 'Migrer',
    danger: true,
  })
  if (!ok) return

  const srv = conn.currentServer!

  await bulk.execute(async (device) => {
    try {
      // 1. GET device
      const deviceData = await getDevice(srv.url, srv.api_token, device.devEui)
      const fullDevice = deviceData.device

      // 2. GET keys
      const keys = await getDeviceKeys(srv.url, srv.api_token, device.devEui)

      // 3. DELETE from source
      await deleteDevice(srv.url, srv.api_token, device.devEui)

      // 4. POST in destination
      await createDevice(srv.url, srv.api_token, {
        applicationId: destAppId.value,
        name: fullDevice.name,
        description: fullDevice.description,
        devEui: fullDevice.devEui,
        deviceProfileId: fullDevice.deviceProfileId,
        tags: fullDevice.tags || {},
      })

      // 5. Restore keys
      if (keys) {
        try {
          await setDeviceKeys(srv.url, srv.api_token, device.devEui, {
            nwkKey: keys.nwkKey,
            appKey: keys.appKey,
          })
        } catch {
          return { status: 'warning', message: `${device.name}: migre mais cles non restaurees` }
        }
      }

      return { status: 'success', message: `${device.name || device.devEui} migre vers ${destAppName.value}` }
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
    execute-label="Migrer"
    :execute-disabled="!destAppId"
    @load="bulk.loadDevices()"
    @toggle-select="bulk.toggleSelection"
    @select-all="bulk.selectAll()"
    @deselect-all="bulk.deselectAll()"
    @filter="bulk.setFilter"
    @execute="executeMigration"
  >
    <template #header>
      <div class="card">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Application source</label>
            <p class="text-zinc-200 font-medium">{{ conn.selectedApplicationName }}</p>
          </div>
          <div>
            <label class="label">Application destination</label>
            <AppSelect
              v-model="destAppId"
              :options="destApps.map(app => ({ value: app.id, label: app.name }))"
              placeholder="-- Choisir --"
            />
          </div>
        </div>
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
