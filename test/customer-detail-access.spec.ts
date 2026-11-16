import { mount } from '@vue/test-utils'
import { computed, nextTick, ref, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { customerDetailAccess } from '../src/features/crm/customer-detail-access'
import CustomerDetail from '../src/pages/crm/customer/[id].vue'
import { useAdminStore } from '../src/stores/admin'
import type { AdminUser } from '../src/stores/admin'
import { normalizeCustomer, useCrmStore } from '../src/stores/crm'

const actor = (role = 'manager', enabled = true) => ({ id: 'self', account: 'sales', displayName: 'Sales Person', role, enabled, permissions: { customerScope: 'team', position: 'director' } }) as AdminUser
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('requires enabled owner or nonviewer self, with names used only for legacy unassigned rows', () => {
  expect(customerDetailAccess(actor(), { assignedToUserId: 'other', owner: 'Sales Person' })).toEqual({ edit: false, assign: false })
  expect(customerDetailAccess(actor(), { assignedToUserId: 'self' })).toEqual({ edit: true, assign: false })
  expect(customerDetailAccess(actor(), { owner: ' Sales Person ' }).edit).toBe(true)
  expect(customerDetailAccess(actor('viewer'), { assignedToUserId: 'self' }).edit).toBe(false)
  expect(customerDetailAccess(actor('owner', false), { assignedToUserId: 'other' }).edit).toBe(false)
  expect(customerDetailAccess(actor('owner'), { assignedToUserId: 'other' })).toEqual({ edit: true, assign: true })
  expect(customerDetailAccess(undefined, { owner: 'Sales Person' }).edit).toBe(false)
})

it('keeps team detail read-only and navigation usable, guarding handlers as well as controls', async () => {
  setActivePinia(createPinia())
  for (const [key, value] of Object.entries({ computed, ref, watch, useRoute: () => ({ params: { id: 'c' }, query: {} }), useRouter: () => ({ push: vi.fn() }), onBeforeRouteLeave: vi.fn() })) vi.stubGlobal(key, value)
  const admin = useAdminStore()
  admin.users = [actor()]
  admin.currentUserId = 'self'
  const crm = useCrmStore()
  crm.customers = [normalizeCustomer({ id: 'c', assignedToUserId: 'other', name: 'Team customer', followUps: [
    { id: 'f', date: '2026-11-16', content: 'History', nextAction: '' },
    { id: 'r', date: '2026-11-16', content: 'Reminder', nextAction: '', reminderDate: '2026-11-17' },
  ], quotes: [{ id: 'q', date: '2026-11-16', title: 'Quote', amount: 100, status: 'quoted' }] })]
  const save = vi.spyOn(crm, 'save').mockResolvedValue(true)
  const add = vi.spyOn(crm, 'addFollowUp')
  const page = mount(CustomerDetail)
  try {
    expect(page.findAll('.customer-form input,.customer-form select,.customer-form textarea,.follow-row input,.follow-row textarea,.reminder-edit-row input,.reminder-edit-row textarea').every(control => control.attributes('disabled') !== undefined)).toBe(true)
    const before = JSON.stringify(crm.customers)
    const vm = page.vm as any
    vm.save()
    vm.addFollowUp()
    vm.openReminderModal()
    vm.deleteFollowUp(crm.customers[0]!.followUps[0])
    vm.setWonQuote(crm.customers[0]!.quotes[0])
    vm.clearWonQuote(crm.customers[0]!.quotes[0])
    vm.updateDealAmount(crm.customers[0]!.quotes[0], { target: { value: '200' } })
    await vm.saveReminder()
    expect(JSON.stringify(crm.customers)).toBe(before)
    expect(save).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    const quoteTab = page.findAll('.activity-tabs button').find(button => button.text() === '报价记录')!
    expect(quoteTab.attributes('disabled')).toBeUndefined()
    await quoteTab.trigger('click')
    expect(page.find('.record-row').exists()).toBe(true)
    expect(page.findAll('.deal-box input').every(control => control.attributes('disabled') !== undefined)).toBe(true)
    crm.customers[0]!.assignedToUserId = 'self'
    await nextTick()
    expect(page.get('.customer-form input').attributes('disabled')).toBeUndefined()
    expect(page.get('.customer-form select').attributes('disabled')).toBeDefined()
    admin.users[0]!.role = 'owner'
    await nextTick()
    expect(page.get('.customer-form select').attributes('disabled')).toBeUndefined()
  }
  finally { page.unmount() }
})
