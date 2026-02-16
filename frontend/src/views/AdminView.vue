<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, useChirpstack } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import { useConfirm } from '@/composables/useConfirm'
import Modal from '@/components/common/Modal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import type { User, Role, TenantAssignment, Tenant, Application } from '@/types'

const { isSuperAdmin } = useAuth()
const confirm = useConfirm()

const users = ref<User[]>([])
const loading = ref(false)
const showCreateModal = ref(false)

// Create form
const newUser = ref({
  username: '',
  email: '',
  password: '',
  role: 'client_visu' as Role,
})
const createError = ref('')

// Tenant management
const showTenantModal = ref(false)
const tenantUser = ref<User | null>(null)
const tenantError = ref('')
const tenantSaving = ref(false)

// Add tenant — connection test
const newServerUrl = ref('')
const newApiToken = ref('')
const newConnecting = ref(false)
const newConnected = ref(false)
const newTenants = ref<Tenant[]>([])
const newSelectedTenantId = ref('')
const newApplications = ref<Application[]>([])
const newLoadingApps = ref(false)
const newSelectedAppIds = ref<Set<string>>(new Set())

// Edit assignment — connection test
const editingAssignment = ref<TenantAssignment | null>(null)
const editServerUrl = ref('')
const editApiToken = ref('')
const editConnecting = ref(false)
const editConnected = ref(false)
const editApplications = ref<Application[]>([])
const editSelectedAppIds = ref<Set<string>>(new Set())

async function loadUsers() {
  loading.value = true
  try {
    const { data } = await api.get<User[]>('/api/auth/users')
    users.value = data
  } finally {
    loading.value = false
  }
}

async function createUser() {
  createError.value = ''
  try {
    await api.post('/api/auth/users', newUser.value)
    showCreateModal.value = false
    newUser.value = { username: '', email: '', password: '', role: 'client_visu' }
    await loadUsers()
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      createError.value = axiosErr.response?.data?.detail ?? 'Erreur'
    }
  }
}

async function toggleUserActive(user: User) {
  await api.put(`/api/auth/users/${user.id}`, { is_active: !user.is_active })
  await loadUsers()
}

async function deleteUser(user: User) {
  const ok = await confirm.ask({
    title: 'Supprimer l\'utilisateur',
    message: `Supprimer l'utilisateur "${user.username}" ? Cette action est irreversible.`,
    confirmLabel: 'Supprimer',
    danger: true,
  })
  if (!ok) return
  await api.delete(`/api/auth/users/${user.id}`)
  await loadUsers()
}

// ── Tenant management ──

function openTenantModal(user: User) {
  tenantUser.value = user
  tenantError.value = ''
  editingAssignment.value = null
  resetNewTenantForm()
  showTenantModal.value = true
}

function resetNewTenantForm() {
  newServerUrl.value = ''
  newApiToken.value = ''
  newConnecting.value = false
  newConnected.value = false
  newTenants.value = []
  newSelectedTenantId.value = ''
  newApplications.value = []
  newLoadingApps.value = false
  newSelectedAppIds.value = new Set()
}

// ── Add: test connection → fetch tenants ──

async function testNewConnection() {
  if (!newServerUrl.value || !newApiToken.value) return
  tenantError.value = ''
  newConnecting.value = true
  newConnected.value = false
  newTenants.value = []
  newSelectedTenantId.value = ''
  newApplications.value = []
  newSelectedAppIds.value = new Set()
  try {
    const cs = useChirpstack(newServerUrl.value, newApiToken.value)
    const data = await cs.get<{ result: Tenant[] }>('/api/tenants', { limit: 100 })
    newTenants.value = data.result || []
    newConnected.value = true
    if (newTenants.value.length === 0) {
      tenantError.value = 'Connexion OK mais aucun tenant trouve.'
    }
  } catch {
    tenantError.value = 'Connexion echouee. Verifiez l\'URL et le token.'
  } finally {
    newConnecting.value = false
  }
}

async function onNewTenantSelect(tenantId: string) {
  newSelectedTenantId.value = tenantId
  newApplications.value = []
  newSelectedAppIds.value = new Set()
  if (!tenantId) return
  newLoadingApps.value = true
  try {
    const cs = useChirpstack(newServerUrl.value, newApiToken.value)
    const data = await cs.get<{ result: Application[] }>('/api/applications', {
      tenant_id: tenantId,
      limit: 100,
    })
    newApplications.value = data.result || []
  } catch {
    tenantError.value = 'Erreur lors du chargement des applications.'
  } finally {
    newLoadingApps.value = false
  }
}

function toggleNewAppId(appId: string) {
  const s = new Set(newSelectedAppIds.value)
  if (s.has(appId)) s.delete(appId)
  else s.add(appId)
  newSelectedAppIds.value = s
}

