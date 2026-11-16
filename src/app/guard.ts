import type { Router } from 'vue-router'
import { useAdminStore } from '~/stores/admin'
import { useAuthStore } from '~/stores/auth'
import { warehouseAccess } from '~/features/warehouse/model'

export function applyRouterGuards(router: Router) {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    const admin = useAdminStore()
    const guestOnly = Boolean(to.meta.guestOnly)
    const requiresAuth = !guestOnly && !to.meta.public

    if (requiresAuth && !auth.isAuthenticated)
      return { path: '/login', query: { redirect: to.fullPath } }

    if (guestOnly && auth.isAuthenticated)
      return { path: '/' }

    const currentUser = admin.currentUser
    if (auth.isAuthenticated && warehouseAccess(currentUser).only && !to.meta.public && !to.path.startsWith('/warehouse'))
      return { path: '/warehouse' }
    if (to.path === '/warehouse/manage' && !warehouseAccess(currentUser).stock)
      return { path: '/warehouse' }
    const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager' || Boolean(currentUser?.permissions.manageUsers)
    if (to.path.startsWith('/admin') && !canManage)
      return { path: '/' }

    if (to.path === '/quote' && to.query.view === 'cost') {
      const canCalculateCost = currentUser?.role === 'owner' || currentUser?.role === 'manager' || Boolean(currentUser?.permissions.costCalculation)
      if (!canCalculateCost)
        return { path: '/quote', query: { view: 'quote' } }
    }

    return true
  })

  router.afterEach((to) => {
    const auth = useAuthStore()
    const title = typeof to.meta.title === 'string' ? to.meta.title : 'SolosVue3'
    document.title = auth.isAuthenticated ? `${title} · SolosVue3` : title
  })
}
