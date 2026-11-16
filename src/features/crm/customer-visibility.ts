import type { AdminUser } from '../../stores/admin'
import { getAllowedCustomerUserIds } from '../personnel/scope'
import { customerControls } from './customer-controls'

export function visibleCustomerUsers(users: readonly AdminUser[], actor?: AdminUser) {
  return new Set(getAllowedCustomerUserIds(users, actor))
}

export function visibleCustomerRows<T extends { assignedToUserId?: string, owner?: string }>(rows: readonly T[], users: readonly AdminUser[], actor?: AdminUser): T[] {
  if (!actor?.enabled) return []
  if (customerControls(actor).viewAll) return [...rows]
  const ids = visibleCustomerUsers(users, actor)
  const names = [actor.id, actor.account, actor.displayName].filter(Boolean)
  return rows.filter(row => row.assignedToUserId ? ids.has(row.assignedToUserId) : names.includes(row.owner?.trim() || ''))
}
