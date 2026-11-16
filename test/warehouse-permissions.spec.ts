import { describe, expect, it } from 'vitest'
import { warehouseAccess } from '../src/features/warehouse/model'

describe('granular warehouse permissions', () => {
  it('does not grant access to other orders through printing alone', () => {
    const access = warehouseAccess({ enabled: true, role: 'viewer', permissions: { warehousePrint: true } })
    expect(access.print).toBe(true)
    expect(access.allOrders).toBe(false)
  })
  it('separates receiving, issuing, visibility and new specifications', () => {
    const access = warehouseAccess({ enabled: true, role: 'viewer', permissions: { warehouseReceive: true } })
    expect(access.enter).toBe(true)
    expect(access.stock).toBe(true)
    expect(access.receive).toBe(true)
    for (const flag of ['issue', 'visibility', 'addSpec', 'ship', 'returnStock', 'cancelAny', 'sales', 'price', 'viewPrice', 'print'] as const) expect(access[flag]).toBe(false)
  })
  it('does not bundle dangerous permissions into shipping when explicitly denied', () => {
    const access = warehouseAccess({ enabled: true, role: 'viewer', permissions: { warehouseOnly: true, warehouseShip: true, warehouseCreate: false, warehousePick: false, warehouseReturn: false, warehouseCancelAny: false, warehouseAllOrders: false } })
    expect(access.only).toBe(true)
    expect(access.ship).toBe(true)
    for (const flag of ['sales', 'pick', 'returnStock', 'cancelAny', 'allOrders', 'price'] as const) expect(access[flag]).toBe(false)
  })
  it('requires both viewing prices and printing to print priced copies', () => {
    const user = { enabled: true, role: 'viewer', permissions: { warehousePrintPrice: true } }
    expect(warehouseAccess(user).printPrice).toBe(false)
    expect(warehouseAccess({ ...user, permissions: { ...user.permissions, warehousePrint: true } }).printPrice).toBe(false)
    expect(warehouseAccess({ ...user, permissions: { ...user.permissions, warehousePrint: true, warehouseViewPrice: true } }).printPrice).toBe(true)
  })
  it('keeps disabled accounts inactive even when holding grants', () => {
    const access = warehouseAccess({ enabled: false, role: 'owner', permissions: { warehouseOnly: true, warehouseShip: true } })
    expect(Object.values(access).some(Boolean)).toBe(false)
  })
  it('requires creating orders before entering prices', () => {
    const access = warehouseAccess({ enabled: true, role: 'viewer', permissions: { warehouseEnterPrice: true } })
    expect(access.sales).toBe(false)
    expect(access.price).toBe(false)
  })
})
