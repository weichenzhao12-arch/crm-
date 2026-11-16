import type { Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyRouterGuards } from '~/app/guard'
import { createAppRouter } from '~/app/router'
import { useAuthStore } from '~/stores/auth'
import { useAdminStore } from '~/stores/admin'

describe('router guards', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createAppRouter()
    applyRouterGuards(router)
    await router.push('/')
    await router.isReady()
  })

  it('redirects unauthenticated users to login', async () => {
    await router.push('/demo-api')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/demo-api')
  })

  it('redirects authenticated users away from guest page', async () => {
    const auth = useAuthStore()
    auth.setToken('demo-token')

    await router.push('/login')

    expect(router.currentRoute.value.path).toBe('/')
  })
  it('allows a warehouse-only user to log out without redirect loops', async () => {
    const auth = useAuthStore()
    const admin = useAdminStore()
    const user = admin.users.find(item => item.role === 'quoter')!
    user.permissions.warehouseOnly = true
    user.permissions.warehouseRead = true
    admin.setCurrentUser(user.id)
    auth.setToken('warehouse-token')
    auth.clearAuth()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
