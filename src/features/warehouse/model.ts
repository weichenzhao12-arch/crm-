export const warehouseFields = [
  ['category', '分类'], ['code', '货号'], ['name', '产品名称'], ['height', '草高'],
  ['stitches', '针数'], ['gauge', '针排'], ['backing', '背胶'], ['density', '密度'], ['dtex', '磅重'],
  ['uv', '抗老化'], ['color', '颜色'],
] as const

export type Specs = Record<typeof warehouseFields[number][0], string>
export type Stock = Specs & { id: string, width: number, length: number, rolls: number, remnants: Record<string, number>, visible: boolean }
export type Kind = 'roll' | 'remnant' | 'cut' | 'meter'
export interface Line { stockId: string, kind: Kind, meters: number, count: number, packaging: string, price: number | null }
export type OrderLine = Line & { product: Specs, width: number, sourceMeters?: number }
export interface Order {
  responsibleUserId?: string
  id: string, creator: string, openedBy: string, date: string, customerId: string, receiver: string, address: string,
  phone: string, driver: string, driverPhone: string, plate: string, lines: OrderLine[],
  status: 'pending' | 'rejected' | 'shipped' | 'returned' | 'cancelled', reason: string,
}
export function orderResponsible(order: Order) { return order.responsibleUserId || order.creator }
export interface StockView extends Omit<Stock, 'visible'> { visible?: boolean, availableRolls?: number, reservedRolls?: number, availableRemnants?: Record<string, number> }

export function availableStock(stocks: Stock[], orders: Order[], excluding = '') {
  const available = structuredClone(stocks)
  // A cut reserves a complete roll. Its future offcut is not stock until shipment.
  for (const order of orders) {
    if (order.status !== 'pending' || order.id === excluding) continue
    for (const line of order.lines) {
      const stock = available.find(item => item.id === line.stockId)
      if (!stock) throw new WarehouseError('锁定规格不存在', 409)
      if (line.kind === 'remnant' || line.sourceMeters !== undefined) {
        const source = line.sourceMeters ?? line.meters
        const count = (stock.remnants[source] || 0) - line.count
        if (count < 0) throw new WarehouseError(`${stock.code} 零货库存已被锁定`, 409)
        if (count) stock.remnants[source] = count
        else delete stock.remnants[source]
      }
      else {
        stock.rolls -= line.count
        if (stock.rolls < 0) throw new WarehouseError(`${stock.code} 整卷库存已被锁定`, 409)
      }
    }
  }
  return available
}

export const warehousePermissionFields = [
  ['warehouseOnly', '仅仓库岗位（隔离其他模块）'], ['warehouseRead', '查看仓库库存'],
  ['warehouseAddSpec', '新增库存规格'], ['warehouseReceive', '库存入库'], ['warehouseIssue', '手动出库'], ['warehouseVisibility', '设置代理商可见范围'],
  ['warehouseCreate', '开发货单'], ['warehousePick', '核货与填写物流'], ['warehouseShip', '确认发货出库'],
  ['warehouseAllOrders', '查看全部发货单'], ['warehouseCancelAny', '撤销他人未出库单'], ['warehouseReturn', '退货入库'], ['warehouseHistory', '查看出入库记录'],
  ['warehousePrint', '打印发货单'], ['warehouseEnterPrice', '手填单价'], ['warehouseViewPrice', '查看全部发货价格'], ['warehousePrintPrice', '打印含价单'],
] as const

export function warehouseAccess(user?: { enabled?: boolean | number, role?: string, permissions?: Partial<Record<typeof warehousePermissionFields[number][0], boolean>> } | null) {
  const has = (key: typeof warehousePermissionFields[number][0]) => Boolean(user?.enabled && (user.role === 'owner' || user.permissions?.[key] === true))
  const explicit = (key: typeof warehousePermissionFields[number][0], legacy = false) => Boolean(user?.enabled && (user.role === 'owner' || user.permissions?.[key] === true || (user.permissions?.[key] === undefined && legacy)))
  const legacyStock = Boolean(user?.enabled && (user.role === 'owner' || (user.permissions as { warehouseStock?: boolean })?.warehouseStock))
  const ship = has('warehouseShip')
  const addSpec = explicit('warehouseAddSpec', legacyStock)
  const receive = explicit('warehouseReceive', legacyStock)
  const issue = explicit('warehouseIssue', legacyStock)
  const visibility = explicit('warehouseVisibility', legacyStock)
  const stock = addSpec || receive || issue || visibility
  const pick = explicit('warehousePick', ship)
  const cancelAny = explicit('warehouseCancelAny', ship)
  const returnStock = explicit('warehouseReturn', ship)
  const history = explicit('warehouseHistory', legacyStock || ship)
  const allOrders = explicit('warehouseAllOrders', ship)
  const print = has('warehousePrint')
  const sales = explicit('warehouseCreate', Boolean(user?.enabled && (ship || ['manager', 'quoter'].includes(user.role || ''))))
  const viewPrice = has('warehouseViewPrice')
  return {
    stock, ship, print, sales, viewPrice, addSpec, receive, issue, visibility, pick, cancelAny, returnStock, history, allOrders,
    only: has('warehouseOnly') && user?.role !== 'owner',
    price: sales && explicit('warehouseEnterPrice', ['manager', 'quoter'].includes(user?.role || '')),
    printPrice: print && viewPrice && has('warehousePrintPrice'),
    enter: has('warehouseRead') || sales || stock || ship || print || pick || cancelAny || returnStock || history || allOrders,
  }
}

