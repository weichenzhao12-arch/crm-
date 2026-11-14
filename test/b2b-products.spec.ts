import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import B2BProductsPage from '../src/local-test/B2BProductsPage.vue'

const { saveQuoteRecord, save } = vi.hoisted(() => ({ saveQuoteRecord: vi.fn(), save: vi.fn(async () => true) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { customerId: 'customer-a' } }) }))
vi.mock('~/stores/admin', () => ({ useAdminStore: () => ({ currentUser: { enabled: true, role: 'owner', id: 'owner', displayName: 'Owner', account: 'admin', permissions: {} } }) }))
vi.mock('~/stores/crm', () => ({
  useCrmStore: () => ({ cloudLoadState: 'ready', customers: [{ id: 'customer-a', name: '客户甲' }], loadCloudCustomers: async () => {}, saveQuoteRecord, save }),
}))

vi.mock('~/stores/quote', () => ({
  useQuoteStore: () => ({
    pricing: { products: [
      { id: 'a', model: 'A-01', category: '运动草', height: '30 mm', needleRow: '3/8' },
      { id: 'b', model: 'B-01', category: '景观草', height: '40 mm', needleRow: '5/8' },
    ] },
    loadCloudPricing: async () => {},
  }),
}))

it('keeps products selected across specification filters', async () => {
  const page = mount(B2BProductsPage, { global: { stubs: ['RouterLink'] } })
  await Promise.resolve()
  const height = page.findAll('label').find(label => label.text().startsWith('草高'))!.get('select')
  await height.setValue('30 mm')
  expect(page.findAll('tbody tr')).toHaveLength(1)
  await page.get('input[aria-label="选择 A-01"]').setValue(true)
  await page.get('input[aria-label="A-01 每平方米报价"]').setValue('12.5')
  await height.setValue('40 mm')
  await page.get('input[aria-label="选择 B-01"]').setValue(true)
  const preview = () => page.findAll('button').find(button => button.text() === '预览报价')!
  expect(preview().attributes('disabled')).toBeDefined()
  await page.get('input[aria-label="B-01 每平方米报价"]').setValue('21.08')
  await page.get('.selection-bar input').setValue(true)
  expect(page.findAll('tbody tr')).toHaveLength(2)
  expect(page.text()).toContain('已选 2 款')
  expect(page.text()).not.toContain('库存状态')
  expect(page.text()).not.toContain('裁样规格')
  await preview().trigger('click')
  expect(page.get('h1').text()).toBe('报价单')
  expect(page.findAll('tbody tr').map(row => row.text())).toEqual([
    expect.stringContaining('12.50'), expect.stringContaining('21.08'),
  ])
  expect(page.get('thead').text()).toContain('抗老化')
  expect(page.get('thead').text()).toContain('针排')
  expect(page.text()).toContain('客户甲')
  expect(saveQuoteRecord).not.toHaveBeenCalled()
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  try {
    await page.findAll('button').find(button => button.text() === '导出 PDF')!.trigger('click')
    expect(print).toHaveBeenCalledOnce()
    expect(saveQuoteRecord).not.toHaveBeenCalled()
  }
  finally {
    print.mockRestore()
  }
  await page.findAll('button').find(button => button.text() === '保存报价')!.trigger('click')
  expect(saveQuoteRecord).toHaveBeenCalledWith('customer-a', expect.objectContaining({
    snapshot: { kind: 'standard', rows: [
      expect.objectContaining({ name: 'A-01', unitPrice: 12.5, specs: expect.stringContaining('针排：3/8') }),
      expect.objectContaining({ name: 'B-01', unitPrice: 21.08 }),
    ] },
  }), false)
  expect(save).toHaveBeenCalledOnce()
  page.unmount()
})
