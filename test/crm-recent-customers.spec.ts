import { describe, expect, it } from 'vitest'
import { sortCustomersByRecentActivity } from '~/features/crm/recent-customers'

describe('sortCustomersByRecentActivity', () => {
  it('puts recently updated customers before older newly-created customers', () => {
    const customers = [
      { id: 'old-created', date: '2026-06-01', createdAt: '2026-06-01T08:00:00.000Z' },
      { id: 'recent-created', date: '2026-06-02', createdAt: '2026-06-02T08:00:00.000Z' },
      { id: 'updated', date: '2026-05-20', createdAt: '2026-05-20T08:00:00.000Z', updatedAt: '2026-06-03T08:00:00.000Z' },
    ]

    expect(sortCustomersByRecentActivity(customers).map(customer => customer.id)).toEqual([
      'updated',
      'recent-created',
      'old-created',
    ])
  })

  it('falls back to the customer date when timestamps are missing', () => {
    const customers = [
      { id: 'older', date: '2026-06-01' },
      { id: 'newer', date: '2026-06-05' },
    ]

    expect(sortCustomersByRecentActivity(customers).map(customer => customer.id)).toEqual([
      'newer',
      'older',
    ])
  })
})
