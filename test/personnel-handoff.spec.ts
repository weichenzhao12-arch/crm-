// @vitest-environment node
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { localPersonnel } from '../scripts/local-personnel'
import { localWarehouse } from '../scripts/local-warehouse'
import { openLocalDatabase } from '../scripts/local-database'
import { availableStock, snapshotLine } from '../src/features/warehouse/model'
import type { Order, Stock } from '../src/features/warehouse/model'

it('atomically moves departments, distributes departure customers and transfers order responsibility without changing locks', async () => {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  localWarehouse(db)
  db.prepare('INSERT INTO users (id, account, display_name, role, password, permissions) VALUES (?,?,?,?,?,?)').run('sales-3', 'sales3', '销售三号', 'quoter', 'test', '{}')
  for (const id of ['owner', 'sales-1', 'sales-2', 'sales-3']) db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(id, id, '2050-01-01T00:00:00.000Z')
  const values = ['a', 'b', 'c'].map(id => ({ id, name: `客户${id}`, assignedToUserId: 'sales-1', owner: '销售一部', followUps: [{ id: `follow-${id}`, content: '保留跟进', reminderDate: '2026-11-16', reminderDone: false }], quotes: [{ id: `quote-${id}` }] }))
  for (const value of values) db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value) VALUES (?,?,?,?)').run(value.id, value.name, 'sales-1', JSON.stringify(value))
  db.prepare('INSERT INTO app_state (key,value,revision) VALUES (?,?,?)').run('customers', JSON.stringify(values), 'initial')
  const stock = JSON.parse(String(db.prepare('SELECT value FROM warehouse_stock WHERE id = ?').get('demo-a')!.value)) as Stock
  const baseOrder: Order = { id: 'bound', creator: 'sales-1', openedBy: '原开单人', date: '2026-11-15', customerId: 'a', receiver: '客户a', address: '', phone: '', driver: '', driverPhone: '', plate: '', status: 'pending', reason: '', lines: [snapshotLine(stock, { stockId: 'demo-a', kind: 'roll', meters: 25, count: 1, price: null, packaging: '' })] }
  for (const order of [baseOrder, { ...baseOrder, id: 'walk-in', customerId: '', receiver: '手填收货人' }]) db.prepare('INSERT INTO warehouse_orders VALUES (?,?)').run(order.id, JSON.stringify(order))
  const allOrders = () => db.prepare('SELECT value FROM warehouse_orders ORDER BY id').all().map(row => JSON.parse(String(row.value)) as Order)
  const allCustomers = () => db.prepare('SELECT value FROM crm_customers ORDER BY id').all().map(row => JSON.parse(String(row.value)))
  const locksBefore = availableStock([stock], allOrders())
  const server = createServer(localPersonnel(db))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  async function request(body?: any, key = randomUUID(), token = 'owner', mode = 'leave') {
    const response = await fetch(`${base}/?sourceId=sales-1&mode=${mode}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, value: await response.json() }
  }
  function payload(preview: any, mode = 'leave') {
    return { mode, sourceId: 'sales-1', sourceRevision: preview.source.revision, ordersRevision: preview.ordersRevision, reason: '测试交接', departmentId: 'logistics', orderTargetId: 'sales-3', orderTargetRevision: preview.targets.find((target: any) => target.id === 'sales-3').revision,
      assignments: preview.customers.map((customer: any, i: number) => { const target = preview.targets.find((target: any) => target.id === (i === 1 ? 'sales-3' : 'sales-2')); return { id: customer.id, revision: customer.revision, toUserId: target.id, targetRevision: target.revision } }) }
  }
  try {
    expect((await request(undefined, randomUUID(), 'sales-1')).status).toBe(403)
    let preview = (await request(undefined, randomUUID(), 'owner', 'department')).value
    const permissions = db.prepare('SELECT permissions FROM users WHERE id = ?').get('sales-1')!.permissions
    expect((await request({ ...payload(preview, 'department'), assignments: [] })).status).toBe(200)
    expect(db.prepare('SELECT department_id FROM users WHERE id = ?').get('sales-1')!.department_id).toBe('logistics')
    expect(db.prepare('SELECT permissions FROM users WHERE id = ?').get('sales-1')!.permissions).toBe(permissions)
    expect(allCustomers().map(customer => customer.assignedToUserId)).toEqual(['sales-1', 'sales-1', 'sales-1'])
    preview = (await request()).value
    expect((await request({ ...payload(preview), assignments: payload(preview).assignments.slice(0, 1) })).status).toBe(400)
    const withoutOrderReceiver = { ...payload(preview), orderTargetId: '', orderTargetRevision: '' }
    expect((await request(withoutOrderReceiver)).status).toBe(400)
    expect(allCustomers().map(customer => customer.assignedToUserId)).toEqual(['sales-1', 'sales-1', 'sales-1'])
    expect(db.prepare('SELECT COUNT(*) AS count FROM crm_customer_handoffs').get()!.count).toBe(0)
    expect(db.prepare('SELECT enabled FROM users WHERE id = ?').get('sales-1')!.enabled).toBe(1)
    db.prepare('UPDATE crm_customers SET row_revision = ? WHERE id = ?').run('changed', 'a')
    expect((await request(payload(preview))).status).toBe(409)
    preview = (await request()).value
    const body = payload(preview)
    const key = randomUUID()
    const results = await Promise.all([request(body, key), request(body, key)])
    expect(results.map(result => result.status)).toEqual([200, 200])
    expect(results[0]!.value.id).toBe(results[1]!.value.id)
    expect(results[0]!.value.movedCustomers).toBe(3)
    expect(results[0]!.value.movedOrders).toBe(2)
    expect(allCustomers().map(customer => customer.assignedToUserId)).toEqual(['sales-2', 'sales-3', 'sales-2'])
    for (const customer of allCustomers()) {
      expect(customer.followUps[0].id).toBe(`follow-${customer.id}`)
      expect(customer.quotes[0].id).toBe(`quote-${customer.id}`)
    }
    expect(allOrders().map(order => order.responsibleUserId)).toEqual(['sales-2', 'sales-3'])
    expect(allOrders()[0]!.creator).toBe('sales-1')
    expect(allOrders()[0]!.openedBy).toBe('原开单人')
    expect(availableStock([stock], allOrders())).toEqual(locksBefore)
    expect(db.prepare('SELECT enabled FROM users WHERE id = ?').get('sales-1')!.enabled).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get('sales-1')!.count).toBe(0)
    expect((await request(undefined, randomUUID(), 'sales-1')).status).toBe(401)
    expect(() => db.prepare('UPDATE users SET enabled = 1 WHERE id = ?').run('sales-1')).toThrow('OFFBOARDED_USER')
    expect(() => db.prepare('DELETE FROM users WHERE id = ?').run('sales-1')).toThrow('OFFBOARDED_USER')
    expect(db.prepare('SELECT COUNT(*) AS count FROM crm_customer_handoffs').get()!.count).toBe(3)
    expect(JSON.parse(String(db.prepare("SELECT value FROM app_state WHERE key = 'customers'").get()!.value)).map((customer: any) => customer.assignedToUserId)).toEqual(['sales-2', 'sales-3', 'sales-2'])
    expect((await request({ ...body, reason: '更改内容' }, key)).status).toBe(409)
    expect((await request(body)).status).toBe(409)
  }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close() }
}, 30000)
