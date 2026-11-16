import { measurement, stockProductKey, warehouseFields, warehouseInternalFields, WarehouseError, wholeCount } from './model'
import type { Stock, warehouseAccess } from './model'

export type StockImportRow = Partial<Pick<Stock, typeof warehouseFields[number][0] | typeof warehouseInternalFields[number][0] | 'id' | 'width' | 'length' | 'visible'>> & {
  receiveRolls?: number
  receiveRemnants?: { meters: number, count: number }[]
}

const allowed = new Set<string>(['id', 'width', 'length', 'visible', 'receiveRolls', 'receiveRemnants', ...warehouseFields.map(([key]) => key), ...warehouseInternalFields.map(([key]) => key)])
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
}
function string(value: unknown, max = 150) {
  if (typeof value !== 'string' || value.length > max) throw new WarehouseError(`文本必须为字符串且不超过 ${max} 字符`)
  return value.trim()
}
function date(value: string) {
  if (!value) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new WarehouseError('生产日期必须为有效的 YYYY-MM-DD 日期')
}

/** Pure batch plan. IDs for new stocks are deterministic; persistence owns retry/idempotency. */
export function planStockImport(stocks: Stock[], rows: StockImportRow[], access: ReturnType<typeof warehouseAccess>): { stocks: Stock[], created: number, updated: number, receivedRolls: number } {
  if (!access.importStock) throw new WarehouseError('没有批量入库权限', 403)
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) throw new WarehouseError('每批必须为 1 至 200 行')
  const byKey = new Map<string, Stock[]>()
  const byId = new Map(stocks.map(stock => [stock.id, stock]))
  for (const stock of stocks) {
    const key = stockProductKey(stock)
    byKey.set(key, [...(byKey.get(key) || []), stock])
  }
  const planned = new Map<string, Stock>()
  const explicit = new Map<string, Map<string, string | boolean>>()
  const ids = new Set(stocks.map(stock => stock.id))
  let sequence = 0
  let receivedRolls = 0
  for (let index = 0; index < rows.length; index++) {
    try {
      const raw: unknown = rows[index]
      if (!object(raw)) throw new WarehouseError('导入行必须为对象')
      if (Reflect.ownKeys(raw).some(key => typeof key !== 'string' || !allowed.has(key))) throw new WarehouseError('包含未知导入字段')
      const id = hasOwn(raw, 'id') ? string(raw.id) : undefined
      if (id === '') throw new WarehouseError('库存 ID 不能为空')
      const original = id === undefined ? undefined : byId.get(id)
      if (id !== undefined && !original) throw new WarehouseError('库存 ID 不存在')
      const spec = {} as Stock
      for (const [key] of warehouseFields) spec[key] = hasOwn(raw, key) ? string(raw[key]) : original?.[key]?.trim() || ''
      for (const [field, label] of warehouseFields) if (['category', 'code', 'name'].includes(field) && !spec[field]) throw new WarehouseError(`${label}不能为空`)
      spec.width = measurement(hasOwn(raw, 'width') ? raw.width : original?.width)
      spec.length = measurement(hasOwn(raw, 'length') ? raw.length : original?.length)
      const key = stockProductKey(spec)
      if (original && stockProductKey(original) !== key) throw new WarehouseError('不可修改已有库存规格')
      const matches = byKey.get(key) || []
      if (!original && matches.length > 1) throw new WarehouseError('存在多个相同规格，请提供库存 ID')
      let target = original || matches[0]
      if (!target) {
        if (!access.addSpec) throw new WarehouseError('没有新增规格权限', 403)
        let newId: string
        do { newId = `stock-import-${++sequence}` } while (ids.has(newId))
        ids.add(newId)
        target = { ...spec, id: newId, rolls: 0, remnants: {}, visible: false }
        byKey.set(key, [target])
        planned.set(target.id, target)
      }
      const next = structuredClone(planned.get(target.id) || target)
      const values = explicit.get(target.id) || new Map<string, string | boolean>()
      const apply = (field: string, value: string | boolean) => {
        if (values.has(field) && values.get(field) !== value) throw new WarehouseError(`重复行的${field === 'visible' ? '可见性' : warehouseInternalFields.find(([key]) => key === field)?.[1] || field}冲突`)
        values.set(field, value)
      }
      for (const [field] of warehouseInternalFields) {
        if (!hasOwn(raw, field)) continue
        const value = string(raw[field], field === 'remark' ? 1000 : 150)
        if (field === 'productionDate') date(value)
        apply(field, value)
        if (value !== (target[field] || '') && !access.addSpec) throw new WarehouseError('没有修改内部资料权限', 403)
        next[field] = value
      }
      if (hasOwn(raw, 'visible')) {
        if (typeof raw.visible !== 'boolean') throw new WarehouseError('可见性必须为布尔值')
        apply('visible', raw.visible)
        if (raw.visible !== target.visible && !access.visibility) throw new WarehouseError('没有设置可见性权限', 403)
        next.visible = raw.visible
      }
      let rolls = hasOwn(raw, 'receiveRolls') ? wholeCount(raw.receiveRolls) : 0
      if (hasOwn(raw, 'receiveRemnants')) {
        if (!Array.isArray(raw.receiveRemnants) || raw.receiveRemnants.length > 200) throw new WarehouseError('零货必须为数组且不超过 200 项')
        for (const part of raw.receiveRemnants) {
          if (!object(part) || Reflect.ownKeys(part).some(key => key !== 'meters' && key !== 'count')) throw new WarehouseError('零货格式无效')
          const meters = measurement(part.meters)
          const count = wholeCount(part.count)
          if (meters > next.length) throw new WarehouseError('零货长度不能超过整卷长度')
          if (count && !access.receive) throw new WarehouseError('没有入库权限', 403)
          if (meters === next.length) rolls = wholeCount(rolls + count)
          else if (count) next.remnants[String(meters)] = wholeCount((next.remnants[String(meters)] || 0) + count)
        }
      }
      if (rolls && !access.receive) throw new WarehouseError('没有入库权限', 403)
      next.rolls = wholeCount(next.rolls + rolls)
      receivedRolls += rolls
      explicit.set(target.id, values)
      planned.set(target.id, next)
    }
    catch (error) {
      throw new WarehouseError(`第 ${index + 1} 行：${error instanceof Error ? error.message : '导入行无效'}`, error instanceof WarehouseError ? error.status : 400)
    }
  }
  const changed = [...planned.values()].filter(stock => {
    const original = byId.get(stock.id)
    return !original || stock.rolls !== original.rolls || stock.visible !== original.visible
      || Object.keys(stock.remnants).some(key => stock.remnants[key] !== original.remnants[key])
      || warehouseInternalFields.some(([key]) => (stock[key] || '') !== (original[key] || ''))
  })
  const created = changed.filter(stock => !byId.has(stock.id)).length
  return { stocks: changed, created, updated: changed.length - created, receivedRolls }
}
