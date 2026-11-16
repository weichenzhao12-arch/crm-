import { describe, expect, it } from 'vitest'
import { stockProductKey, warehouseAccess, warehouseFields } from '../src/features/warehouse/model'
import type { Stock } from '../src/features/warehouse/model'
import { planStockImport } from '../src/features/warehouse/stock-import'
import type { StockImportRow } from '../src/features/warehouse/stock-import'

const access = warehouseAccess({ enabled: true, role: 'owner' })
function stock(overrides: Partial<Stock> = {}): Stock {
  return { ...Object.fromEntries(warehouseFields.map(([key]) => [key, ''])), id: 's1', category: 'Grass', code: 'A1', name: 'Product', width: 2, length: 25, rolls: 10, remnants: { 5: 2 }, visible: true, ...overrides } as Stock
}
function row(overrides: StockImportRow = {}): StockImportRow {
  const { id: _id, rolls: _rolls, remnants: _remnants, ...spec } = stock()
  return { ...spec, ...overrides }
}
describe('pure inventory import planner', () => {
  it('aggregates full-key matches and converts full-length remnants', () => {
    const stocks = [stock()]
    const rows = [row({ code: ' a1 ', receiveRolls: 2 }), row({ receiveRemnants: [{ meters: 25, count: 3 }, { meters: 5, count: 4 }] })]
    const before = structuredClone({ stocks, rows })
    expect(planStockImport(stocks, rows, access)).toEqual({ stocks: [stock({ rolls: 15, remnants: { 5: 6 } })], created: 0, updated: 1, receivedRolls: 5 })
    expect({ stocks, rows }).toEqual(before)
  })
  it('creates separate technical specifications, merging repeated new products', () => {
    const result = planStockImport([stock()], [row({ dtex: '12000', receiveRolls: 1 }), row({ dtex: '12000', receiveRolls: 2 })], access)
    expect(result).toMatchObject({ created: 1, updated: 0, receivedRolls: 3, stocks: [{ rolls: 3, dtex: '12000' }] })
    expect(stockProductKey(result.stocks[0]!)).not.toBe(stockProductKey(stock()))
    expect(planStockImport([stock()], [row({ dtex: '12000' })], access)).toEqual(planStockImport([stock()], [row({ dtex: '12000' })], access))
  })
  it('rejects ambiguous no-id matches and validates id specifications', () => {
    const stocks = [stock(), stock({ id: 's2' })]
    expect(() => planStockImport(stocks, [row()], access)).toThrow(/第 1 行.*提供库存 ID/)
    expect(planStockImport(stocks, [row({ id: 's2', receiveRolls: 1 })], access).stocks[0]?.id).toBe('s2')
    expect(() => planStockImport(stocks, [row({ id: 'missing' })], access)).toThrow(/ID 不存在/)
    expect(() => planStockImport(stocks, [row({ id: 's1', dtex: 'changed' })], access)).toThrow(/不可修改/)
  })
  it('ignores unchanged snapshots, honors omissions and explicit clears', () => {
    expect(planStockImport([stock()], [row()], access)).toMatchObject({ stocks: [], updated: 0, receivedRolls: 0 })
    const stocks = [stock({ remark: 'old' })]
    expect(planStockImport(stocks, [{ id: 's1' }], access).stocks).toEqual([])
    expect(planStockImport(stocks, [{ id: 's1', remark: '' }], access).stocks[0]?.remark).toBe('')
  })
  it('accepts identical explicit values and rejects conflicting duplicate metadata or visibility', () => {
    expect(planStockImport([stock()], [row({ location: ' X ' }), row({ location: 'X' })], access).updated).toBe(1)
    for (const field of ['location', 'batch', 'productionDate', 'supplier', 'remark', 'visible'] as const) {
      const a = field === 'visible' ? true : field === 'productionDate' ? '2024-02-29' : 'a'
      const b = field === 'visible' ? false : ''
      expect(() => planStockImport([stock()], [row({ [field]: a }), row({ [field]: b })], access)).toThrow(/第 2 行.*冲突/)
    }
  })
  it('enforces granular permissions while allowing unchanged exports', () => {
    const limited = { ...access, addSpec: false, receive: false, visibility: false }
    expect(planStockImport([stock()], [row()], limited).stocks).toEqual([])
    for (const input of [row({ receiveRolls: 1 }), row({ receiveRemnants: [{ meters: 5, count: 1 }] }), row({ location: 'X' }), row({ visible: false }), row({ dtex: 'new' })])
      expect(() => planStockImport([stock()], [input], limited)).toThrow(/权限/)
    expect(() => planStockImport([], [], { ...access, importStock: false })).toThrow(/批量入库权限/)
  })
  it.each([
    null, [], 'row', { extra: 1 }, { rolls: 10 }, { code: 5 }, { visible: 'true' },
    { width: Infinity }, { width: 0 }, { length: 1.2345 }, { receiveRolls: -1 }, { receiveRolls: 0.5 }, { receiveRolls: 100001 },
    { productionDate: '2023-02-29' }, { productionDate: '2024-2-29' }, { productionDate: '0000-01-01' },
    { remark: 'x'.repeat(1001) }, { supplier: 'x'.repeat(151) },
    { receiveRemnants: [null] }, { receiveRemnants: [{ meters: 26, count: 1 }] },
    { receiveRemnants: [{ meters: 5, count: 1, extra: true }] },
  ])('rejects malformed row atomically: %j', (bad) => {
    const stocks = [stock()]
    const snapshot = structuredClone(stocks)
    const input = bad && typeof bad === 'object' && !Array.isArray(bad) ? { ...row(), ...bad } : bad
    expect(() => planStockImport(stocks, [row({ receiveRolls: 1 }), input as StockImportRow], access)).toThrow(/第 2 行/)
    expect(stocks).toEqual(snapshot)
  })
  it('bounds batches and cumulative inventory', () => {
    expect(() => planStockImport([], [], access)).toThrow(/1 至 200/)
    expect(() => planStockImport([], Array.from({ length: 201 }, () => row()), access)).toThrow(/200/)
    expect(() => planStockImport([stock({ rolls: 99999 })], [row({ receiveRolls: 2 })], access)).toThrow()
    expect(() => planStockImport([stock()], [row({ receiveRemnants: [{ meters: 5, count: 99999 }] })], access)).toThrow()
  })
  it('merges id and no-id rows into one existing product in either order', () => {
    for (const rows of [[{ id: 's1', receiveRolls: 2 }, row({ receiveRolls: 3 })], [row({ receiveRolls: 3 }), { id: 's1', receiveRolls: 2 }]]) {
      expect(planStockImport([stock()], rows, access)).toMatchObject({ created: 0, updated: 1, stocks: [{ id: 's1', rolls: 15 }] })
    }
  })
})
