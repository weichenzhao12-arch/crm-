import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import Workshop from '../src/local-test/Workshop.vue'
import { balances, post, shipmentStatus } from '../src/local-test/inventory'
import type { Movement } from '../src/local-test/inventory'

it.each([
  { label: 'bound CRM customer', name: 'Test Customer', customerId: 'c', bound: true },
  { label: 'suggested CRM customer', name: 'Test Customer', customerId: 'c', bound: false },
  { label: 'walk-in recipient', name: 'Walk-in', customerId: undefined, bound: false },
])('previews and posts once for a $label', async ({ name, customerId, bound }) => {
  const key = 'crm-isolated-sample-lab-v1'
  const sample = { id: 's', product: 'Test Turf', spec: '20×30', location: 'A', minimum: 5, height: '20 mm', needleRow: '3/8', backing: 'PU' }
  const receipt = { id: 'in', kind: 'receipt', customer: '', reason: 'Test', time: 'test', lines: [{ sample, quantity: 3 }] }
  localStorage.setItem(key, JSON.stringify({ samples: [sample], entries: [receipt] }))
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1 })
  const page = mount(Workshop, { props: {
    customerId: bound ? customerId : undefined, customerName: bound ? name : undefined,
    customerOptions: [{ id: 'c', name: 'Test Customer' }],
    operatorName: '测试开单员',
  } })
  try {
    const button = (label: string) => page.findAll('button').find(item => item.text() === label)!
    if (!bound) {
      await button('开单').trigger('click')
      expect(page.find('dialog.stock-order-dialog').exists()).toBe(true)
      await page.get('input[placeholder="选择客户或输入领取人"]').setValue(name)
    }
    else await button('选样').trigger('click')
    await page.get('input[type=checkbox]').setValue(true)
    const needleFilter = page.findAll('label').find(label => label.text().startsWith('针排'))!.get('select')
    await needleFilter.setValue('3/8')
    expect(page.text()).toContain('PU')
    await page.get('input[type=search]').setValue('no match')
    expect(page.text()).toContain('没有符合条件的样品')
    await button('清除筛选').trigger('click')
    expect((page.get('input[type=checkbox]').element as HTMLInputElement).checked).toBe(true)
    if (bound) {
      await page.findAll('form')[0]!.trigger('submit')
      expect(page.get('section[aria-label="寄样单预览"]').text()).toContain(name)
      expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(1)
      expect(print).not.toHaveBeenCalled()
      await button('返回修改').trigger('click')
      expect((page.get('input[type=checkbox]').element as HTMLInputElement).checked).toBe(true)
      await page.findAll('form')[0]!.trigger('submit')
      await button('确认出库并打印').trigger('click')
    }
    else {
      await button('打印').trigger('click')
      expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(1)
      expect(page.get('.print h1').text()).toBe('样品单')
      expect(page.get('.print').text()).toContain(`名称：${name}`)
      expect(page.get('.print').text()).toContain('开单人：测试开单员')
      expect(page.get('.print').text()).not.toContain('拿样')
      await page.get('dialog.stock-order-dialog form').trigger('submit')
      expect(page.find('dialog.stock-order-dialog').exists()).toBe(false)
      expect(page.text()).toContain('出库成功，库存已扣减')
      await button('单据查询').trigger('click')
    }
    const { entries } = JSON.parse(localStorage.getItem(key)!)
    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({ kind: 'issue', customer: name, lines: [{ quantity: 1 }] })
    expect(entries[1].customerId).toBe(customerId)
    expect(entries[1].openedBy).toBe('测试开单员')
    expect(balances(entries, 's').stock).toBe(2)
    expect(print).toHaveBeenCalledTimes(1)
    await button('打印内部单').trigger('click')
    expect(print).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(2)
  }
  finally {
    page.unmount()
    print.mockRestore()
    vi.unstubAllGlobals()
    localStorage.removeItem(key)
  }
})

it('reconciles six-item receipts, three-item orders, cancellation, dispatch and partial returns', () => {
  const samples = Array.from({ length: 6 }, (_, index) => ({
    id: String(index), product: `Turf ${index}`, spec: '20x30', location: 'A', minimum: 5,
  }))
  const receipt: Movement = { id: 'in', kind: 'receipt', customer: '', reason: 'New batch', time: '', lines: samples.map(sample => ({ sample, quantity: 5 })) }
  const order: Movement = {
    ...receipt, id: 'out', kind: 'issue', customer: 'Customer A', customerId: 'a', requiresDispatch: true,
    lines: receipt.lines.slice(0, 3).map(line => ({ ...line, quantity: 2 })),
  }
  const returned: Movement = { ...order, id: 'return', kind: 'return', original: 'out', lines: [{ sample: samples[0]!, quantity: 1 }] }
  const cancel: Movement = { ...order, id: 'cancel', kind: 'cancel', original: 'out', reason: 'Customer cancelled', lines: [] }
  const dispatch: Movement = { ...cancel, id: 'dispatch', kind: 'dispatch', tracking: 'TEST-TRACKING' }
  const quantities = (entries: Movement[]) => samples.map(sample => balances(entries, sample.id).stock)
  const received = post([], receipt)
  expect(quantities(received)).toEqual([5, 5, 5, 5, 5, 5])
  const issued = post(received, order)
  expect(quantities(issued)).toEqual([3, 3, 3, 5, 5, 5])
  expect(() => post(issued, returned)).toThrow('未寄出')
  const cancelled = post(issued, cancel)
  expect(quantities(cancelled)).toEqual(quantities(received))
  expect(shipmentStatus(cancelled, 'out')).toBe('cancelled')
  expect(() => post(cancelled, { ...cancel, id: 'again' })).toThrow()
  expect(() => post(cancelled, dispatch)).toThrow()
  const dispatched = post(issued, dispatch)
  expect(shipmentStatus(dispatched, 'out')).toBe('sent')
  expect(quantities(dispatched)).toEqual(quantities(issued))
  expect(() => post(dispatched, cancel)).toThrow()
  const afterReturn = post(dispatched, returned)
  expect(quantities(afterReturn)).toEqual([4, 3, 3, 5, 5, 5])
  expect(() => post(afterReturn, { ...returned, id: 'extra', lines: [{ sample: samples[0]!, quantity: 2 }] })).toThrow()
})
