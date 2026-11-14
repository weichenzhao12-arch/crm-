import { describe, expect, it } from 'vitest'
import { canAccessCustomer, canTransferCustomer } from '../src/features/crm/customer-access'
import type { CustomerActor } from '../src/features/crm/customer-access'

const seller: CustomerActor = { id: 'a', scope: 'own', actions: ['read', 'edit'] }
const supervisor: CustomerActor = { id: 's', scope: 'team', teamMemberIds: ['a', 'b'], actions: ['read', 'transfer'] }

describe('customer action and scope checks', () => {
  it('restricts sales access to their own customers', () => {
    expect(canAccessCustomer(seller, 'edit', 'a')).toBe(true)
    expect(canAccessCustomer(seller, 'read', 'b')).toBe(false)
  })

  it('does not infer export, deletion or restore from read access', () => {
    for (const action of ['export', 'delete', 'restore'] as const)
      expect(canAccessCustomer(seller, action, 'a')).toBe(false)
  })

  it('requires both owners to be in scope and rejects self-transfers', () => {
    expect(canTransferCustomer(supervisor, 'a', 'b')).toBe(true)
    expect(canTransferCustomer(supervisor, 'a', 'c')).toBe(false)
    expect(canTransferCustomer(supervisor, 'a', 'a')).toBe(false)
    expect(canTransferCustomer(seller, 'a', 'b')).toBe(false)
  })
})
