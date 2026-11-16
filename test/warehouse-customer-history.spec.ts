import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import CustomerDeliveries from '../src/features/warehouse/CustomerDeliveries.vue'
import { apiFetch } from '../src/api/cloud-storage'
vi.mock('../src/api/cloud-storage', () => ({ apiFetch: vi.fn() }))

it('loads customer-linked records and reloads status without writing CRM data', async () => {
  const api = vi.mocked(apiFetch)
  api.mockResolvedValue({ orders: [{ id: 'FH-1', status: 'pending', lines: [], date: '2026-11-14', openedBy: '销售', receiver: '客户甲' }] })
  const page = mount(CustomerDeliveries, { props: { customerId: 'customer-a' } })
  try {
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/api/local-warehouse/customer-orders?customerId=customer-a')
    expect(page.text()).toContain('待出库（已锁定）')
    api.mockResolvedValue({ orders: [{ id: 'FH-1', status: 'cancelled', lines: [], reason: '客户取消' }] })
    await page.get('button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('已撤销')
    expect(page.text()).toContain('客户取消')
  }
  finally { page.unmount(); api.mockReset() }
})
