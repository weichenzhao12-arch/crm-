import { expect, it } from 'vitest'
import { claimDailyReminder, dueReminderGroups, reminderCustomers } from '~/features/crm/due-reminders'
import type { AdminUser } from '~/stores/admin'
import type { CrmCustomer } from '~/stores/crm'

it('groups due reminders without exposing another sales account or altering completion', () => {
  const user = { id: 'a', account: 'sales-a', displayName: 'Sales A', enabled: true, role: 'quoter', permissions: {} } as AdminUser
  const customer = {
    id: 'customer-a', assignedToUserId: 'a', owner: 'Sales A', followUps: [
      { id: 'today', reminderDate: '2026-11-09', reminderDone: false },
      { id: 'late', reminderDate: '2026-11-08', reminderDone: false },
      { id: 'future', reminderDate: '2026-11-10', reminderDone: false },
      { id: 'done', reminderDate: '2026-11-09', reminderDone: true },
    ],
  } as CrmCustomer
  const other = { ...customer, id: 'customer-b', assignedToUserId: 'b' }
  const scope = reminderCustomers([customer, other], user)
  expect(scope.map(item => item.id)).toEqual(['customer-a'])
  expect(dueReminderGroups(scope, '2026-11-09').map(group => group.entries.map(item => item.reminder.id))).toEqual([['today'], ['late']])
  expect(customer.followUps[0]?.reminderDone).toBe(false)
  expect(reminderCustomers([customer, other], { ...user, role: 'owner' })).toHaveLength(2)
})

it('claims the popup once per account and business date', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  expect(claimDailyReminder(storage, 'a', '2026-11-09')).toBe(true)
  expect(claimDailyReminder(storage, 'a', '2026-11-09')).toBe(false)
  expect(claimDailyReminder(storage, 'b', '2026-11-09')).toBe(true)
  expect(claimDailyReminder(storage, 'a', '2026-11-10')).toBe(true)
})
