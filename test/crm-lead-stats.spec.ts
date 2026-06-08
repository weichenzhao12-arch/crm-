import { describe, expect, it } from 'vitest'
import { dailyLeadCreationSeries } from '~/features/crm/stats'

describe('crm lead creation stats', () => {
  it('splits daily new leads into assigned and self-created buckets', () => {
    const customers = [
      { date: '2026-06-06', createdByUserId: 'owner', assignedToUserId: 'sales-1' },
      { date: '2026-06-06', createdByUserId: 'sales-1', assignedToUserId: 'sales-1' },
      { date: '2026-06-07', createdByUserId: 'owner', assignedToUserId: 'sales-2' },
    ]

    expect(dailyLeadCreationSeries(customers, 'all', '2026-06-05', 3).map(item => item.count)).toEqual([0, 2, 1])
    expect(dailyLeadCreationSeries(customers, 'assigned', '2026-06-05', 3).map(item => item.count)).toEqual([0, 1, 1])
    expect(dailyLeadCreationSeries(customers, 'self', '2026-06-05', 3).map(item => item.count)).toEqual([0, 1, 0])
  })
})
