import { customerControls } from './customer-controls'
import type { AdminUser } from '../../stores/admin'
import type { CrmCustomer } from '../../stores/crm'

export function quoteCustomers(customers: CrmCustomer[], user?: AdminUser) {
  if (!user?.enabled || user.role === 'viewer') return []
  const names = [user.displayName, user.account, user.id].map(name => name.trim()).filter(Boolean)
  return customers.filter(row => customerControls(user).viewAll || row.assignedToUserId === user.id
    || (!row.assignedToUserId && names.includes(row.owner.trim())))
}
