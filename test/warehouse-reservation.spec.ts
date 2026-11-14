import { describe, expect, it } from 'vitest'
import { availableStock, moveStock, planLines, snapshotLine } from '../src/features/warehouse/model'
import type { Stock, Order } from '../src/features/warehouse/model'

const stock: Stock = { id: 's', category: '景观草', code: 'KT', name: '草坪', height: '', stitches: '', gauge: '', backing: '', density: '', dtex: '', uv: '', color: '', width: 2, length: 25, rolls: 1, remnants: { 7: 1 }, visible: true }
const line = (kind: 'roll' | 'cut' | 'remnant', meters = 25) => snapshotLine(stock, { stockId: 's', kind, meters, count: 1, packaging: '', price: null })
const order = (status: Order['status'] = 'pending'): Order => ({ id: 'o', creator: 'a', openedBy: '', date: '', customerId: '', receiver: '', address: '', phone: '', driver: '', driverPhone: '', plate: '', status, reason: '', lines: [line('cut', 7), line('remnant', 7)] })

describe('warehouse reservations', () => {
  const meters = (length: number, count = 1) => ({ stockId: 's', kind: 'meter' as const, meters: length, count, packaging: '', price: null })
  it('uses exact remnants before cutting a full roll', () => {
    const plan = planLines([stock], [meters(7, 2)])
    expect(plan.map(line => [line.kind, line.count])).toEqual([['remnant', 1], ['cut', 1]])
    const next = moveStock([stock], plan)[0]!
    expect(next.rolls).toBe(0)
    expect(next.remnants).toEqual({ 18: 1 })
    const free = availableStock([stock], [{ ...order(), lines: plan }])[0]!
    expect(free.rolls).toBe(0)
    expect(free.remnants).toEqual({})
  })
  it('cuts the smallest fitting remnant and returns only the shipped cut length', () => {
    const source = { ...stock, remnants: { 10: 1, 18: 1 } }
    const plan = planLines([source], [meters(7)])
    expect(plan[0]!.sourceMeters).toBe(10)
    const next = moveStock([source], plan)
    expect(next[0]!.rolls).toBe(1)
    expect(next[0]!.remnants).toEqual({ 3: 1, 18: 1 })
    expect(moveStock(next, plan, true)[0]!.remnants).toEqual({ 3: 1, 7: 1, 18: 1 })
  })
  it('does not allocate hypothetical offcuts or locked sources', () => {
    expect(() => planLines([{ ...stock, remnants: {} }], [meters(7), meters(18)])).toThrow('库存不足')
    const cut = planLines([{ ...stock, remnants: {} }], [meters(7)])
    const free = availableStock([stock], [{ ...order(), lines: cut }])
    expect(() => planLines(free, [meters(8)])).toThrow('库存不足')
  })
  it('handles decimal lengths and a full-length meter request', () => {
    const source = { ...stock, remnants: {} }
    expect(moveStock([source], planLines([source], [meters(7.125)]))[0]!.remnants).toEqual({ '17.875': 1 })
    expect(planLines([source], [meters(25)])[0]!.kind).toBe('roll')
    expect(() => planLines([source], [meters(26)])).toThrow('单段米数')
    expect(() => planLines([source], [meters(0)])).toThrow('尺寸')
  })
  it('reserves a whole roll for a cut but never exposes its future offcut', () => {
    const result = availableStock([stock], [order()])[0]!
    expect(result.rolls).toBe(0)
    expect(result.remnants).toEqual({})
    expect(stock.rolls).toBe(1)
    expect(() => moveStock([result], [line('roll')])).toThrow('库存不足')
    expect(() => moveStock([result], [line('remnant', 18)])).toThrow('数量不足')
  })
  it.each(['rejected', 'cancelled', 'shipped', 'returned'] as const)('does not reserve %s orders', (status) => {
    expect(availableStock([stock], [order(status)])).toEqual([stock])
  })
  it('excludes its own lock during confirmation and aggregates repeated rows', () => {
    expect(availableStock([stock], [order()], 'o')).toEqual([stock])
    expect(() => moveStock([stock], [line('roll'), line('roll')])).toThrow('库存不足')
    expect(() => moveStock([stock], [line('remnant', 7), line('remnant', 7)])).toThrow('数量不足')
    expect(stock.rolls).toBe(1)
  })
})
