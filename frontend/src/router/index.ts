import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
      },
      {
        path: 'tools',
        name: 'tools-hub',
        component: () => import('@/views/ToolsHubView.vue'),
        meta: { roles: ['super_admin', 'admin'] },
      },
      {
        path: 'tools/:tool',
        name: 'tool',
        component: () => import('@/views/ToolView.vue'),
        meta: { roles: ['super_admin', 'admin'] },
        props: true,
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('@/views/AdminView.vue'),
        meta: { roles: ['super_admin', 'admin'] },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { roles: ['super_admin', 'admin'] },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Init auth state if needed
  if (auth.accessToken && !auth.user) {
    await auth.init()
  }

  // Public routes
  if (to.meta.requiresAuth === false) {
    if (auth.isAuthenticated) return { name: 'dashboard' }
    return true
  }

  // Require auth
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Role check
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && auth.role && !requiredRoles.includes(auth.role)) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
