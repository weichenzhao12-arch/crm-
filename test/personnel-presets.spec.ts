import { expect, it } from 'vitest'
import { positionPreset } from '../src/features/personnel/presets'
import type { AdminPermission } from '../src/stores/admin'

it('resets dangerous overrides without granting global access by rank', () => {
  for (const position of ['director', 'supervisor', 'sales'] as const) {
    const result = positionPreset(position, { manageUsers: true, costCalculation: true, viewAllCustomers: true, deleteCustomers: true, warehouseOnly: true, supervisorId: 'boss' } as AdminPermission)
    expect(result).toMatchObject({ manageUsers: false, costCalculation: false, viewAllCustomers: false, deleteCustomers: false, warehouseOnly: false, supervisorId: 'boss', exportQuote: true })
  }
})
it('isolates warehouse and does not expose prices or customer exports', () => {
  const result = positionPreset('warehouse', { warehouseViewPrice: true, exportCustomers: true } as AdminPermission)
  expect(result).toMatchObject({ warehouseOnly: true, warehouseAllOrders: true, warehouseViewPrice: false, exportCustomers: false, supervisorId: '' })
})
