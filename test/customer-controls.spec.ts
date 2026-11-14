import { expect, it } from 'vitest'
import type { AdminUser } from '../src/stores/admin'
import { customerControls } from '../src/features/crm/customer-controls'

function account(permissions: Partial<AdminUser['permissions']>, role: AdminUser['role'] = 'quoter', enabled = true) {
  return { role, enabled, permissions: permissions as AdminUser['permissions'] }
}

it('checks all combinations of view, transfer and delete independently', () => {
  for (const viewAllCustomers of [false, true]) {
    for (const transferCustomers of [false, true]) {
      for (const deleteCustomers of [false, true]) {
        const transfer = viewAllCustomers && transferCustomers
        expect(customerControls(account({ viewAllCustomers, transferCustomers, deleteCustomers }))).toEqual({
          viewAll: viewAllCustomers,
          transfer,
          remove: deleteCustomers,
          select: transfer || deleteCustomers,
        })
      }
    }
  }
})

it('does not turn account administration into customer transfer permission', () => {
  expect(customerControls(account({ manageUsers: true, viewAllCustomers: true })).transfer).toBe(false)
})

it('blocks mutation by disabled and read-only accounts even with stale grants', () => {
  const grants = { viewAllCustomers: true, transferCustomers: true, deleteCustomers: true }
  expect(customerControls(account(grants, 'viewer')).select).toBe(false)
  expect(customerControls(account(grants, 'owner', false))).toEqual({
    viewAll: false, transfer: false, remove: false, select: false,
  })
})
