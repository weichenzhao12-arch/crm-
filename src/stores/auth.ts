import type { MinimalUser } from '~/types/auth'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '~/constants/app'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<MinimalUser | null>(null)
  const isAuthenticated = computed(() => Boolean(token.value))

  function setToken(value: string | null) {
    token.value = value

    if (value)
      localStorage.setItem(AUTH_STORAGE_KEY, value)
    else
      localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  function setUser(value: MinimalUser | null) {
    user.value = value
    if (value)
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(value))
    else
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  }

  function clearAuth() {
    setToken(null)
    setUser(null)
  }

  function hydrate() {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored)
      token.value = stored
    const storedUser = localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (storedUser) {
      try {
        user.value = JSON.parse(storedUser) as MinimalUser
      }
      catch {
        localStorage.removeItem(AUTH_USER_STORAGE_KEY)
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
