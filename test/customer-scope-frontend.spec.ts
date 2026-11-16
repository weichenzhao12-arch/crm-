import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import CustomerScopeFields from '../src/features/personnel/CustomerScopeFields.vue'
import { visibleCustomerRows } from '../src/features/crm/customer-visibility'
import { customerControls } from '../src/features/crm/customer-controls'
import { reminderCustomers } from '../src/features/crm/due-reminders'
import { validateHierarchy } from '../src/features/personnel/hierarchy'
import { useAdminStore } from '../src/stores/admin'
import type { AdminUser } from '../src/stores/admin'
import type { CrmCustomer } from '../src/stores/crm'

vi.mock('../src/api/cloud-storage', () => ({ putCloudState: vi.fn().mockResolvedValue(true), getCloudState: vi.fn(), apiFetch: vi.fn() }))
const director = (): AdminUser => ({ id: 'd', account: 'd', displayName: 'Director', enabled: true, role: 'manager', password: '', departmentId: 'a', permissions: { position: 'director', customerScope: 'team', viewAllCustomers: false } } as AdminUser)
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

it('filters team rows without granting actions or redirecting other owners reminders', () => {
  const actor = director()
  const users = [actor, { ...director(), id: 's', permissions: { position: 'sales', supervisorId: 'd' } } as AdminUser, { ...director(), id: 'peer' }]
  const rows = [{ id: 'own', assignedToUserId: 'd' }, { id: 'team', assignedToUserId: 's', owner: 'Director' }, { id: 'peer', assignedToUserId: 'peer', owner: 'Director' }] as CrmCustomer[]
  expect(visibleCustomerRows(rows, users, actor).map(row => row.id)).toEqual(['own', 'team'])
  expect(reminderCustomers(rows, actor).map(row => row.id)).toEqual(['own'])
  expect(customerControls(actor)).toEqual({ viewAll: false, transfer: false, remove: false, select: false })
  expect(actor.permissions.exportCustomers).toBeUndefined()
  delete actor.permissions.customerScope
  expect(visibleCustomerRows(rows, users, actor).map(row => row.id)).toEqual(['own'])
})

it('allows only owner-authorized scope choices and clears legacy all on narrowing', async () => {
  const user = director()
  user.permissions.viewAllCustomers = true
  const props = { user, departments: [{ id: 'a', name: 'A', enabled: true }], authorized: true }
  const page = mount(CustomerScopeFields, { props })
  await page.get('select[aria-label="客户范围"]').setValue('team')
  expect(user.permissions).toMatchObject({ customerScope: 'team', viewAllCustomers: false })
  await page.get('select[aria-label="管理部门"]').setValue(['a'])
  expect(user.permissions.managedDepartmentIds).toEqual(['a'])
  expect(page.emitted('save')).toHaveLength(2)
  await page.setProps({ authorized: false })
  expect(page.find('select').exists()).toBe(false)
  page.unmount()
})

it.each([
  { customerScope: 'bogus' }, { customerScope: [] }, { managedDepartmentIds: 'a' },
  { managedDepartmentIds: ['a', 'a'] }, { managedDepartmentIds: [''] }, { managedDepartmentIds: [1] },
  { position: 'sales', managedDepartmentIds: ['a'] }, { supervisorId: [] },
])('rejects malformed scope configuration %j on shared validation and store save', async (permissions) => {
  const user = director()
  Object.assign(user.permissions, permissions)
  expect(validateHierarchy([user])).not.toBe('')
  const store = useAdminStore()
  store.users = [user]
  expect(await store.saveUsers()).toBe(false)
  expect(store.saveError).not.toBe('')
})

it('rejects unknown or inactive managed departments before saving', async () => {
  const store = useAdminStore()
  const user = director()
  user.permissions.managedDepartmentIds = ['missing']
  store.users = [user]
  store.departments = [{ id: 'a', name: 'A', enabled: true }]
  expect(await store.saveUsers()).toBe(false)
})

it('allows unrelated saves before departments load and preserves existing inactive department references', async () => {
  const store = useAdminStore()
  const user = director()
  user.permissions.managedDepartmentIds = ['a']
  store.users = [user]
  expect(await store.saveUsers()).toBe(true)
  store.departments = [{ id: 'a', name: 'A', enabled: false }]
  user.displayName = 'Updated director'
  expect(await store.saveUsers()).toBe(true)
  store.departments.push({ id: 'b', name: 'B', enabled: false })
  user.permissions.managedDepartmentIds = ['a', 'b']
  expect(await store.saveUsers()).toBe(false)
})
