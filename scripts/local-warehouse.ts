import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { Line, Order, Stock } from '../src/features/warehouse/model'
import { orderResponsible, availableStock, measurement, moveStock, planLines, warehouseAccess, WarehouseError, warehouseFields, wholeCount } from '../src/features/warehouse/model'
import { seedLocalOnce } from './local-database'
import { getAllowedCustomerUserIds } from '../src/features/personnel/scope'

const demo = {
  category: '景观草', code: 'KT-L25-01', name: 'C型深色休闲草', height: '25 mm', stitches: '15 针/10 cm', gauge: '420 针排',
  backing: '丁苯背胶', density: '15,750 簇/㎡', dtex: '8,000 D', uv: '抗 UV', color: '深绿', width: 2, length: 25,
  id: 'demo-a', rolls: 5, remnants: { 7: 1, 3: 2 }, visible: true,
} satisfies Stock

function field(value: unknown, max = 150) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' || value.length > max) throw new WarehouseError('文字字段格式或长度不正确')
  return value.trim()
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 65536) throw new WarehouseError('表单过大', 413)
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  }
  catch { throw new WarehouseError('表单格式不正确') }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

export function localWarehouse(db: DatabaseSync) {
  const saveStock = db.prepare('INSERT OR REPLACE INTO warehouse_stock VALUES (?, ?)')
  const saveOrder = db.prepare('INSERT OR REPLACE INTO warehouse_orders VALUES (?, ?)')
  const stockList = () => db.prepare('SELECT value FROM warehouse_stock ORDER BY rowid').all().map(row => JSON.parse(String(row.value)) as Stock)
  const orderList = () => db.prepare('SELECT value FROM warehouse_orders ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.value)) as Order)
  seedLocalOnce(db, 'warehouse-demo-v1', () => {
    saveStock.run(demo.id, JSON.stringify(demo))
    saveStock.run('demo-b', JSON.stringify({ ...demo, id: 'demo-b', code: 'KT-S50-01', category: '运动草', name: '足球场运动草', height: '50 mm', gauge: '5/8″', rolls: 3, remnants: {}, visible: false }))
  })
  const dealerPassword = Buffer.from(process.env.LOCAL_DEALER_PASSWORD || 'kingturf-local')
  const dealerTokens = new Map<string, number>()
  let failures = 0
  let retryAt = 0

  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    try {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
        throw new WarehouseError('不允许跨站请求', 403)
      const path = new URL(req.url || '/', 'http://localhost').pathname
      const method = req.method
      if (path === '/dealer' && method === 'POST') {
        const { password } = await readBody(req)
        if (retryAt > Date.now()) throw new WarehouseError('尝试次数过多，请稍后重试', 429)
        const provided = Buffer.from(field(password, 200))
        if (provided.length !== dealerPassword.length || !timingSafeEqual(provided, dealerPassword)) {
          if (++failures >= 5) { retryAt = Date.now() + 60000; failures = 0 }
          throw new WarehouseError('查询密码不正确', 401)
        }
        failures = 0
        for (const [token, expires] of dealerTokens) if (expires <= Date.now()) dealerTokens.delete(token)
        const token = randomUUID()
        dealerTokens.set(token, Date.now() + 3600000)
        res.setHeader('Set-Cookie', `local-dealer=${token}; Path=/api/local-warehouse/dealer; HttpOnly; SameSite=Strict; Max-Age=3600`)
        return send(200, { ok: true })
      }
      if (path === '/dealer' && (method === 'GET' || method === 'DELETE')) {
        const token = req.headers.cookie?.match(/(?:^|;\s*)local-dealer=([\w-]+)/)?.[1] || ''
        if (method === 'DELETE') {
          dealerTokens.delete(token)
          res.setHeader('Set-Cookie', 'local-dealer=; Path=/api/local-warehouse/dealer; HttpOnly; SameSite=Strict; Max-Age=0')
          return send(200, { ok: true })
        }
        if ((dealerTokens.get(token) || 0) <= Date.now()) throw new WarehouseError('请输入查询密码', 401)
        return send(200, { stocks: availableStock(stockList(), orderList()).filter(stock => stock.visible).map(({ visible, ...stock }) => stock) })
      }

      const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1] || ''
      const user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ? AND u.enabled = 1`).get(token, new Date().toISOString())
      if (!user) throw new WarehouseError('未登录或登录已过期', 401)
      const actor = String(user.id)
      const permissions = JSON.parse(String(user.permissions))
      const access = warehouseAccess({ enabled: 1, role: String(user.role), permissions })
      const scopeRows = db.prepare('SELECT id, enabled, department_id, permissions FROM users ORDER BY id').all()
      const scopeUsers = scopeRows.map(row => ({
        id: String(row.id), enabled: row.enabled === 1, departmentId: String(row.department_id || ''), permissions: JSON.parse(String(row.permissions)),
      }))
      const allowedCustomerUsers = new Set(getAllowedCustomerUserIds(scopeUsers, actor))
      const allCustomers = user.role === 'owner' || permissions.viewAllCustomers === true || permissions.customerScope === 'all' || permissions.manageUsers === true || String(user.account).toLowerCase() === 'admin'
      const canCustomer = (customer: { assigned_to_user_id?: unknown } | null | undefined) => Boolean(customer && (allCustomers || typeof customer.assigned_to_user_id === 'string' && allowedCustomerUsers.has(customer.assigned_to_user_id)))
      function allow(condition: boolean) { if (!condition) throw new WarehouseError('没有此操作权限', 403) }
      function canSee(order: Order) { return access.allOrders || orderResponsible(order) === actor }
      function redact(order: Order) {
        return access.viewPrice || (access.price && orderResponsible(order) === actor)
          ? order : { ...order, lines: order.lines.map(line => ({ ...line, price: null })) }
      }
      function log(event: string, target: string, detail: unknown) {
        db.prepare('INSERT INTO warehouse_log VALUES (?, ?, ?, ?, ?)').run(event, actor, target, JSON.stringify(detail), new Date().toISOString())
      }
      if (path === '/customer-orders' && method === 'GET') {
        allow(!access.only)
        const customerId = new URL(req.url || '/', 'http://localhost').searchParams.get('customerId') || ''
        const customer = db.prepare('SELECT assigned_to_user_id FROM crm_customers WHERE id = ?').get(customerId)
        allow(canCustomer(customer))
        return send(200, { orders: orderList().filter(order => order.customerId === customerId).map(redact) })
      }
      allow(access.enter)
      if (path === '/print' && method === 'GET') {
        allow(access.print)
        const query = new URL(req.url || '/', 'http://localhost').searchParams
        const priced = query.get('priced') === '1'
        allow(!priced || access.printPrice)
        const order = orderList().find(item => item.id === query.get('id'))
        if (!order || !canSee(order)) throw new WarehouseError('找不到发货单', 404)
        return send(200, priced ? order : { ...order, lines: order.lines.map(line => ({ ...line, price: null })) })
      }
      if (path === '/' && method === 'GET') {
        const physical = stockList()
        const available = availableStock(physical, orderList())
        const customers = access.sales && !access.only ? db.prepare('SELECT id, name, value, assigned_to_user_id FROM crm_customers ORDER BY name').all().filter(canCustomer).map(row => {
            const value = JSON.parse(String(row.value))
            return { id: row.id, name: row.name, phone: String(value.phone || '') }
          }) : []
        return send(200, {
          access, customers, orders: orderList().filter(canSee).map(redact),
          stocks: physical.map(({ visible, ...stock }) => {
            const free = available.find(item => item.id === stock.id)!
            const view = { ...stock, availableRolls: free.rolls, reservedRolls: stock.rolls - free.rolls, availableRemnants: free.remnants }
            return access.stock ? { ...view, visible } : view
          }),
          history: access.history ? db.prepare('SELECT event, actor, target, time FROM warehouse_log ORDER BY rowid DESC LIMIT 100').all() : [],
        })
      }

      if (method !== 'POST') throw new WarehouseError('操作不存在', 404)
      const body = await readBody(req)
      if (!['/stock', '/orders', '/dispatch'].includes(path)) throw new WarehouseError('操作不存在', 404)
      const requestKey = req.headers['idempotency-key']
      if (typeof requestKey !== 'string' || !/^[\w-]{8,128}$/.test(requestKey)) throw new WarehouseError('缺少有效的提交编号，请刷新开单页面后重试')
      const requestHash = createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')
      function authorizeMutation() {
        if (path === '/orders') {
          allow(access.sales)
          if (body.customerId) {
            const latestScopeRows = db.prepare('SELECT id, enabled, department_id, permissions FROM users ORDER BY id').all()
            if (JSON.stringify(latestScopeRows) !== JSON.stringify(scopeRows)) throw new WarehouseError('客户权限已变化，请重新加载后重试', 409)
            const customer = db.prepare('SELECT assigned_to_user_id FROM crm_customers WHERE id = ?').get(String(body.customerId))
            allow(!access.only && canCustomer(customer))
          }
        }
        if (path === '/stock') {
          allow(access.stock)
          allow(body.id ? access.receive || access.issue || access.visibility : access.addSpec)
          if (body.rolls || body.remnants?.length) allow(body.direction === 'out' ? access.issue : access.receive)
        }
        if (path === '/dispatch') {
          const order = orderList().find(item => item.id === body.id)
          if (!order) throw new WarehouseError('找不到发货单', 404)
          allow(canSee(order))
          allow(body.action === 'cancel' ? access.cancelAny || (access.sales && orderResponsible(order) === actor)
            : body.action === 'return' ? access.returnStock : body.action === 'logistics' || body.action === 'reject' ? access.pick : access.ship)
        }
      }
      // Keep validation, balances, order and audit entry in a single synchronous transaction.
      db.exec('BEGIN IMMEDIATE')
      let result: unknown = { ok: true }
      try {
        authorizeMutation()
        const prior = db.prepare('SELECT operation, request_hash, result FROM warehouse_requests WHERE actor = ? AND request_key = ?').get(actor, requestKey)
        if (prior) {
          if (prior.operation !== path || prior.request_hash !== requestHash) throw new WarehouseError('该提交编号已成功使用且内容不同，请先核对已有单据，不要重复开单', 409)
          const reference = JSON.parse(String(prior.result)) as { orderId?: string }
          const previous = reference.orderId ? orderList().find(order => order.id === reference.orderId) : undefined
          if (reference.orderId && !previous) throw new WarehouseError('原提交单据不存在，请联系管理员', 409)
          if (previous) allow(canSee(previous))
          db.exec('COMMIT')
          return send(200, previous ? redact(previous) : { ok: true })
        }
        const stocks = stockList()
        if (path === '/stock') {
          allow(access.stock)
          const current = body.id ? stocks.find(stock => stock.id === body.id) : undefined
          if (body.id && !current) throw new WarehouseError('规格不存在', 404)
          allow(current ? access.receive || access.issue || access.visibility : access.addSpec)
          const stock = current || ({
            ...Object.fromEntries(warehouseFields.map(([key]) => [key, field(body[key])])),
            id: randomUUID(), width: measurement(body.width), length: measurement(body.length), rolls: 0, remnants: {}, visible: false,
          } as Stock)
          if (!stock.code || !stock.name || !stock.category) throw new WarehouseError('请填写分类、货号和产品名称')
          if (!current && stocks.some(item => item.code.toLowerCase() === stock.code.toLowerCase() && item.width === stock.width && item.length === stock.length))
            throw new WarehouseError('相同货号和尺寸已存在，请给原规格入库', 409)
          const rolls = wholeCount(body.rolls ?? 0)
          if (body.direction !== undefined && !['in', 'out'].includes(body.direction)) throw new WarehouseError('库存操作类型无效')
          const outgoing = body.direction === 'out'
          if (rolls || body.remnants?.length) allow(outgoing ? access.issue : access.receive)
          if (current && typeof body.visible === 'boolean' && body.visible !== current.visible) allow(access.visibility)
          if (!current && body.visible === true) allow(access.visibility)
          const reason = field(body.reason, 300)
          if (outgoing && (!current || !reason)) throw new WarehouseError('手动出库须选择已有规格并填写原因')
          if (outgoing && body.autoMeters === true) {
            if (!Array.isArray(body.remnants) || body.remnants.length > 50) throw new WarehouseError('米数明细无效')
            const requested: Line[] = []
            if (rolls) requested.push({ stockId: stock.id, kind: 'roll', count: rolls, meters: stock.length, packaging: '', price: null })
            for (const item of body.remnants) requested.push({ stockId: stock.id, kind: 'meter', count: item?.count, meters: item?.meters, packaging: '', price: null })
            if (!requested.length) throw new WarehouseError('请填写出库数量')
            const plan = planLines(availableStock(stocks, orderList()), requested)
            const next = moveStock(stocks, plan).find(item => item.id === stock.id)!
            if (typeof body.visible === 'boolean') next.visible = body.visible
            saveStock.run(next.id, JSON.stringify(next))
            log('按米 / 整卷手动出库', next.id, { reason, lines: plan })
          }
          else {
          const sign = outgoing ? -1 : 1
          if (stock.rolls + sign * rolls < 0) throw new WarehouseError('整卷库存不足', 409)
          stock.rolls = wholeCount(stock.rolls + sign * rolls)
          if (body.remnants !== undefined && (!Array.isArray(body.remnants) || body.remnants.length > 50)) throw new WarehouseError('零货明细无效')
          for (const item of body.remnants || []) {
            const meters = measurement(item?.meters)
            if (!outgoing && meters === stock.length) {
              stock.rolls = wholeCount(stock.rolls + wholeCount(item?.count, 1))
              continue
            }
            if (meters >= stock.length) throw new WarehouseError('零货长度须小于整卷长度')
            const remaining = (stock.remnants[meters] || 0) + sign * wholeCount(item?.count, 1)
            if (remaining < 0) throw new WarehouseError(`${meters}m 零货库存不足`, 409)
            if (remaining) stock.remnants[meters] = wholeCount(remaining)
            else delete stock.remnants[meters]
          }
          if (typeof body.visible === 'boolean') stock.visible = body.visible
          saveStock.run(stock.id, JSON.stringify(stock))
          availableStock(stockList(), orderList())
          if (outgoing && !rolls && !body.remnants?.length) throw new WarehouseError('请填写出库数量')
          log(outgoing ? '手动出库' : '库存维护 / 入库', stock.id, { rolls, remnants: body.remnants, visible: stock.visible, reason })
          }
        }
        else if (path === '/orders') {
          allow(access.sales)
          const old = body.id ? orderList().find(order => order.id === body.id) : undefined
          if (body.id && (!old || orderResponsible(old) !== actor)) throw new WarehouseError('找不到可修改的发货单', 404)
          if (old && old.status !== 'rejected') throw new WarehouseError('只有退回单可以重新提交', 409)
          const customerId = field(body.customerId)
          const customer = customerId ? db.prepare('SELECT name, assigned_to_user_id FROM crm_customers WHERE id = ?').get(customerId) : null
          if (customerId) allow(access.sales && !access.only && canCustomer(customer))
          const receiver = field(body.receiver) || String(customer?.name || '')
          if (!receiver) throw new WarehouseError('请填写收货名称')
          if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) throw new WarehouseError('请填写发货明细（最多100行）')
          const date = field(body.date, 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new WarehouseError('请填写有效的送货日期')
          const requested = body.lines.map((raw: Line | null) => {
            const stock = stocks.find(item => item.id === raw?.stockId)
            if (!raw || !stock) throw new WarehouseError('请选有效的成品规格')
            const price = raw.price ?? null
            if (price !== null) {
              allow(access.price)
              if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Number(price.toFixed(2)) !== price) throw new WarehouseError('单价必须为有效金额，最多两位小数')
            }
            return { stockId: stock.id, kind: raw.kind, meters: raw.meters, count: raw.count, price, packaging: field(raw.packaging) }
          })
          const lines = planLines(availableStock(stocks, orderList()), requested)
          const order: Order = {
            id: old?.id || `FH-${randomUUID().slice(0, 8).toUpperCase()}`, creator: old?.creator || actor, responsibleUserId: actor, openedBy: old?.openedBy || String(user.display_name),
            date, customerId, receiver, address: field(body.address, 300), phone: field(body.phone), driver: field(body.driver),
            driverPhone: field(body.driverPhone), plate: field(body.plate), lines, status: 'pending', reason: '',
          }
          moveStock(availableStock(stocks, orderList()), lines)
          saveOrder.run(order.id, JSON.stringify(order))
          log(old ? '重新提交并锁库' : '提交发货单并锁库', order.id, { lines })
          result = redact(order)
        }
        else if (path === '/dispatch') {
          const order = orderList().find(item => item.id === body.id)
          if (!order) throw new WarehouseError('找不到发货单', 404)
          const { action } = body
          allow(canSee(order))
          allow(action === 'cancel' ? access.cancelAny || (access.sales && orderResponsible(order) === actor)
            : action === 'return' ? access.returnStock : action === 'logistics' || action === 'reject' ? access.pick : access.ship)
          if (action === 'cancel') {
            if (!['pending', 'rejected'].includes(order.status)) throw new WarehouseError('仅未出库的发货单可以撤销；已出库请办理退货', 409)
          }
          else if (action === 'logistics' || action === 'ship' || action === 'reject') {
            if (order.status !== 'pending') throw new WarehouseError('只有待出库单可以操作', 409)
          }
          else if (action !== 'return' || order.status !== 'shipped') throw new WarehouseError('此单不能退回或已处理', 409)

          if (action === 'reject' || action === 'return' || action === 'cancel') {
            order.reason = field(body.reason, 300)
            if (!order.reason) throw new WarehouseError('请填写原因')
            order.status = action === 'reject' ? 'rejected' : action === 'cancel' ? 'cancelled' : 'returned'
          }
          if (action === 'logistics') {
            order.driver = field(body.driver)
            order.driverPhone = field(body.driverPhone)
            order.plate = field(body.plate)
            if (!Array.isArray(body.packaging) || body.packaging.length !== order.lines.length) throw new WarehouseError('包装明细不一致')
            order.lines.forEach((line, i) => { line.packaging = field(body.packaging[i]) })
          }
          if (action === 'ship' || action === 'return') {
            if (action === 'ship') moveStock(availableStock(stocks, orderList(), order.id), order.lines)
            const next = moveStock(stocks, order.lines, action === 'return')
            for (const stock of next.filter(item => order.lines.some(line => line.stockId === item.id))) saveStock.run(stock.id, JSON.stringify(stock))
            if (action === 'ship') order.status = 'shipped'
          }
          saveOrder.run(order.id, JSON.stringify(order))
          log({ ship: '锁定转出库', return: '退货入库', reject: '退回修改并释放库存', cancel: '撤销并释放库存', logistics: '更新发货信息' }[action as 'ship'], order.id, { reason: order.reason, lines: order.lines })
          result = redact(order)
        }
        else throw new WarehouseError('操作不存在', 404)
        const reference = result && typeof result === 'object' && 'id' in result ? { orderId: result.id } : { ok: true }
        db.prepare('INSERT INTO warehouse_requests VALUES (?, ?, ?, ?, ?, ?)').run(actor, requestKey, path, requestHash, JSON.stringify(reference), new Date().toISOString())
        db.exec('COMMIT')
      }
      catch (error) { db.exec('ROLLBACK'); throw error }
      return send(200, result)
    }
    catch (error) {
      if (error instanceof WarehouseError) return send(error.status, { message: error.message })
      if (error instanceof Error && /database is locked|SQLITE_BUSY/.test(error.message)) return send(409, { message: '库存正在被其他操作更新，请使用原提交编号重试' })
      console.error(error)
      return send(500, { message: '本地成品库接口错误' })
    }
  }
}
