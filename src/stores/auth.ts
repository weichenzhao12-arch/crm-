import type { MinimalUser } from '~/types/auth'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '~/constants/app'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<MinimalUser | null>(null)
  const isAuthenticated = computed(() => Boolean(token.value))

  function storage() {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  }

  function clearOldPersistentAuth() {
    if (typeof localStorage === 'undefined')
      return
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  }

  function setToken(value: string | null) {
    token.value = value
    clearOldPersistentAuth()

    if (value)
      storage()?.setItem(AUTH_STORAGE_KEY, value)
    else
      storage()?.removeItem(AUTH_STORAGE_KEY)
  }

  function setUser(value: MinimalUser | null) {
    user.value = value
    clearOldPersistentAuth()
    if (value)
      storage()?.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(value))
    else
      storage()?.removeItem(AUTH_USER_STORAGE_KEY)
  }

  function clearAuth() {
    setToken(null)
    setUser(null)
  }

  function hydrate() {
    clearOldPersistentAuth()
    const activeStorage = storage()
    const stored = activeStorage?.getItem(AUTH_STORAGE_KEY)
    if (stored)
      token.value = stored
    const storedUser = activeStorage?.getItem(AUTH_USER_STORAGE_KEY)
    if (storedUser) {
      try {
        user.value = JSON.parse(storedUser) as MinimalUser
      }
      catch {
        activeStorage?.removeItem(AUTH_USER_STORAGE_KEY)
      }
    }
  }

  return {
    clearAuth,
    hydrate,
    isAuthenticated,
    setToken,
    setUser,
    token,
    user,
  }
})
