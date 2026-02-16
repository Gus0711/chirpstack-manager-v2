<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="emit('cancel')"
      >
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          class="relative bg-zinc-900/95 backdrop-blur-xl border rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] w-full max-w-md"
          :class="danger ? 'border-red-500/20' : 'border-white/[0.08]'"
        >
          <div class="px-6 py-4 border-b border-white/[0.06]">
            <h3 class="text-lg font-semibold text-zinc-100">{{ title }}</h3>
          </div>
          <div class="px-6 py-4">
            <p class="text-zinc-400 text-sm">{{ message }}</p>
          </div>
          <div class="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-3">
            <button class="btn-secondary" @click="emit('cancel')">Annuler</button>
            <button
              :class="danger ? 'btn-danger' : 'btn-primary'"
              @click="emit('confirm')"
            >
              {{ confirmLabel || 'Confirmer' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
