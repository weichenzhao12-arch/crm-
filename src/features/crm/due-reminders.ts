import type { AdminUser } from '../../stores/admin'
import type { CrmCustomer } from '../../stores/crm'

export function reminderCustomers(customers: CrmCustomer[], user?: AdminUser) {
  if (!user?.enabled) return []
  const names = [user.displayName, user.account, user.id].map(name => name.trim()).filter(Boolean)
  return customers.filter(row => row.assignedToUserId
    ? row.assignedToUserId === user.id
    : names.includes(row.owner?.trim()))
}

export function dueReminderGroups(customers: CrmCustomer[], day: string) {
  const entries = customers.flatMap(customer => customer.followUps
    .filter(reminder => !reminder.reminderDone && reminder.reminderDate && reminder.reminderDate <= day)
    .map(reminder => ({ customer, reminder })))
    .sort((a, b) => `${a.reminder.reminderDate} ${a.reminder.reminderTime || ''}`.localeCompare(`${b.reminder.reminderDate} ${b.reminder.reminderTime || ''}`))
  return [
    { key: 'today', label: '今日待办', entries: entries.filter(item => item.reminder.reminderDate === day) },
    { key: 'overdue', label: '逾期未完成', entries: entries.filter(item => item.reminder.reminderDate !== day) },
  ]
}

export function claimDailyReminder(storage: Pick<Storage, 'getItem' | 'setItem'>, userId: string, day: string) {
  const key = `crm-due-reminder-shown:${userId}`
  if (storage.getItem(key) === day) return false
  storage.setItem(key, day)
  return true
}
