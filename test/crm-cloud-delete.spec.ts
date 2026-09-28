import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudApiError, getCustomerCloudState, putCustomerCloudState } from '~/api/cloud-storage'
import { useCrmStore } from '~/stores/crm'

vi.mock('~/api/cloud-storage', () => ({
  CloudApiError: class CloudApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message)
    }
  },
  getCloudState: vi.fn(),
  putCloudState: vi.fn(async () => ({ ok: true })),
  getCustomerCloudState: vi.fn(),
  putCustomerCloudState: vi.fn(),
}))

describe('customer cloud deletion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('keeps a batch deletion after reload and rejects a stale writer', async () => {
    const remote = {
      value: [{ id: 'customer-a', name: '客户A' }, { id: 'customer-b', name: '客户B' }],
      revision: 'revision-1',
    }
    vi.mocked(getCustomerCloudState).mockImplementation(async () => structuredClone(remote))
    vi.mocked(putCustomerCloudState).mockImplementation(async (value, revision) => {
      if (revision !== remote.revision)
        throw new CloudApiError(409, '客户数据已变化')
      remote.value = value as typeof remote.value
      remote.revision = `revision-${Number(remote.revision.split('-')[1]) + 1}`
      return { ok: true, revision: remote.revision }
    })

    const crm = useCrmStore()
    await crm.loadCloudCustomers()
    expect(crm.customers).toHaveLength(2)

    expect(await crm.removeCustomers(['customer-a', 'customer-b'])).toBe(true)
    expect(remote.value).toHaveLength(0)
    await crm.loadCloudCustomers()
    expect(crm.customers).toHaveLength(0)

    remote.value = [{ id: 'customer-c', name: '另一个页面新增的客户' }]
    remote.revision = 'revision-3'
    expect(await crm.save()).toBe(false)
    expect(crm.customers.map(customer => customer.id)).toEqual(['customer-c'])
    expect(crm.saveError).toContain('其他页面修改')
  })
})
