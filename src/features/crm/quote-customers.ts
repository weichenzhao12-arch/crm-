import { visibleCustomerRows } from './customer-visibility'
import type { AdminUser } from '../../stores/admin'
import type { CrmCustomer } from '../../stores/crm'

export function quoteCustomers(customers: CrmCustomer[], user?: AdminUser, users: readonly AdminUser[] = user ? [user] : []) {
  if (!user?.enabled || user.role === 'viewer') return []
  return visibleCustomerRows(customers, users, user)
}
