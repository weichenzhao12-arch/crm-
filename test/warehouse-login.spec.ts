import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import { useAdminStore } from '../src/stores/admin'
import { warehouseAccess } from '../src/features/warehouse/model'

it('preserves server warehouse permissions across a page refresh', async () => {
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ token: 'test', user: { id: 'warehouse', account: 'warehouse', displayName: '仓库', role: 'viewer', enabled: true, permissions: { warehouseOnly: true, warehouseRead: true } } }), { status: 200 }))
  try {
    expect((await useAuth().login('warehouse', '123456')).ok).toBe(true)
    setActivePinia(createPinia())
    const admin = useAdminStore()
    expect(admin.currentUser?.id).toBe('warehouse')
    expect(warehouseAccess(admin.currentUser).only).toBe(true)
  }
  finally { fetchMock.mockRestore(); localStorage.clear(); sessionStorage.clear() }
})
