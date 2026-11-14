import type { AdminUser } from '../../stores/admin'

export function customerControls(user?: Pick<AdminUser, 'role' | 'enabled' | 'permissions'>) {
  const enabled = user?.enabled === true
  const privileged = enabled && (user.role === 'owner' || user.role === 'manager')
  const viewAll = enabled && (privileged || user.permissions.viewAllCustomers === true)
  const canWrite = enabled && user.role !== 'viewer'
  const transfer = canWrite && viewAll && (privileged || user.permissions.transferCustomers === true)
  const remove = canWrite && (privileged || user.permissions.deleteCustomers === true)
  return { viewAll, transfer, remove, select: transfer || remove }
}
