<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { useRouter } from 'vue-router'

const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const auth = useAuthStore()
const conn = useConnectionStore()
const router = useRouter()

function logout() {
  auth.logout()
  conn.disconnect()
  router.push('/login')
}
</script>

<template>
  <header class="h-14 bg-zinc-950/60 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0">
    <div class="flex items-center gap-3">
      <button class="btn-icon text-zinc-500 hover:text-zinc-200" @click="emit('toggle-sidebar')">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 class="text-sm font-medium text-zinc-300">ChirpStack Manager</h1>
    </div>

    <div class="flex items-center gap-4">
      <!-- Connection status — LoRa signal indicator -->
      <div v-if="conn.isConnected" class="flex items-center gap-2 text-sm">
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none">
          <!-- Signal arcs -->
          <path
            d="M10 16 A10 10 0 0 1 10 6"
            stroke="rgba(6,182,212,0.3)"
            stroke-width="1.5"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M10 16 A10 10 0 0 1 10 6"
            stroke="rgba(6,182,212,0.8)"
            stroke-width="1.5"
            stroke-linecap="round"
            fill="none"
            class="animate-pulse-signal"
            style="transform-origin: 10px 11px;"
          />
          <path
            d="M10 14 A6 6 0 0 1 10 8"
            stroke="rgba(6,182,212,0.8)"
            stroke-width="1.5"
            stroke-linecap="round"
            fill="none"
            class="animate-pulse-signal"
            style="transform-origin: 10px 11px; animation-delay: 0.3s;"
          />
          <path
            d="M10 12.5 A3 3 0 0 1 10 9.5"
            stroke="rgba(6,182,212,0.9)"
            stroke-width="1.5"
            stroke-linecap="round"
            fill="none"
            class="animate-pulse-signal"
            style="transform-origin: 10px 11px; animation-delay: 0.6s;"
          />
          <!-- Center dot -->
          <circle cx="10" cy="16" r="1.5" fill="#22d3ee" />
        </svg>
        <span class="text-zinc-500">{{ conn.selectedApplicationName || 'Connecte' }}</span>
      </div>

      <!-- User menu -->
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white">
          {{ auth.user?.username?.slice(0, 2).toUpperCase() }}
        </div>
        <div class="text-right hidden sm:block">
          <p class="text-sm font-medium text-zinc-200">{{ auth.user?.username }}</p>
          <p class="text-xs text-zinc-600">{{ auth.user?.role }}</p>
        </div>
        <button
          class="btn-sm bg-transparent text-zinc-500 border border-white/[0.06] hover:text-zinc-200 hover:bg-white/[0.03] transition-all"
          @click="logout"
        >
          Deconnexion
        </button>
      </div>
    </div>
  </header>
</template>
