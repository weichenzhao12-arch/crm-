import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { AUTH_STORAGE_KEY } from '~/constants/app'
import { useAuthStore } from '~/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('persists token changes', () => {
    const auth = useAuthStore()
    auth.setToken('hello')

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe('hello')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('clears auth state', () => {
    const auth = useAuthStore()
    auth.setToken('hello')
    auth.setUser({ id: '1', name: 'Solo' })

    auth.clearAuth()

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('hydrates token from storage', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'persisted')
    const auth = useAuthStore()

    auth.hydrate()

    expect(auth.token).toBe('persisted')
  })
})
