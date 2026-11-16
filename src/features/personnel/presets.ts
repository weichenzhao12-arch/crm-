import type { AdminPermission } from '~/stores/admin'
import type { Position } from './hierarchy'
import { warehousePermissionFields } from '../warehouse/model'

export function positionPreset(position: Position, previous: AdminPermission): AdminPermission {
  const permissions = Object.fromEntries(Object.entries(previous).filter(([, value]) => typeof value === 'boolean').map(([key]) => [key, false])) as unknown as AdminPermission
  for (const [key] of warehousePermissionFields) permissions[key] = false
  permissions.position = position
  permissions.supervisorId = previous.supervisorId || ''
  if (['sales', 'supervisor', 'director'].includes(position)) {
    Object.assign(permissions, { exportQuote: true, issueSamples: true, warehouseRead: true, warehouseCreate: true, warehousePrint: true, warehouseEnterPrice: true, warehouseViewPrice: true, warehousePrintPrice: true })
  }
  if (position === 'clerk') {
    Object.assign(permissions, { importCustomers: true, assignUnclaimedCustomers: true, issueSamples: true, manageSampleStock: true, warehouseRead: true, warehousePrint: true })
  }
  if (position === 'warehouse') {
    permissions.supervisorId = ''
    Object.assign(permissions, { warehouseOnly: true, warehouseRead: true, warehouseReceive: true, warehouseIssue: true, warehouseCreate: true, warehousePick: true, warehouseShip: true, warehousePrint: true, warehouseAllOrders: true, warehouseHistory: true })
  }
  return permissions
}
