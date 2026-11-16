import { describe, expect, it } from 'vitest'
import { validateHierarchy, type HierarchyPerson } from '../src/features/personnel/hierarchy'

describe('personnel hierarchy', () => {
  const people = (): HierarchyPerson[] => [
    { id: 'a', enabled: true, permissions: { position: 'director' } },
    { id: 'b', enabled: true, permissions: { position: 'supervisor', supervisorId: 'a' } },
    { id: 'c', enabled: true, permissions: { position: 'sales', supervisorId: 'b' } },
  ]
  it('supports director, supervisor and sales without granting action permissions', () => {
    expect(validateHierarchy(people())).toBe('')
  })
  it('rejects self-reference and circular reporting', () => {
    const rows = people()
    rows[0]!.permissions!.supervisorId = 'a'
    expect(validateHierarchy(rows)).not.toBe('')
    rows[0]!.permissions!.supervisorId = 'b'
    expect(validateHierarchy(rows)).not.toBe('')
  })
  it('rejects missing, disabled and non-management supervisors', () => {
    for (const id of ['missing', 'c']) {
      const rows = people()
      rows[0]!.permissions!.supervisorId = id
      expect(validateHierarchy(rows)).not.toBe('')
    }
    const rows = people()
    rows[0]!.enabled = false
    expect(validateHierarchy(rows)).not.toBe('')
  })
})
