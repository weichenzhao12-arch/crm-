import { describe, expect, it } from 'vitest'
import { isSalesUser } from '~/stores/admin'

describe('sales account classification', () => {
  it('excludes the owner account and read-only viewers from sales statistics', () => {
    expect(isSalesUser({ enabled: true, role: 'owner' })).toBe(false)
    expect(isSalesUser({ enabled: true, role: 'viewer' })).toBe(false)
  })

  it('includes enabled managers and sales quote accounts', () => {
    expect(isSalesUser({ enabled: true, role: 'manager' })).toBe(true)
    expect(isSalesUser({ enabled: true, role: 'quoter' })).toBe(true)
    expect(isSalesUser({ enabled: false, role: 'quoter' })).toBe(false)
  })
})
