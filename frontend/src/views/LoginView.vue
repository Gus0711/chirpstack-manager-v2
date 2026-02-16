<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoraBackground from '@/components/common/LoraBackground.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const mounted = ref(false)

onMounted(() => {
  setTimeout(() => { mounted.value = true }, 50)
})

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login({ username: username.value, password: password.value })
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      error.value = axiosErr.response?.data?.detail ?? 'Erreur de connexion'
    } else {
      error.value = 'Erreur de connexion'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-zinc-950 p-4 relative overflow-hidden">
    <!-- Full animated LoRa background -->
    <LoraBackground intensity="full" />

    <div
      class="w-full max-w-md transition-all duration-700 relative z-10"
      :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
    >
      <!-- Header with LoRa antenna -->
      <div class="text-center mb-8">
        <div class="relative inline-flex items-center justify-center w-24 h-24 mb-3">
          <!-- Antenna SVG -->
          <svg class="w-24 h-24" viewBox="0 0 96 96" fill="none">
            <!-- Antenna mast -->
            <line x1="48" y1="70" x2="48" y2="35" stroke="url(#antenna-grad)" stroke-width="3" stroke-linecap="round" />
            <!-- Antenna tip -->
            <circle cx="48" cy="33" r="3.5" fill="url(#antenna-grad)" />
            <!-- Base -->
            <path d="M38 70 L48 64 L58 70" stroke="url(#antenna-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />

            <!-- Wave arcs (animated) -->
            <g class="animate-wave-expand" style="transform-origin: 48px 33px;">
              <path d="M33 22 A20 20 0 0 1 63 22" stroke="rgba(6,182,212,0.6)" stroke-width="1.5" fill="none" stroke-linecap="round" />
            </g>
            <g class="animate-wave-expand" style="transform-origin: 48px 33px; animation-delay: 0.8s;">
              <path d="M33 22 A20 20 0 0 1 63 22" stroke="rgba(6,182,212,0.5)" stroke-width="1.5" fill="none" stroke-linecap="round" />
            </g>
            <g class="animate-wave-expand" style="transform-origin: 48px 33px; animation-delay: 1.6s;">
              <path d="M33 22 A20 20 0 0 1 63 22" stroke="rgba(139,92,246,0.4)" stroke-width="1.5" fill="none" stroke-linecap="round" />
            </g>

            <defs>
              <linearGradient id="antenna-grad" x1="48" y1="70" x2="48" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#8b5cf6" />
                <stop offset="100%" stop-color="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="text-4xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent mb-1">CS Manager</h1>
        <p class="text-zinc-500 mt-2 text-sm">Connectez-vous pour continuer</p>
      </div>

      <!-- Form -->
      <form
        class="glass-glow bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 space-y-5"
        @submit.prevent="handleLogin"
      >
        <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {{ error }}
        </div>

        <div>
          <label class="label" for="username">Nom d'utilisateur</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="input"
            placeholder="admin"
            required
            autofocus
          />
        </div>

        <div>
          <label class="label" for="password">Mot de passe</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="input"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          class="btn-primary w-full"
          :disabled="loading || !username || !password"
        >
          <span v-if="loading">Connexion...</span>
          <span v-else>Se connecter</span>
        </button>
      </form>

      <p class="text-center text-zinc-500 text-xs mt-6 flex items-center justify-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Premiere connexion : admin / admin
      </p>
    </div>
  </div>
</template>
