import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'

/**
 * Convenience composable for auth checks in components.
 */
export function useAuth() {
  const store = useAuthStore()

  const isAuthenticated = computed(() => store.isAuthenticated)
  const user = computed(() => store.user)
  const role = computed(() => store.role)

  function hasRole(...roles: Role[]): boolean {
    return store.role !== null && roles.includes(store.role)
  }

  function canAccessTenant(tenantId: string): boolean {
    if (store.isSuperAdmin) return true
    return store.userTenantIds.includes(tenantId)
  }

  function canWrite(): boolean {
    return !store.isClientVisu
  }

  return {
    isAuthenticated,
    user,
    role,
    hasRole,
    canAccessTenant,
    canWrite,
    isSuperAdmin: computed(() => store.isSuperAdmin),
    isAdmin: computed(() => store.isAdmin),
    isClientVisu: computed(() => store.isClientVisu),
  }
}
