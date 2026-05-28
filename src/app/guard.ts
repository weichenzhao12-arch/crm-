import type { Router } from 'vue-router'
import { useAdminStore } from '~/stores/admin'
import { useAuthStore } from '~/stores/auth'

export function applyRouterGuards(router: Router) {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    const admin = useAdminStore()
    const guestOnly = Boolean(to.meta.guestOnly)
    const requiresAuth = !guestOnly

    if (requiresAuth && !auth.isAuthenticated)
      return { path: '/login', query: { redirect: to.fullPath } }

    if (guestOnly && auth.isAuthenticated)
      return { path: '/' }

    const currentUser = admin.currentUser
    const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager' || Boolean(currentUser?.permissions.manageUsers)
    if (to.path.startsWith('/admin') && !canManage)
      return { path: '/' }

    return true
  })

  router.afterEach((to) => {
    const auth = useAuthStore()
    const title = typeof to.meta.title === 'string' ? to.meta.title : 'SolosVue3'
    document.title = auth.isAuthenticated ? `${title} · SolosVue3` : title
  })
}
