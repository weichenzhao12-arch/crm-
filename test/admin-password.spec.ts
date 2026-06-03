import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminStore } from '~/stores/admin'

vi.mock('~/api/cloud-storage', () => ({
  getCloudState: vi.fn(),
  putCloudState: vi.fn(() => Promise.resolve()),
}))

describe('admin password updates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('rejects password changes when the old password is wrong', () => {
    const admin = useAdminStore()
    admin.setCurrentUser('sales-1')

    const changed = admin.updateOwnPassword('wrong-password', 'new-pass')

    expect(changed).toBe(false)
    expect(admin.currentUser.password).toBe('123456')
  })

  it('updates current account password and persists it for admin management', () => {
    const admin = useAdminStore()
    admin.setCurrentUser('sales-1')

    const changed = admin.updateOwnPassword('123456', 'new-pass')
    const savedUsers = JSON.parse(localStorage.getItem('quote-admin-users') || '[]')

    expect(changed).toBe(true)
    expect(admin.currentUser.password).toBe('new-pass')
    expect(savedUsers.find((user: any) => user.id === 'sales-1').password).toBe('new-pass')
  })
})
