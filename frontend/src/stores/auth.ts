import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/composables/useApi'
import type { User, LoginRequest, TokenResponse, Role } from '@/types'

const TOKEN_KEY = 'cs_access_token'
const REFRESH_KEY = 'cs_refresh_token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_KEY))

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  const isSuperAdmin = computed(() => role.value === 'super_admin')
  const isAdmin = computed(() => role.value === 'admin' || role.value === 'super_admin')
  const isClientVisu = computed(() => role.value === 'client_visu')

  const userTenantIds = computed(() =>
    user.value?.tenant_assignments.map(ta => ta.tenant_id) ?? []
  )

  function setTokens(access: string, refresh: string) {
    accessToken.value = access
    refreshToken.value = refresh
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  }

  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  async function login(credentials: LoginRequest): Promise<void> {
    const { data } = await api.post<TokenResponse>('/api/auth/login', credentials)
    setTokens(data.access_token, data.refresh_token)
    user.value = data.user
  }

  async function refreshSession(): Promise<boolean> {
    if (!refreshToken.value) return false
    try {
      const { data } = await api.post<TokenResponse>('/api/auth/refresh', {
        refresh_token: refreshToken.value,
      })
      setTokens(data.access_token, data.refresh_token)
      user.value = data.user
      return true
    } catch {
      clearTokens()
      return false
    }
  }

  async function fetchMe(): Promise<void> {
    try {
      const { data } = await api.get<User>('/api/auth/me')
      user.value = data
    } catch {
      clearTokens()
    }
  }

  function logout() {
    clearTokens()
  }

  async function init(): Promise<void> {
    if (accessToken.value) {
      await fetchMe()
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    role,
    isSuperAdmin,
    isAdmin,
    isClientVisu,
    userTenantIds,
    login,
    logout,
    refreshSession,
    fetchMe,
    init,
  }
})
