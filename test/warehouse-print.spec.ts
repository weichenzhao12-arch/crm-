import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeliveryPrint from '../src/features/warehouse/DeliveryPrint.vue'
import type { Order } from '../src/features/warehouse/model'

const order: Order = {
  id: 'FH-TEST', creator: 'owner', openedBy: '测试员', date: '2026-11-14', customerId: '', receiver: '测试客户', address: '测试地址', phone: '123', driver: '司机', driverPhone: '', plate: '', status: 'pending', reason: '',
  lines: [{ stockId: 'a', kind: 'roll', meters: 25, count: 5, packaging: '银色', price: 13, width: 2, product: { category: '景观草', code: 'KT-25', name: '休闲草', height: '25mm', stitches: '15针', gauge: '420针排', backing: '丁苯', density: '15750', dtex: '8000D', uv: '抗UV', color: '深绿' } }],
}

describe('delivery form', () => {
  it('matches the paper fields, specs, totals and blank lines', () => {
    const page = mount(DeliveryPrint, { props: { order, priced: true } })
    expect(page.get('.wh-delivery-title').text()).toBe('发货单')
    expect(page.findAll('.wh-delivery-item')).toHaveLength(5)
    for (const text of ['产品货号', '产品规格', '针排：420针排', '背胶：丁苯', '面积总计：250 ㎡', '卷数总计：5 卷', '3250.00', '签收人', '车牌号']) expect(page.text()).toContain(text)
    expect(page.text()).not.toContain('型号')
  })
  it('does not expose amounts on an unpriced copy', () => {
    const page = mount(DeliveryPrint, { props: { order, priced: false } })
    expect(page.text()).not.toContain('3250')
    expect(page.text()).not.toContain('金额合计')
  })
  it('paginates with continuous numbers and totals only on final page', () => {
    const page = mount(DeliveryPrint, { props: { order: { ...order, lines: Array(7).fill(order.lines[0]) }, priced: true } })
    expect(page.findAll('.wh-delivery-sheet')).toHaveLength(2)
    expect(page.findAll('.wh-delivery-sheet')[1]!.get('.wh-delivery-item td').text()).toBe('6')
    expect(page.findAll('.wh-delivery-sheet')[0]!.text()).not.toContain('面积总计')
    expect(page.findAll('.wh-delivery-sheet')[1]!.text()).toContain('面积总计：1750 ㎡')
  })
})
