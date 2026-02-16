<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'
import { useConnectionStore } from '@/stores/connection'
import { useRoute } from 'vue-router'
import { computed } from 'vue'

defineProps<{ open: boolean }>()
defineEmits<{ toggle: [] }>()

const route = useRoute()
const { isAdmin } = useAuth()
const conn = useConnectionStore()

interface NavItem {
  label: string
  icon: string
  to: string
  show: boolean
}

const navItems = computed<NavItem[]>(() => [
  { label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', to: '/', show: true },
  { label: 'Outils', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', to: '/tools', show: isAdmin.value },
  { label: 'Administration', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', to: '/admin', show: isAdmin.value },
  { label: 'Parametres', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', to: '/settings', show: isAdmin.value },
])

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}
</script>

<template>
  <aside
    class="bg-zinc-950/80 backdrop-blur-xl border-r border-white/[0.06] transition-all duration-300 shrink-0 flex flex-col"
    :class="open ? 'w-56' : 'w-16'"
  >
    <!-- Logo with LoRa antenna -->
    <div class="h-14 flex items-center justify-center border-b border-white/[0.06] px-4 gap-2">
      <!-- Mini antenna icon -->
      <svg
        class="w-5 h-5 shrink-0"
        :class="conn.isConnected ? 'animate-pulse-signal' : ''"
        viewBox="0 0 20 20"
        fill="none"
      >
        <!-- Mast -->
        <line x1="10" y1="17" x2="10" y2="8" stroke="url(#sidebar-antenna)" stroke-width="1.8" stroke-linecap="round" />
        <!-- Tip -->
        <circle cx="10" cy="7" r="2" fill="url(#sidebar-antenna)" />
        <!-- Signal arcs (only when connected) -->
        <template v-if="conn.isConnected">
          <path d="M5 4 A7 7 0 0 1 15 4" stroke="rgba(6,182,212,0.5)" stroke-width="1.2" fill="none" stroke-linecap="round" />
          <path d="M7 5.5 A4.5 4.5 0 0 1 13 5.5" stroke="rgba(6,182,212,0.7)" stroke-width="1.2" fill="none" stroke-linecap="round" />
        </template>
        <!-- Base -->
        <path d="M6 17 L10 14 L14 17" stroke="url(#sidebar-antenna)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <defs>
          <linearGradient id="sidebar-antenna" x1="10" y1="17" x2="10" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <span v-if="open" class="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">CS Manager</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 py-4 space-y-1 px-2">
      <router-link
        v-for="item in navItems.filter(i => i.show)"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group"
        :class="isActive(item.to)
          ? 'bg-cyan-500/10 text-cyan-400'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'"
      >
        <!-- Active indicator bar -->
        <div
          v-if="isActive(item.to)"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-r"
        />
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
        </svg>
        <span v-if="open" class="text-sm font-medium">{{ item.label }}</span>
        <!-- Tooltip when collapsed -->
        <div
          v-if="!open"
          class="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs rounded-md
                 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50"
        >
          {{ item.label }}
        </div>
      </router-link>
    </nav>
  </aside>
</template>
