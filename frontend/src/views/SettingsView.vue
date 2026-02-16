<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import type { ChirpStackServer } from '@/types'

const auth = useAuthStore()
const confirm = useConfirm()

// Server management
const servers = ref<ChirpStackServer[]>([])
const newServer = ref({ name: '', url: '', api_token: '' })
const showAddServer = ref(false)

// Password change
const passwords = ref({ current: '', new_password: '', confirm: '' })
const passwordMsg = ref('')

async function loadServers() {
  const { data } = await api.get<ChirpStackServer[]>('/api/auth/servers')
  servers.value = data
}

async function addServer() {
  await api.post('/api/auth/servers', newServer.value)
  newServer.value = { name: '', url: '', api_token: '' }
  showAddServer.value = false
  await loadServers()
}

async function deleteServer(id: string) {
  const srv = servers.value.find(s => s.id === id)
  const ok = await confirm.ask({
    title: 'Supprimer le serveur',
    message: `Supprimer le serveur "${srv?.name || ''}" ? Cette action est irreversible.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!ok) return
  await api.delete(`/api/auth/servers/${id}`)
  await loadServers()
}

async function changePassword() {
  passwordMsg.value = ''
  if (passwords.value.new_password !== passwords.value.confirm) {
    passwordMsg.value = 'Les mots de passe ne correspondent pas'
    return
  }
  try {
    await api.put('/api/auth/me', { password: passwords.value.new_password })
    passwordMsg.value = 'Mot de passe mis a jour'
    passwords.value = { current: '', new_password: '', confirm: '' }
  } catch {
    passwordMsg.value = 'Erreur lors de la mise a jour'
  }
}

onMounted(loadServers)
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-2xl font-semibold tracking-tight">Parametres</h2>

    <!-- Profile -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4 text-zinc-100">Profil</h3>
      <div class="space-y-2 text-sm">
        <p><span class="text-zinc-500">Utilisateur :</span> <span class="text-zinc-200">{{ auth.user?.username }}</span></p>
        <p><span class="text-zinc-500">Email :</span> <span class="text-zinc-200">{{ auth.user?.email }}</span></p>
        <p><span class="text-zinc-500">Role :</span> <span class="text-zinc-200">{{ auth.user?.role }}</span></p>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4 text-zinc-100">Changer le mot de passe</h3>
      <form class="space-y-3" @submit.prevent="changePassword">
        <div v-if="passwordMsg" class="p-2 rounded-lg text-sm" :class="passwordMsg.includes('Erreur') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'">
          {{ passwordMsg }}
        </div>
        <div>
          <label class="label">Nouveau mot de passe</label>
          <input v-model="passwords.new_password" type="password" class="input" required minlength="4" />
        </div>
        <div>
          <label class="label">Confirmer</label>
          <input v-model="passwords.confirm" type="password" class="input" required />
        </div>
        <button type="submit" class="btn-primary btn-sm">Mettre a jour</button>
      </form>
    </div>

    <!-- Saved Servers -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-zinc-100">Serveurs sauvegardes</h3>
        <button class="btn-sm btn-primary" @click="showAddServer = !showAddServer">
          {{ showAddServer ? 'Annuler' : 'Ajouter' }}
        </button>
      </div>

      <form v-if="showAddServer" class="space-y-3 mb-4 p-4 bg-zinc-900/50 rounded-xl border border-white/[0.06]" @submit.prevent="addServer">
        <div>
          <label class="label">Nom</label>
          <input v-model="newServer.name" class="input" placeholder="Production" required />
        </div>
        <div>
          <label class="label">URL</label>
          <input v-model="newServer.url" class="input" placeholder="http://chirpstack:8080" required />
        </div>
        <div>
          <label class="label">API Token (optionnel)</label>
          <input v-model="newServer.api_token" type="password" class="input" />
        </div>
        <button type="submit" class="btn-primary btn-sm">Sauvegarder</button>
      </form>

      <div v-if="servers.length === 0" class="text-zinc-500 text-sm">
        Aucun serveur sauvegarde
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="s in servers"
          :key="s.id"
          class="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-white/[0.06]"
        >
          <div>
            <p class="text-sm font-medium text-zinc-200">{{ s.name }}</p>
            <p class="text-xs text-zinc-500">{{ s.url }}</p>
          </div>
          <button class="btn-sm btn-danger" @click="deleteServer(s.id)">Supprimer</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :show="confirm.show.value"
      :title="confirm.title.value"
      :message="confirm.message.value"
      :confirm-label="confirm.confirmLabel.value"
      :danger="confirm.isDanger.value"
      @confirm="confirm.onConfirm()"
      @cancel="confirm.onCancel()"
    />
  </div>
</template>