export function orderArea(line: OrderLine) {
  return Math.round(line.width * line.meters * line.count * 1e6) / 1e6
}

export function lineAmount(line: OrderLine) {
  return line.price === null ? null : Math.round((orderArea(line) * line.price + Number.EPSILON) * 100) / 100
}

export class WarehouseError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function wholeCount(value: unknown, min = 0) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > 100000)
    throw new WarehouseError('数量必须是有效的整数')
  return value
}

export function measurement(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000 || Number(value.toFixed(3)) !== value)
    throw new WarehouseError('尺寸必须大于零，最多三位小数')
  return value
}

export function snapshotLine(stock: Stock, line: Line): OrderLine {
  if (!['roll', 'remnant', 'cut'].includes(line.kind)) throw new WarehouseError('无效的发货类型')
  const meters = line.kind === 'roll' ? stock.length : measurement(line.meters)
  if (line.kind === 'cut' && meters >= stock.length) throw new WarehouseError('裁切长度必须小于整卷长度')
  const product = Object.fromEntries(warehouseFields.map(([key]) => [key, stock[key]])) as Specs
  return { stockId: stock.id, kind: line.kind, meters, count: wholeCount(line.count, 1), packaging: line.packaging, price: line.price, product, width: stock.width }
}

export function planLines(stocks: Stock[], requested: Line[]): OrderLine[] {
  let free = structuredClone(stocks)
  const result: OrderLine[] = []
  function allocate(line: OrderLine) {
    free = availableStock(free, [{ id: 'allocation', status: 'pending', lines: [line] } as Order])
    result.push(line)
  }
  // Never allocate future offcuts: the physical source stays locked until shipment.
  for (const raw of requested) {
    let stock = free.find(item => item.id === raw.stockId)
    if (!stock) throw new WarehouseError('成品规格不存在', 409)
    if (raw.kind !== 'meter') { allocate(snapshotLine(stock, raw)); continue }
    const meters = measurement(raw.meters)
    if (meters > stock.length) throw new WarehouseError(`单段米数不能超过整卷 ${stock.length}m，请拆成多行`)
    let remaining = wholeCount(raw.count, 1)
    while (remaining > 0) {
      stock = free.find(item => item.id === raw.stockId)!
      const source = Object.keys(stock.remnants).map(Number).filter(length => length >= meters && stock!.remnants[length]! > 0).sort((a, b) => a - b)[0]
      const count = Math.min(remaining, source === undefined ? stock.rolls : stock.remnants[source]!)
      if (!count) throw new WarehouseError(`${stock.code} 可用库存不足，无法按 ${meters}m 出库`, 409)
      const kind = source === meters ? 'remnant' : meters === stock.length ? 'roll' : 'cut'
      const resolved = snapshotLine(stock, { ...raw, kind, meters, count })
      if (source !== undefined && source !== meters) resolved.sourceMeters = source
      allocate(resolved)
      remaining -= count
    }
  }
  return result
}

export function moveStock(stocks: Stock[], lines: OrderLine[], returning = false) {
  const next = structuredClone(stocks)
  function changeRemnant(stock: Stock, meters: number, delta: number) {
    const key = String(meters)
    const remaining = (stock.remnants[key] || 0) + delta
    if (remaining < 0) throw new WarehouseError(`${stock.code} 的 ${meters} m 零货数量不足`, 409)
    if (remaining) stock.remnants[key] = wholeCount(remaining)
    else delete stock.remnants[key]
  }
  // Existing remnants and full rolls must independently cover the order; cutting proceeds only after validation.
  for (const line of lines) {
    const stock = next.find(item => item.id === line.stockId)
    if (!stock) throw new WarehouseError('成品规格不存在', 409)
    if (returning && line.kind !== 'roll') changeRemnant(stock, line.meters, line.count)
    else if (line.kind === 'remnant' || line.sourceMeters !== undefined) changeRemnant(stock, line.sourceMeters ?? line.meters, -line.count)
    else {
      stock.rolls += returning ? line.count : -line.count
      if (stock.rolls < 0) throw new WarehouseError(`${stock.code} 整卷库存不足`, 409)
      wholeCount(stock.rolls)
    }
  }
  if (!returning) for (const line of lines) {
    if (line.kind !== 'cut') continue
    const stock = next.find(item => item.id === line.stockId)!
    changeRemnant(stock, Number(((line.sourceMeters ?? stock.length) - line.meters).toFixed(3)), line.count)
  }
  return next
}
