import { expect, it } from 'vitest'
import { positionPreset } from '../src/features/personnel/presets'
import type { AdminPermission } from '../src/stores/admin'
import { warehouseAccess } from '../src/features/warehouse/model'

it('resets dangerous overrides without granting global access by rank', () => {
  for (const position of ['director', 'supervisor', 'sales'] as const) {
    const result = positionPreset(position, { manageUsers: true, costCalculation: true, viewAllCustomers: true, deleteCustomers: true, warehouseOnly: true, supervisorId: 'boss', customerScope: 'team', managedDepartmentIds: ['sales-two'] } as AdminPermission)
    expect(result).toMatchObject({ manageUsers: false, costCalculation: false, viewAllCustomers: false, deleteCustomers: false, warehouseOnly: false, supervisorId: 'boss', exportQuote: true })
    const access = warehouseAccess({ enabled: true, role: 'manager', permissions: result })
    expect(access.print).toBe(true)
    expect(access.allOrders).toBe(false)
    expect(access.returnStock).toBe(false)
    expect(access.cancelAny).toBe(false)
    expect(result.customerScope).toBeUndefined()
    expect(result.managedDepartmentIds).toBeUndefined()
  }
})
it('isolates warehouse and does not expose prices or customer exports', () => {
  const result = positionPreset('warehouse', { warehouseViewPrice: true, exportCustomers: true } as AdminPermission)
  expect(result).toMatchObject({ warehouseOnly: true, warehouseAllOrders: true, warehouseViewPrice: false, exportCustomers: false, supervisorId: '' })
})
