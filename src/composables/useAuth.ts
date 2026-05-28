import { computed } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useAuthStore } from '~/stores/auth'

export function useAuth() {
  const auth = useAuthStore()
  const admin = useAdminStore()
  const isAuthenticated = computed(() => auth.isAuthenticated)

  async function login(account: string, password: string) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password }),
      })

      if (response.ok) {
        const data = await response.json() as { token: string, user: { id: string, account: string, displayName: string, role: string, enabled: boolean, permissions: any } }
        const existing = admin.users.find(item => item.id === data.user.id)
        if (existing)
          Object.assign(existing, data.user)
        else
          admin.users.push({ ...data.user, password, enabled: data.user.enabled, displayName: data.user.displayName, permissions: data.user.permissions } as any)
        admin.setCurrentUser(data.user.id)
        auth.setToken(data.token)
        auth.setUser({
          id: data.user.id,
          name: data.user.displayName || data.user.account,
          account: data.user.account,
          role: data.user.role,
        })
        return { ok: true, message: '' }
      }

      if (response.status === 401)
        return { ok: false, message: '账号或密码不正确' }
    }
    catch {
      // D1 not configured yet: keep local login usable during development.
    }

    const user = admin.users.find(item =>
      item.enabled
      && item.account.trim().toLowerCase() === account.trim().toLowerCase()
      && item.password === password,
    )

    if (!user)
      return { ok: false, message: '账号或密码不正确' }

    admin.setCurrentUser(user.id)
    auth.setToken(`local-${user.id}-${Date.now()}`)
    auth.setUser({
      id: user.id,
      name: user.displayName || user.account,
      account: user.account,
      role: user.role,
    })
    return { ok: true, message: '' }
  }

  async function logout() {
    auth.clearAuth()
  }

  return {
    isAuthenticated,
    login,
    logout,
    user: computed(() => auth.user),
  }
}
