export type CustomerScope = 'own' | 'team' | 'all'

export interface CustomerScopeUser {
  id: string
  enabled: boolean
  departmentId?: string
  permissions?: {
    position?: string
    supervisorId?: string
    customerScope?: CustomerScope
    viewAllCustomers?: boolean
    managedDepartmentIds?: readonly string[]
  }
}

export interface CustomerScopeFlags {
  allowTeamScope?: boolean
}

/** Trusted directory permissions only; actor and flags cannot supply grants. */
export function getAllowedCustomerUserIds(
  users: readonly CustomerScopeUser[],
  actor: string | { id: string } | null | undefined,
  flags: CustomerScopeFlags = {},
): string[] {
  const byId = new Map<string, CustomerScopeUser>()
  const duplicates = new Set<string>()
  for (const user of users) {
    if (!user.id) continue
    if (byId.has(user.id)) duplicates.add(user.id)
    byId.set(user.id, user)
  }
  for (const id of duplicates) byId.delete(id)
  const current = byId.get(typeof actor === 'string' ? actor : actor?.id || '')
  if (!current || current.enabled !== true) return []
  const permission = current.permissions
  if (permission?.viewAllCustomers === true || permission?.customerScope === 'all') return [...byId.keys()]
  const own = [current.id]
  const manager = (user: CustomerScopeUser) => ['supervisor', 'director'].includes(user.permissions?.position || '')
  if (permission?.customerScope !== 'team' || flags.allowTeamScope === false || !manager(current)) return own
  const departments = new Set(current.departmentId ? [current.departmentId] : [])
  if (permission.position === 'director' && Array.isArray(permission.managedDepartmentIds)) {
    for (const id of permission.managedDepartmentIds) if (typeof id === 'string' && id) departments.add(id)
  }
  // Validate the entire ancestry, including above the actor, to reject cycles.
  function validAncestry(user: CustomerScopeUser): boolean {
    const seen = new Set<string>()
    let node = user
    while (true) {
      if (seen.has(node.id) || node.enabled !== true) return false
      seen.add(node.id)
      const parentId = node.permissions?.supervisorId
      if (!parentId) return true
      const parent = byId.get(parentId)
      if (!parent || !manager(parent)) return false
      node = parent
    }
  }
  if (!validAncestry(current)) return own
  for (const user of byId.values()) {
    if (user.id === current.id || !validAncestry(user)) continue
    let node = user
    while (node.id !== current.id) {
      if (!node.departmentId || !departments.has(node.departmentId)) break
      const parent = byId.get(node.permissions?.supervisorId || '')
      if (!parent) break
      node = parent
    }
    if (node.id === current.id) own.push(user.id)
  }
  return own
}
