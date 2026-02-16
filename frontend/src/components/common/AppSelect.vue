<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: '-- Choisir --',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? ''
})

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function select(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function onClickOutside(e: MouseEvent) {
  if (
    triggerRef.value && !triggerRef.value.contains(e.target as Node) &&
    panelRef.value && !panelRef.value.contains(e.target as Node)
  ) {
    isOpen.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="relative">
    <!-- Trigger -->
    <button
      ref="triggerRef"
      type="button"
      class="w-full px-3 py-2 bg-zinc-900/50 border border-white/[0.06] rounded-lg
             text-left text-sm transition-all duration-200
             focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30
             disabled:opacity-50 disabled:cursor-not-allowed"
      :class="isOpen ? 'ring-2 ring-cyan-500/40 border-cyan-500/30' : ''"
      :disabled="disabled"
      @click="toggle"
    >
      <span :class="modelValue ? 'text-zinc-100' : 'text-zinc-500'">
        {{ selectedLabel || placeholder }}
      </span>
      <svg
        class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 transition-transform duration-200"
        :class="isOpen ? 'rotate-180' : ''"
        fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Panel -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isOpen"
        ref="panelRef"
        class="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/[0.08] rounded-xl
               shadow-[0_8px_30px_rgba(0,0,0,0.4)] max-h-60 overflow-y-auto"
      >
        <!-- Empty / reset option -->
        <div
          class="px-3 py-2 text-sm cursor-pointer transition-colors"
          :class="!modelValue ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'"
          @click="select('')"
        >
          {{ placeholder }}
        </div>
        <!-- Options -->
        <div
          v-for="opt in options"
          :key="opt.value"
          class="px-3 py-2 text-sm cursor-pointer transition-colors"
          :class="opt.value === modelValue
            ? 'text-cyan-400 bg-cyan-500/10'
            : 'text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'"
          @click="select(opt.value)"
        >
          {{ opt.label }}
        </div>
      </div>
    </Transition>
  </div>
</template>
