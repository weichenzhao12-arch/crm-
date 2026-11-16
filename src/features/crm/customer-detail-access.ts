import type { AdminUser } from '../../stores/admin'

export function customerDetailAccess(user: AdminUser | undefined, customer: { assignedToUserId?: string, owner?: string } | undefined) {
  const owner = user?.enabled === true && user.role === 'owner'
  const self = Boolean(user?.enabled && customer && (customer.assignedToUserId
    ? customer.assignedToUserId === user.id
    : [user.id, user.account, user.displayName].filter(Boolean).includes(customer.owner?.trim() || '')))
  return { edit: Boolean(customer && (owner || (self && user?.role !== 'viewer'))), assign: Boolean(customer && owner) }
}
