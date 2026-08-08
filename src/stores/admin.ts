import { defineStore } from 'pinia'
import { getCloudState, putCloudState } from '~/api/cloud-storage'
import { normalizePasswordForStorage, verifyPassword } from '~/features/auth/password'

export type AdminRole = 'owner' | 'manager' | 'quoter' | 'viewer'

export interface AdminPermission {
  manageProducts: boolean
  manageMaterials: boolean
  importExcel: boolean
  manageUsers: boolean
  exportQuote: boolean
  temporaryEdit: boolean
  viewAllCustomers: boolean
  importCustomers: boolean
  exportCustomers: boolean
  deleteCustomers: boolean
  restoreRecords: boolean
}

export interface AdminUser {
  id: string
  account: string
  displayName: string
  role: AdminRole
  enabled: boolean
  password: string
  permissions: AdminPermission
}

/** 主账号和只读账号不属于销售人员，不参与销售业绩与排行榜。 */
export function isSalesUser(user: Pick<AdminUser, 'enabled' | 'role'>) {
  return user.enabled && (user.role === 'manager' || user.role === 'quoter')
}

const STORAGE_KEY = 'quote-admin-users'
const CURRENT_USER_KEY = 'quote-admin-current-user'

function createId() {
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function permissionsForRole(role: AdminRole): AdminPermission {
  if (role === 'owner') {
    return {
      manageProducts: true,
      manageMaterials: true,
      importExcel: true,
      manageUsers: true,
      exportQuote: true,
      temporaryEdit: true,
      viewAllCustomers: true,
      importCustomers: true,
      exportCustomers: true,
      deleteCustomers: true,
      restoreRecords: true,
    }
  }
  if (role === 'manager') {
    return {
      manageProducts: true,
      manageMaterials: true,
      importExcel: true,
      manageUsers: false,
      exportQuote: true,
      temporaryEdit: true,
      viewAllCustomers: true,
      importCustomers: true,
      exportCustomers: true,
      deleteCustomers: true,
      restoreRecords: true,
    }
  }
  if (role === 'quoter') {
    return {
      manageProducts: false,
      manageMaterials: false,
      importExcel: false,
      manageUsers: false,
      exportQuote: false,
      temporaryEdit: true,
      viewAllCustomers: false,
      importCustomers: true,
      exportCustomers: false,
      deleteCustomers: false,
      restoreRecords: false,
    }
  }
  return {
    manageProducts: false,
    manageMaterials: false,
    importExcel: false,
    manageUsers: false,
    exportQuote: false,
    temporaryEdit: false,
    viewAllCustomers: false,
    importCustomers: false,
    exportCustomers: false,
    deleteCustomers: false,
    restoreRecords: false,
  }
}

function normalizePermissions(raw: Partial<AdminPermission> | undefined, role: AdminRole): AdminPermission {
  const defaults = permissionsForRole(role)
  const manageFallback = Boolean(raw?.manageUsers)
  return {
    ...defaults,
    ...(raw || {}),
    viewAllCustomers: raw?.viewAllCustomers ?? manageFallback ?? defaults.viewAllCustomers,
    importCustomers: raw?.importCustomers ?? raw?.importExcel ?? defaults.importCustomers,
    exportCustomers: raw?.exportCustomers ?? raw?.exportQuote ?? defaults.exportCustomers,
    deleteCustomers: raw?.deleteCustomers ?? manageFallback ?? defaults.deleteCustomers,
    restoreRecords: raw?.restoreRecords ?? manageFallback ?? defaults.restoreRecords,
  }
}

function normalizeUser(raw: Partial<AdminUser>): AdminUser {
  const role = raw.role || 'quoter'
  return {
    id: raw.id || createId(),
    account: raw.account || 'user',
    displayName: raw.displayName || raw.account || '新账号',
    role,
    enabled: raw.enabled !== false,
    password: normalizePasswordForStorage(raw.password),
    permissions: normalizePermissions(raw.permissions, role),
  }
}

function defaultUsers(): AdminUser[] {
  return [
    {
      id: 'owner',
      account: 'admin',
      displayName: '主账号',
      role: 'owner',
      enabled: true,
      password: normalizePasswordForStorage('123456'),
      permissions: permissionsForRole('owner'),
    },
    {
      id: 'sales-1',
      account: 'sales1',
      displayName: '销售一部',
      role: 'quoter',
      enabled: true,
      password: normalizePasswordForStorage('123456'),
      permissions: permissionsForRole('quoter'),
    },
    {
      id: 'sales-2',
      account: 'sales2',
      displayName: '销售二部',
      role: 'quoter',
      enabled: true,
      password: normalizePasswordForStorage('123456'),
      permissions: permissionsForRole('quoter'),
    },
  ]
}

function loadUsers() {
  if (typeof localStorage === 'undefined')
    return defaultUsers()

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved)
    return defaultUsers()

  try {
    const parsed = JSON.parse(saved) as Partial<AdminUser>[]
    const users = Array.isArray(parsed) && parsed.length ? parsed.map(normalizeUser) : defaultUsers()
    return users.some(user => user.id === 'owner') ? users : defaultUsers()
  }
  catch {
    return defaultUsers()
  }
}

function loadCurrentUserId() {
  if (typeof localStorage === 'undefined')
    return 'owner'
  return localStorage.getItem(CURRENT_USER_KEY) || 'owner'
}

export const useAdminStore = defineStore('admin', {
  state: () => ({
    users: loadUsers(),
    currentUserId: loadCurrentUserId(),
  }),
  getters: {
    currentUser: state => state.users.find(user => user.id === state.currentUserId) ?? state.users[0],
  },
  actions: {
    saveUsers() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.users))
      putCloudState('admin-users', this.users).catch(() => {})
    },
    async loadCloudUsers() {
      const users = await getCloudState<AdminUser[]>('admin-users').catch(() => null)
      if (Array.isArray(users) && users.length) {
        this.users = users.map(normalizeUser)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.users))
      }
    },
    addUser() {
      const user = {
        id: createId(),
        account: `user${this.users.length + 1}`,
        displayName: '新账号',
        role: 'quoter',
        enabled: true,
        password: normalizePasswordForStorage('123456'),
        permissions: permissionsForRole('quoter'),
      }
      this.users.push(user)
      this.saveUsers()
    },
    removeUser(id: string) {
      if (id === 'owner')
        return
      this.users = this.users.filter(user => user.id !== id)
      this.saveUsers()
    },
    applyRole(user: AdminUser) {
      user.permissions = clone(permissionsForRole(user.role))
      this.saveUsers()
    },
    updateOwnPassword(oldPassword: string, nextPassword: string) {
      const user = this.currentUser
      if (!user || !nextPassword.trim())
        return false
      if (!verifyPassword(oldPassword, user.password))
        return false
      user.password = normalizePasswordForStorage(nextPassword.trim())
      this.saveUsers()
      return true
    },
    resetUserPassword(id: string, nextPassword = '123456') {
      const user = this.users.find(item => item.id === id)
      if (!user || !nextPassword.trim())
        return false
      user.password = normalizePasswordForStorage(nextPassword.trim())
      this.saveUsers()
      return true
    },
    setCurrentUser(id: string) {
      if (!this.users.some(user => user.id === id && user.enabled))
        return
      this.currentUserId = id
      localStorage.setItem(CURRENT_USER_KEY, id)
    },
  },
})