async function addTenantAssignment() {
  if (!tenantUser.value || !newSelectedTenantId.value) return
  tenantError.value = ''
  tenantSaving.value = true
  const tenant = newTenants.value.find(t => t.id === newSelectedTenantId.value)
  try {
    await api.post(`/api/auth/users/${tenantUser.value.id}/tenants`, {
      tenant_id: newSelectedTenantId.value,
      tenant_name: tenant?.name || '',
      server_url: newServerUrl.value,
      server_api_token: newApiToken.value,
      allowed_application_ids: [...newSelectedAppIds.value],
    })
    resetNewTenantForm()
    await loadUsers()
    tenantUser.value = users.value.find(u => u.id === tenantUser.value!.id) || null
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      tenantError.value = axiosErr.response?.data?.detail ?? 'Erreur'
    }
  } finally {
    tenantSaving.value = false
  }
}

// ── Edit: test connection → fetch apps ──

function startEditAssignment(ta: TenantAssignment) {
  editingAssignment.value = ta
  editServerUrl.value = ta.server_url || ''
  editApiToken.value = ta.server_api_token || ''
  editConnected.value = false
  editApplications.value = []
  editSelectedAppIds.value = new Set(ta.allowed_application_ids || [])
}

function cancelEdit() {
  editingAssignment.value = null
  editConnected.value = false
  editApplications.value = []
}

async function testEditConnection() {
  if (!editServerUrl.value || !editApiToken.value || !editingAssignment.value) return
  tenantError.value = ''
  editConnecting.value = true
  editConnected.value = false
  editApplications.value = []
  try {
    const cs = useChirpstack(editServerUrl.value, editApiToken.value)
    const data = await cs.get<{ result: Application[] }>('/api/applications', {
      tenant_id: editingAssignment.value.tenant_id,
      limit: 100,
    })
    editApplications.value = data.result || []
    editConnected.value = true
  } catch {
    tenantError.value = 'Connexion echouee. Verifiez l\'URL et le token.'
  } finally {
    editConnecting.value = false
  }
}

function toggleEditAppId(appId: string) {
  const s = new Set(editSelectedAppIds.value)
  if (s.has(appId)) s.delete(appId)
  else s.add(appId)
  editSelectedAppIds.value = s
}

async function saveEditAssignment() {
  if (!tenantUser.value || !editingAssignment.value) return
  tenantError.value = ''
  tenantSaving.value = true
  try {
    await api.put(
      `/api/auth/users/${tenantUser.value.id}/tenants/${editingAssignment.value.id}`,
      {
        server_url: editServerUrl.value,
        server_api_token: editApiToken.value,
        allowed_application_ids: [...editSelectedAppIds.value],
      }
    )
    editingAssignment.value = null
    editConnected.value = false
    editApplications.value = []
    await loadUsers()
    tenantUser.value = users.value.find(u => u.id === tenantUser.value!.id) || null
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      tenantError.value = axiosErr.response?.data?.detail ?? 'Erreur'
    }
  } finally {
    tenantSaving.value = false
  }
}

async function removeTenantAssignment(ta: TenantAssignment) {
  if (!tenantUser.value) return
  const ok = await confirm.ask({
    title: 'Retirer le tenant',
    message: `Retirer l'assignation au tenant "${ta.tenant_name || ta.tenant_id}" ?`,
    confirmLabel: 'Retirer',
    danger: true,
  })
  if (!ok) return
  await api.delete(`/api/auth/users/${tenantUser.value.id}/tenants/${ta.id}`)
  await loadUsers()
  tenantUser.value = users.value.find(u => u.id === tenantUser.value!.id) || null
}

const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  client_visu: 'Client Visu',
}

const roleBadgeColors: Record<Role, string> = {
  super_admin: 'badge-danger',
  admin: 'badge-warning',
  client_visu: 'badge-info',
}

