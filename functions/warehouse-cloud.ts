import { availableStock, measurement, moveStock, orderResponsible, planLines, warehouseAccess, warehouseFields, WarehouseError, wholeCount } from '../src/features/warehouse/model'
import type { Line, Order, Stock } from '../src/features/warehouse/model'
import { getAllowedCustomerUserIds } from '../src/features/personnel/scope'

type Person = { id: string, account: string, display_name: string, role: string, enabled: number, permissions: string }
type Customer = { id: string, name: string, assigned_to_user_id: string | null, value: string }
const json = (status: number, value: unknown) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
function field(value: unknown, max = 150): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > max) throw new WarehouseError('文字字段格式或长度不正确')
  return value.trim()
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
async function digest(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))))), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function warehouseCloud(request: Request, db: D1Database): Promise<Response> {
  try {
    const url = new URL(request.url)
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) throw new WarehouseError('不允许跨站请求', 403)
    const path = url.pathname.replace(/^\/api\/local-warehouse/, '') || '/'
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
    // D1 batch reads one consistent snapshot; the revision guard validates it again at commit.
    const snapshot = await db.batch<{ results: Record<string, unknown>[] }>([
      db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ? AND u.enabled = 1').bind(token, new Date().toISOString()),
      db.prepare('SELECT value FROM warehouse_stock ORDER BY rowid'),
      db.prepare('SELECT value FROM warehouse_orders ORDER BY rowid DESC'),
      db.prepare('SELECT id, name, assigned_to_user_id, value FROM crm_customers ORDER BY name'),
      db.prepare('SELECT revision FROM warehouse_revision WHERE id = 1'),
      db.prepare('SELECT id, enabled, department_id, permissions FROM users ORDER BY id'),
      db.prepare('SELECT ok FROM transaction_guard WHERE id = 1'),
    ])
    const user = snapshot[0]!.results[0] as unknown as Person | undefined
    if (!user) throw new WarehouseError('未登录或登录已过期', 401)
    const stocks = snapshot[1]!.results.map(row => JSON.parse(String(row.value)) as Stock)
    const orders = snapshot[2]!.results.map(row => JSON.parse(String(row.value)) as Order)
    const customers = snapshot[3]!.results as unknown as Customer[]
    const revision = snapshot[4]!.results[0]?.revision
    if (revision === undefined || snapshot[6]!.results[0]?.ok !== 1) throw new WarehouseError('仓库数据库尚未完成迁移', 503)
    const permissions = JSON.parse(user.permissions)
    const access = warehouseAccess(user && { ...user, permissions })
    const scopeRows = snapshot[5]!.results
    const scopeUsers = scopeRows.map(row => ({ id: String(row.id), enabled: row.enabled === 1, departmentId: String(row.department_id || ''), permissions: JSON.parse(String(row.permissions)) }))
    const allowedCustomerUsers = new Set(getAllowedCustomerUserIds(scopeUsers, user.id))
    const allCustomers = user.role === 'owner' || permissions.viewAllCustomers === true || permissions.customerScope === 'all' || permissions.manageUsers === true || user.account.toLowerCase() === 'admin'
    const allow = (condition: unknown) => { if (!condition) throw new WarehouseError('没有此操作权限', 403) }
    const canSee = (order: Order) => access.allOrders || orderResponsible(order) === user.id
    const redact = (order: Order) => access.viewPrice || (access.price && orderResponsible(order) === user.id) ? order : { ...order, lines: order.lines.map(line => ({ ...line, price: null })) }
    const canCustomer = (customer?: Customer) => customer && (allCustomers || customer.assigned_to_user_id !== null && allowedCustomerUsers.has(customer.assigned_to_user_id))
    if (request.method === 'GET' && path === '/customer-orders') {
      allow(!access.only && canCustomer(customers.find(customer => customer.id === url.searchParams.get('customerId'))))
      return json(200, { orders: orders.filter(order => order.customerId === url.searchParams.get('customerId')).map(redact) })
    }
    allow(access.enter)
    if (request.method === 'GET' && path === '/print') {
      allow(access.print)
      const priced = url.searchParams.get('priced') === '1'
      allow(!priced || access.printPrice)
      const order = orders.find(order => order.id === url.searchParams.get('id'))
      if (!order || !canSee(order)) throw new WarehouseError('找不到发货单', 404)
      return json(200, priced ? order : { ...order, lines: order.lines.map(line => ({ ...line, price: null })) })
    }
    if (request.method === 'GET' && path === '/') {
      const free = availableStock(stocks, orders)
      const history = access.history ? (await db.prepare('SELECT event, actor, target, time FROM warehouse_log ORDER BY rowid DESC LIMIT 100').all()).results : []
      return json(200, {
        access, orders: orders.filter(canSee).map(redact), history,
        customers: access.sales && !access.only ? customers.filter(canCustomer).map(customer => ({ id: customer.id, name: customer.name, phone: String(JSON.parse(customer.value).phone || '') })) : [],
        stocks: stocks.map(({ visible, ...stock }) => {
          const available = free.find(item => item.id === stock.id)!
          const view = { ...stock, availableRolls: available.rolls, reservedRolls: stock.rolls - available.rolls, availableRemnants: available.remnants }
          return access.stock ? { ...view, visible } : view
        }),
      })
    }
    if (request.method !== 'POST' || !['/stock', '/orders', '/dispatch'].includes(path)) throw new WarehouseError('操作不存在', 404)
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 65536) { await reader.cancel(); throw new WarehouseError('表单过大', 413) }
        chunks.push(part.value)
      }
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const text = new TextDecoder().decode(bytes)
    let body: any
    try { body = JSON.parse(text) } catch { throw new WarehouseError('表单格式不正确') }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WarehouseError('表单格式不正确')
    const requestKey = request.headers.get('Idempotency-Key') || ''
    if (!/^[\w-]{8,128}$/.test(requestKey)) throw new WarehouseError('缺少有效的提交编号')
    const requestHash = await digest(body)
    const oldOrder = orders.find(order => order.id === body.id)
    let boundCustomer: Customer | undefined
    if (path === '/orders') {
      allow(access.sales)
      if (body.customerId) {
        boundCustomer = customers.find(customer => customer.id === body.customerId)
        allow(!access.only && canCustomer(boundCustomer))
      }
    }
    if (path === '/stock') {
      allow(access.stock && (body.id ? access.receive || access.issue || access.visibility : access.addSpec))
      if (body.rolls || body.remnants?.length) allow(body.direction === 'out' ? access.issue : access.receive)
    }
    if (path === '/dispatch') {
      if (!oldOrder) throw new WarehouseError('找不到发货单', 404)
      allow(canSee(oldOrder))
      allow(body.action === 'cancel' ? access.cancelAny || (access.sales && orderResponsible(oldOrder) === user.id)
        : body.action === 'return' ? access.returnStock : ['reject', 'logistics'].includes(body.action) ? access.pick : access.ship)
    }
    const prior = await db.prepare('SELECT operation, request_hash, result FROM warehouse_requests WHERE actor = ? AND request_key = ?').bind(user.id, requestKey).first<{ operation: string, request_hash: string, result: string }>()
    if (prior) {
      if (prior.operation !== path || prior.request_hash !== requestHash) throw new WarehouseError('该提交编号已使用且内容不同', 409)
      const reference = JSON.parse(prior.result)
      if (!reference.orderId) return json(200, { ok: true })
      const order = orders.find(order => order.id === reference.orderId)
      if (!order || !canSee(order)) throw new WarehouseError('找不到原提交单据或无权访问', 409)
      return json(200, redact(order))
    }
    let changedStocks: Stock[] = []
    let changedOrder: Order | undefined
    let event = ''
    let target = ''
    if (path === '/stock') {
      const current = body.id ? stocks.find(stock => stock.id === body.id) : undefined
      if (body.id && !current) throw new WarehouseError('规格不存在', 404)
      const stock = current || { ...Object.fromEntries(warehouseFields.map(([key]) => [key, field(body[key])])), id: crypto.randomUUID(), width: measurement(body.width), length: measurement(body.length), rolls: 0, remnants: {}, visible: false } as Stock
      if (!stock.code || !stock.name || !stock.category) throw new WarehouseError('请填写分类、货号和产品名称')
      if (!current && stocks.some(item => item.code.toLowerCase() === stock.code.toLowerCase() && item.width === stock.width && item.length === stock.length)) throw new WarehouseError('相同货号和尺寸已存在，请给原规格入库', 409)
      const rolls = wholeCount(body.rolls ?? 0)
      if (body.direction !== undefined && !['in', 'out'].includes(body.direction)) throw new WarehouseError('库存操作类型无效')
      const outgoing = body.direction === 'out'
      if (typeof body.visible === 'boolean' && body.visible !== stock.visible) allow(access.visibility)
      const reason = field(body.reason, 300)
      if (outgoing && (!current || !reason)) throw new WarehouseError('手动出库须选择已有规格并填写原因')
      if (body.remnants !== undefined && (!Array.isArray(body.remnants) || body.remnants.length > 50)) throw new WarehouseError('零货明细无效')
      if (outgoing && !rolls && !body.remnants?.length) throw new WarehouseError('请填写出库数量')
      if (outgoing && body.autoMeters === true) {
        const requested: Line[] = rolls ? [{ stockId: stock.id, kind: 'roll', count: rolls, meters: stock.length, packaging: '', price: null }] : []
        for (const item of body.remnants || []) requested.push({ stockId: stock.id, kind: 'meter', count: item?.count, meters: item?.meters, packaging: '', price: null })
        const lines = planLines(availableStock(stocks, orders), requested)
        changedStocks = moveStock(stocks, lines).filter(item => item.id === stock.id)
        event = '按米 / 整卷手动出库'
      }
      else {
        if (outgoing && stock.rolls < rolls) throw new WarehouseError('整卷库存不足', 409)
        stock.rolls = wholeCount(stock.rolls + (outgoing ? -1 : 1) * rolls)
        for (const item of body.remnants || []) {
          const meters = measurement(item?.meters)
          const count = wholeCount(item?.count, 1)
          if (!outgoing && meters === stock.length) { stock.rolls = wholeCount(stock.rolls + count); continue }
          if (meters >= stock.length) throw new WarehouseError('零货长度须小于整卷长度')
          const remaining = (stock.remnants[meters] || 0) + (outgoing ? -1 : 1) * count
          if (remaining < 0) throw new WarehouseError('零货库存不足', 409)
          if (remaining) stock.remnants[meters] = wholeCount(remaining)
          else delete stock.remnants[meters]
        }
        changedStocks = [stock]
        event = outgoing ? '手动出库' : '库存维护 / 入库'
      }
      if (typeof body.visible === 'boolean') changedStocks[0]!.visible = body.visible
      availableStock([...stocks.filter(item => item.id !== stock.id), ...changedStocks], orders)
      target = stock.id
    }
    if (path === '/orders') {
      if (body.id && (!oldOrder || orderResponsible(oldOrder) !== user.id)) throw new WarehouseError('找不到可修改的发货单', 404)
      if (oldOrder && oldOrder.status !== 'rejected') throw new WarehouseError('只有退回单可以重新提交', 409)
      const customerId = field(body.customerId)
      const receiver = field(body.receiver) || boundCustomer?.name || ''
      if (!receiver) throw new WarehouseError('请填写收货名称')
      if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) throw new WarehouseError('请填写发货明细（最多100行）')
      const date = field(body.date, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new WarehouseError('请填写有效的送货日期')
      const requested = body.lines.map((raw: Line | null) => {
        if (!raw || !stocks.some(stock => stock.id === raw.stockId)) throw new WarehouseError('请选择有效规格')
        const price = raw.price ?? null
        if (price !== null) {
          allow(access.price)
          if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Number(price.toFixed(2)) !== price) throw new WarehouseError('单价必须为有效金额，最多两位小数')
        }
        return { ...raw, price, packaging: field(raw.packaging) }
      })
      const lines = planLines(availableStock(stocks, orders), requested)
      changedOrder = { id: oldOrder?.id || `FH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, creator: oldOrder?.creator || user.id, responsibleUserId: user.id, openedBy: oldOrder?.openedBy || user.display_name, date, customerId, receiver, address: field(body.address, 300), phone: field(body.phone), driver: field(body.driver), driverPhone: field(body.driverPhone), plate: field(body.plate), lines, status: 'pending', reason: '' }
      event = oldOrder ? '重新提交并锁库' : '提交发货单并锁库'
      target = changedOrder.id
    }
    if (path === '/dispatch') {
      const order = oldOrder!
      const action = body.action
      if (action === 'cancel') {
        if (!['pending', 'rejected'].includes(order.status)) throw new WarehouseError('仅未出库单可以撤销', 409)
      }
      else if (['logistics', 'ship', 'reject'].includes(action)) {
        if (order.status !== 'pending') throw new WarehouseError('只有待出库单可以操作', 409)
      }
      else if (action !== 'return' || order.status !== 'shipped') throw new WarehouseError('此单不能退回或已处理', 409)
      if (['reject', 'return', 'cancel'].includes(action)) {
        order.reason = field(body.reason, 300)
        if (!order.reason) throw new WarehouseError('请填写原因')
        order.status = action === 'reject' ? 'rejected' : action === 'cancel' ? 'cancelled' : 'returned'
      }
      if (action === 'logistics') {
        order.driver = field(body.driver); order.driverPhone = field(body.driverPhone); order.plate = field(body.plate)
        if (!Array.isArray(body.packaging) || body.packaging.length !== order.lines.length) throw new WarehouseError('包装明细不一致')
        order.lines.forEach((line, index) => { line.packaging = field(body.packaging[index]) })
      }
      if (action === 'ship' || action === 'return') {
        if (action === 'ship') moveStock(availableStock(stocks, orders, order.id), order.lines)
        changedStocks = moveStock(stocks, order.lines, action === 'return').filter(stock => order.lines.some(line => line.stockId === stock.id))
        if (action === 'ship') order.status = 'shipped'
      }
      changedOrder = order
      event = ({ ship: '锁定转出库', return: '退货入库', reject: '退回修改并释放库存', cancel: '撤销并释放库存', logistics: '更新发货信息' } as Record<string, string>)[action]!
      target = order.id
    }
    const guards = ['(SELECT revision FROM warehouse_revision WHERE id = 1) = ?', 'EXISTS (SELECT 1 FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ? AND u.id = ? AND u.enabled = 1 AND u.role = ? AND u.permissions = ? AND u.account = ?)']
    const args: (string | number | null)[] = [Number(revision), token, new Date().toISOString(), user.id, user.role, user.permissions, user.account]
    if (boundCustomer) {
      // Team grants depend on other users' reporting lines and departments too.
      guards.push('(SELECT COUNT(*) FROM users) = ?')
      args.push(scopeRows.length)
      guards.push(`NOT EXISTS (SELECT 1 FROM json_each(?) s LEFT JOIN users u ON u.id = json_extract(s.value, '$.id') WHERE u.id IS NULL OR u.enabled IS NOT json_extract(s.value, '$.enabled') OR u.department_id IS NOT json_extract(s.value, '$.department_id') OR u.permissions IS NOT json_extract(s.value, '$.permissions'))`)
      args.push(JSON.stringify(scopeRows))
      guards.push('EXISTS (SELECT 1 FROM crm_customers WHERE id = ? AND COALESCE(assigned_to_user_id, \'\') = ? AND value = ?)')
      args.push(boundCustomer.id, boundCustomer.assigned_to_user_id || '', boundCustomer.value)
    }
    const writes = [db.prepare(`UPDATE transaction_guard SET ok = CASE WHEN ${guards.join(' AND ')} THEN 1 ELSE 0 END WHERE id = 1`).bind(...args)]
    if (changedStocks.length) writes.push(db.prepare(`INSERT INTO warehouse_stock (id,value) SELECT json_extract(value,'$.id'), value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(changedStocks)))
    if (changedOrder) writes.push(db.prepare('INSERT INTO warehouse_orders (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value = excluded.value').bind(changedOrder.id, JSON.stringify(changedOrder)))
    const now = new Date().toISOString()
    writes.push(db.prepare('INSERT INTO warehouse_log (event,actor,target,detail,time) VALUES (?,?,?,?,?)').bind(event, user.id, target, JSON.stringify({ requestKey, reason: body.reason || '', lines: changedOrder?.lines, stocks: changedStocks }), now))
    writes.push(db.prepare('INSERT INTO warehouse_requests (actor,request_key,operation,request_hash,result,created_at) VALUES (?,?,?,?,?,?)').bind(user.id, requestKey, path, requestHash, JSON.stringify(changedOrder ? { orderId: changedOrder.id } : { ok: true }), now))
    try { await db.batch(writes) }
    catch (error) {
      if (/CHECK constraint|UNIQUE constraint|SQLITE_BUSY|database is locked/i.test(String(error))) throw new WarehouseError('库存、权限或单据已变化，请使用原提交编号重新加载后重试', 409)
      throw error
    }
    return json(200, changedOrder ? redact(changedOrder) : { ok: true })
  }
  catch (error) {
    if (error instanceof WarehouseError) return json(error.status, { message: error.message })
    console.error(error)
    return json(500, { message: '仓库操作未完成，请核对单据后重试' })
  }
}
