import { describe, expect, it } from 'vitest'
import { pruneSevenDayRecords, restoreRecycleRecord } from '~/features/system/recycle'

describe('seven day recycle helpers', () => {
  it('keeps records within seven days and removes older records', () => {
    const now = '2026-06-12T00:00:00.000Z'
    const records = [
      { id: 'keep', deletedAt: '2026-06-05T00:00:00.000Z' },
      { id: 'remove', deletedAt: '2026-06-04T23:59:59.000Z' },
    ]

    expect(pruneSevenDayRecords(records, now).map(item => item.id)).toEqual(['keep'])
  })

  it('returns a restored item and removes it from recycle records', () => {
    const records = [
      { id: 'record-1', deletedAt: '2026-06-12T00:00:00.000Z', item: { id: 'customer-1', name: '客户A' } },
      { id: 'record-2', deletedAt: '2026-06-12T00:00:00.000Z', item: { id: 'customer-2', name: '客户B' } },
    ]

    const restored = restoreRecycleRecord(records, 'record-1')

    expect(restored.item).toEqual({ id: 'customer-1', name: '客户A' })
    expect(restored.records.map(item => item.id)).toEqual(['record-2'])
  })
})