onMounted(loadUsers)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold tracking-tight">Administration</h2>
      <button class="btn-primary" @click="showCreateModal = true">
        Creer un utilisateur
      </button>
    </div>

    <!-- Users table -->
    <div class="card">
      <div v-if="loading" class="text-zinc-500">Chargement...</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/[0.06]">
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Utilisateur</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Email</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Role</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Tenants</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Statut</th>
              <th class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            <tr v-for="u in users" :key="u.id" class="hover:bg-white/[0.02] even:bg-white/[0.015] transition-colors">
              <td class="px-3 py-2.5 text-zinc-200 font-medium">{{ u.username }}</td>
              <td class="px-3 py-2.5 text-zinc-400">{{ u.email }}</td>
              <td class="px-3 py-2.5">
                <span :class="roleBadgeColors[u.role]">{{ roleLabels[u.role] }}</span>
              </td>
              <td class="px-3 py-2.5 text-zinc-500 text-xs">
                {{ u.tenant_assignments.map(t => t.tenant_name || t.tenant_id).join(', ') || '-' }}
              </td>
              <td class="px-3 py-2.5">
                <span :class="u.is_active ? 'badge-success' : 'badge-danger'">
                  {{ u.is_active ? 'Actif' : 'Inactif' }}
                </span>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex gap-2">
                  <button
                    class="btn-sm btn-secondary"
                    @click="openTenantModal(u)"
                  >
                    Tenants
                  </button>
                  <button
                    class="btn-sm btn-secondary"
                    @click="toggleUserActive(u)"
                  >
                    {{ u.is_active ? 'Desactiver' : 'Activer' }}
                  </button>
                  <button
                    v-if="isSuperAdmin"
                    class="btn-sm btn-danger"
                    @click="deleteUser(u)"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create User Modal -->
    <Modal title="Creer un utilisateur" :show="showCreateModal" @close="showCreateModal = false">
      <form class="space-y-4" @submit.prevent="createUser">
        <div v-if="createError" class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {{ createError }}
        </div>
        <div>
          <label class="label">Nom d'utilisateur</label>
          <input v-model="newUser.username" class="input" required />
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model="newUser.email" type="email" class="input" required />
        </div>
        <div>
          <label class="label">Mot de passe</label>
          <input v-model="newUser.password" type="password" class="input" required minlength="4" />
        </div>
        <div>
          <label class="label">Role</label>
          <AppSelect
            v-model="newUser.role"
            :options="[
              { value: 'client_visu', label: 'Client Visu (lecture seule)' },
              { value: 'admin', label: 'Admin' },
              ...(isSuperAdmin ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
            ]"
            placeholder="-- Choisir un role --"
          />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="showCreateModal = false">Annuler</button>
        <button class="btn-primary" @click="createUser">Creer</button>
      </template>
    </Modal>

    <!-- Tenant Management Modal -->
    <Modal
      :title="`Tenants - ${tenantUser?.username || ''}`"
      :show="showTenantModal"
      size="xl"
      @close="showTenantModal = false"
    >
      <div class="space-y-6">
        <div v-if="tenantError" class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {{ tenantError }}
        </div>

        <!-- Existing assignments -->
        <div v-if="tenantUser?.tenant_assignments.length">
          <h4 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Assignations existantes</h4>
          <div class="space-y-3">
            <div
              v-for="ta in tenantUser.tenant_assignments"
              :key="ta.id"
              class="bg-zinc-900/50 rounded-xl border border-white/[0.06] p-4"
            >
              <!-- View mode -->
              <template v-if="editingAssignment?.id !== ta.id">
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-zinc-200">{{ ta.tenant_name || ta.tenant_id }}</span>
                      <span class="text-[10px] text-zinc-500 font-mono">{{ ta.tenant_id }}</span>
                    </div>
                    <div v-if="ta.server_url" class="text-xs text-zinc-400">
                      Serveur: <span class="font-mono text-cyan-400">{{ ta.server_url }}</span>
                    </div>
                    <div v-if="ta.server_api_token" class="text-xs text-zinc-400">
                      API Token: <span class="font-mono text-zinc-500">{{ ta.server_api_token.substring(0, 20) }}...</span>
                    </div>
                    <div v-if="ta.allowed_application_ids && ta.allowed_application_ids.length > 0" class="text-xs text-zinc-400">
                      Applications:
                      <span class="font-mono text-amber-400">{{ ta.allowed_application_ids.length }} restreinte(s)</span>
                    </div>
                    <div v-else class="text-xs text-zinc-500">Applications: toutes</div>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button class="btn-sm btn-secondary" @click="startEditAssignment(ta)">Modifier</button>
                    <button class="btn-sm btn-danger" @click="removeTenantAssignment(ta)">Retirer</button>
                  </div>
                </div>
              </template>

              <!-- Edit mode -->
              <template v-else>
                <div class="space-y-3">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm font-medium text-zinc-200">{{ ta.tenant_name || ta.tenant_id }}</span>
                    <span class="badge-info text-[10px]">Edition</span>
                  </div>
                  <div>
                    <label class="label">URL du serveur</label>
                    <input v-model="editServerUrl" class="input" placeholder="http://chirpstack:8090" />
                  </div>
                  <div>
                    <label class="label">API Token ChirpStack</label>
                    <input v-model="editApiToken" type="password" class="input" placeholder="Token d'API" />
                  </div>

                  <!-- Fetch apps button -->
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="btn-sm btn-secondary"
                      :disabled="editConnecting || !editServerUrl || !editApiToken"
                      @click="testEditConnection"
                    >
                      <span v-if="editConnecting" class="flex items-center gap-2">
                        <span class="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        Connexion...
                      </span>
                      <span v-else>Charger les applications</span>
                    </button>
                    <span v-if="editConnected" class="text-xs text-emerald-400">{{ editApplications.length }} application(s) trouvee(s)</span>
                  </div>

                  <!-- Apps checkboxes -->
                  <div v-if="editApplications.length > 0" class="space-y-2">
                    <label class="label">Applications autorisees (aucune = toutes)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                      <label
                        v-for="app in editApplications"
                        :key="app.id"
                        class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          :checked="editSelectedAppIds.has(app.id)"
                          class="accent-cyan-500"
                          @change="toggleEditAppId(app.id)"
                        />
                        <span class="text-sm text-zinc-300">{{ app.name }}</span>
                        <span class="text-[10px] text-zinc-500 font-mono">{{ app.id }}</span>
                      </label>
                    </div>
                    <p class="text-[11px] text-zinc-500">
                      {{ editSelectedAppIds.size === 0 ? 'Toutes les applications seront visibles' : `${editSelectedAppIds.size} application(s) selectionnee(s)` }}
                    </p>
                  </div>
                  <!-- Show currently saved app IDs if not fetched -->
                  <div v-else-if="ta.allowed_application_ids.length > 0 && !editConnected" class="text-xs text-zinc-500">
                    Applications actuelles: <span class="font-mono text-amber-400">{{ ta.allowed_application_ids.join(', ') }}</span>
                    <br />
                    <span class="text-zinc-600">Cliquez "Charger les applications" pour modifier la selection.</span>
                  </div>

                  <div class="flex gap-2 pt-2">
                    <button class="btn-sm btn-primary" :disabled="tenantSaving" @click="saveEditAssignment">
                      {{ tenantSaving ? 'Sauvegarde...' : 'Sauvegarder' }}
                    </button>
                    <button class="btn-sm btn-secondary" @click="cancelEdit">Annuler</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
        <div v-else class="text-zinc-500 text-sm">Aucun tenant assigne.</div>

        <!-- Add new assignment -->
        <div class="border-t border-white/[0.06] pt-4">
          <h4 class="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Ajouter un tenant</h4>
          <div class="space-y-3">
            <!-- Step 1: Server connection -->
            <div>
              <label class="label">URL du serveur</label>
              <input v-model="newServerUrl" class="input" placeholder="http://chirpstack:8090" />
            </div>
            <div>
              <label class="label">API Token ChirpStack</label>
              <input v-model="newApiToken" type="password" class="input" placeholder="Token d'API" />
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="btn-primary"
                :disabled="newConnecting || !newServerUrl || !newApiToken"
                @click="testNewConnection"
              >
                <span v-if="newConnecting" class="flex items-center gap-2">
                  <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connexion...
                </span>
                <span v-else>Tester la connexion</span>
              </button>
              <span v-if="newConnected" class="text-xs text-emerald-400">Connecte — {{ newTenants.length }} tenant(s)</span>
            </div>

            <!-- Step 2: Tenant selection -->
            <template v-if="newConnected && newTenants.length > 0">
              <div>
                <label class="label">Tenant</label>
                <AppSelect
                  :model-value="newSelectedTenantId"
                  :options="newTenants.map(t => ({ value: t.id, label: t.name || t.id }))"
                  placeholder="-- Choisir un tenant --"
                  @update:model-value="onNewTenantSelect($event)"
                />
              </div>

              <!-- Step 3: Application selection -->
              <div v-if="newLoadingApps" class="flex items-center gap-2 text-xs text-zinc-500">
                <span class="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Chargement des applications...
              </div>

              <div v-if="newApplications.length > 0" class="space-y-2">
                <label class="label">Applications autorisees (aucune = toutes)</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  <label
                    v-for="app in newApplications"
                    :key="app.id"
                    class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :checked="newSelectedAppIds.has(app.id)"
                      class="accent-cyan-500"
                      @change="toggleNewAppId(app.id)"
                    />
                    <span class="text-sm text-zinc-300">{{ app.name }}</span>
                    <span class="text-[10px] text-zinc-500 font-mono">{{ app.id }}</span>
                  </label>
                </div>
                <p class="text-[11px] text-zinc-500">
                  {{ newSelectedAppIds.size === 0 ? 'Toutes les applications seront visibles' : `${newSelectedAppIds.size} application(s) selectionnee(s)` }}
                </p>
              </div>

              <!-- Submit -->
              <button
                type="button"
                class="btn-primary"
                :disabled="tenantSaving || !newSelectedTenantId"
                @click="addTenantAssignment"
              >
                {{ tenantSaving ? 'Ajout...' : 'Ajouter le tenant' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </Modal>

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
