import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminStore } from '~/stores/admin'
import { isPasswordHash, verifyPassword } from '~/features/auth/password'

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
    expect(verifyPassword('123456', admin.currentUser.password)).toBe(true)
  })

  it('updates current account password and persists it for admin management', () => {
    const admin = useAdminStore()
    admin.setCurrentUser('sales-1')

    const changed = admin.updateOwnPassword('123456', 'new-pass')
    const savedUsers = JSON.parse(localStorage.getItem('quote-admin-users') || '[]')

    expect(changed).toBe(true)
    expect(admin.currentUser.password).not.toBe('new-pass')
    expect(isPasswordHash(admin.currentUser.password)).toBe(true)
    expect(verifyPassword('new-pass', admin.currentUser.password)).toBe(true)
    expect(savedUsers.find((user: any) => user.id === 'sales-1').password).toBe(admin.currentUser.password)
  })

  it('migrates legacy plain passwords into hashes when users load', () => {
    localStorage.setItem('quote-admin-users', JSON.stringify([
      {
        id: 'owner',
        account: 'admin',
        displayName: '主账号',
        role: 'owner',
        enabled: true,
        password: '123456',
        permissions: {},
      },
    ]))

    const admin = useAdminStore()

    expect(admin.currentUser.password).not.toBe('123456')
    expect(verifyPassword('123456', admin.currentUser.password)).toBe(true)
  })

  it('resets another account password without storing plain text', () => {
    const admin = useAdminStore()

    const changed = admin.resetUserPassword('sales-1', 'next-pass')
    const target = admin.users.find(user => user.id === 'sales-1')

    expect(changed).toBe(true)
    expect(target?.password).not.toBe('next-pass')
    expect(verifyPassword('next-pass', target?.password)).toBe(true)
  })
})
