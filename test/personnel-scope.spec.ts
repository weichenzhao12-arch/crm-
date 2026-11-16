import { describe, expect, it } from 'vitest'
import { getAllowedCustomerUserIds as scope } from '../src/features/personnel/scope'
import type { CustomerScopeUser } from '../src/features/personnel/scope'

function people(): CustomerScopeUser[] {
  return [
    { id: 'd', enabled: true, departmentId: 'a', permissions: { position: 'director', customerScope: 'team' } },
    { id: 's', enabled: true, departmentId: 'a', permissions: { position: 'supervisor', supervisorId: 'd', customerScope: 'team' } },
    { id: 'a', enabled: true, departmentId: 'a', permissions: { position: 'sales', supervisorId: 's' } },
    { id: 'b', enabled: true, departmentId: 'b', permissions: { position: 'sales', supervisorId: 's' } },
    { id: 'peer', enabled: true, departmentId: 'a', permissions: { position: 'sales' } },
  ]
}

describe('explicit customer hierarchy scope', () => {
  it('requires explicit team selection, never inferring scope from rank', () => {
    const users = people()
    delete users[0]!.permissions!.customerScope
    expect(scope(users, 'd')).toEqual(['d'])
    expect(scope(users, 'a')).toEqual(['a'])
    expect(scope(users, 'missing')).toEqual([])
    expect(scope(users, null)).toEqual([])
  })
  it('includes descendants but not peers or foreign departments', () => {
    expect(scope(people(), 'd')).toEqual(['d', 's', 'a'])
    expect(scope(people(), 's')).toEqual(['s', 'a'])
    expect(scope(people(), 'd', { allowTeamScope: false })).toEqual(['d'])
  })
  it('permits only directors to extend departments explicitly, still requiring ancestry', () => {
    const users = people()
    users[0]!.permissions!.managedDepartmentIds = ['b']
    users[1]!.permissions!.managedDepartmentIds = ['b']
    expect(scope(users, 'd')).toEqual(['d', 's', 'a', 'b'])
    expect(scope(users, 's')).toEqual(['s', 'a'])
  })
  it('preserves explicit all and strict legacy true, including inactive owners', () => {
    const users = people()
    users[2]!.enabled = false
    users[0]!.permissions!.customerScope = 'all'
    expect(scope(users, 'd')).toEqual(users.map(user => user.id))
    users[0]!.permissions!.customerScope = 'own'
    users[0]!.permissions!.viewAllCustomers = true
    expect(scope(users, 'd')).toEqual(users.map(user => user.id))
    users[0]!.enabled = false
    expect(scope(users, 'd')).toEqual([])
  })
  it('uses directory permissions instead of caller-supplied actor permissions', () => {
    const actor = { id: 'a', permissions: { customerScope: 'all' } }
    expect(scope(people(), actor)).toEqual(['a'])
  })
  it.each(['d', 's', 'a', 'missing'])('fails closed for cycles and broken ancestry via %s', (parent) => {
    const users = people()
    users[0]!.permissions!.supervisorId = parent
    expect(scope(users, 'd')).toEqual(['d'])
  })
  it('rejects disabled, duplicate, non-manager and out-of-department intermediate nodes', () => {
    for (const change of ['disabled', 'duplicate', 'sales', 'department']) {
      const users = people()
      if (change === 'disabled') users[1]!.enabled = false
      if (change === 'duplicate') users.push({ ...users[1]! })
      if (change === 'sales') users[1]!.permissions!.position = 'sales'
      if (change === 'department') users[1]!.departmentId = 'b'
      expect(scope(users, 'd')).toEqual(change === 'sales' ? ['d', 's'] : ['d'])
    }
  })
  it('does not group missing departments and does not mutate inputs', () => {
    const users = people()
    delete users[0]!.departmentId
    const before = JSON.stringify(users)
    expect(scope(users, 'd')).toEqual(['d'])
    expect(JSON.stringify(users)).toBe(before)
    users.push({ ...users[0]! })
    expect(scope(users, 'd')).toEqual([])
  })
})
