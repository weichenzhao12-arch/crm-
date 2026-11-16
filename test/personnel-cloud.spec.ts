// @vitest-environment node
import { expect, it } from 'vitest'
import { openLocalDatabase } from '../scripts/local-database'
import { handlePersonnelRequest } from '../functions/personnel-cloud'
import { d1Adapter } from './d1-test-adapter'

function fixture() {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run('owner', 'owner', '2050-01-01T00:00:00.000Z')
  db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value,row_revision) VALUES (?,?,?,?,?)').run('c', 'Customer', 'sales-1', JSON.stringify({ id: 'c', assignedToUserId: 'sales-1', followUps: [{ reminderDate: '2030-01-01' }] }), 'v1')
  const order = { id: 'o', customerId: 'c', creator: 'sales-1', status: 'pending', lines: [{ stockId: 's', count: 2 }], receiver: 'Customer' }
  db.prepare('INSERT INTO warehouse_orders (id,value) VALUES (?,?)').run('o', JSON.stringify(order))
  let mutate: (() => void) | undefined
  const batches: number[] = []
  const bindingCounts: number[] = []
  const adapter = d1Adapter(db, sql => {
    batches.push(sql.length)
    if (sql[0]?.startsWith('UPDATE transaction_guard') && mutate) { const run = mutate; mutate = undefined; run() }
  })
  const prepare = adapter.prepare.bind(adapter)
  adapter.prepare = sql => {
    const statement = prepare(sql)
    const bind = statement.bind.bind(statement)
    statement.bind = (...values) => { bindingCounts.push(values.length); return bind(...values) }
    return statement
  }
  async function request(body?: any, key = crypto.randomUUID(), token = 'owner') {
    const response = await handlePersonnelRequest(new Request('https://example.test/api/local-personnel?sourceId=sales-1&mode=handoff', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body: body ? JSON.stringify(body) : undefined }), adapter)
    return { status: response.status, value: await response.json() }
  }
  async function payload(mode = 'handoff') {
    const { value } = await request()
    const target = value.targets.find((item: any) => item.id === 'sales-2')
    return { mode, sourceId: 'sales-1', sourceRevision: value.source.revision, ordersRevision: value.ordersRevision, reason: 'handoff', departmentId: 'sales-two', assignments: value.customers.map((item: any) => ({ id: item.id, revision: item.revision, toUserId: target.id, targetRevision: target.revision })) }
  }
  return { db, request, payload, batches, bindingCounts, inject: (run: () => void) => { mutate = run } }
}

it('hands off with replay and leaves order locks and follow-ups unchanged', async () => {
  const f = fixture()
  try {
    const body = await f.payload('leave')
    const key = crypto.randomUUID()
    const result = await f.request(body, key)
    expect(result.status).toBe(200)
    expect(result.value).toMatchObject({ movedCustomers: 1, movedOrders: 1, sourceDisabled: true })
    expect((await f.request(body, key)).value).toEqual(result.value)
    expect((await f.request({ ...body, reason: 'different' }, key)).status).toBe(409)
    const order = JSON.parse(String(f.db.prepare('SELECT value FROM warehouse_orders').get()!.value))
    expect(order).toMatchObject({ status: 'pending', responsibleUserId: 'sales-2', lines: [{ stockId: 's', count: 2 }] })
    const customer = JSON.parse(String(f.db.prepare('SELECT value FROM crm_customers').get()!.value))
    expect(customer.followUps).toEqual([{ reminderDate: '2030-01-01' }])
    expect(f.db.prepare("SELECT enabled FROM users WHERE id='sales-1'").get()!.enabled).toBe(0)
  } finally { f.db.close() }
})

for (const sql of [
  "UPDATE users SET display_name='changed' WHERE id='sales-1'",
  "UPDATE users SET permissions='{}' WHERE id='sales-2'",
  "UPDATE users SET enabled=0 WHERE id='owner'",
  "UPDATE crm_customers SET value='{}' WHERE id='c'",
  "INSERT INTO crm_customers (id,value,assigned_to_user_id) VALUES ('new','{}','sales-1')",
  "DELETE FROM crm_customers WHERE id='c'",
  "UPDATE warehouse_orders SET value=json_set(value,'$.status','shipped') WHERE id='o'",
  "INSERT INTO app_state (key,value) VALUES ('customers','[]')",
  "UPDATE departments SET enabled=0 WHERE id='sales-two'",
  "DELETE FROM sessions WHERE token='owner'",
]) it(`rolls back stale snapshot: ${sql}`, async () => {
  const f = fixture()
  try {
    const body = await f.payload('leave')
    f.inject(() => f.db.exec(sql))
    expect((await f.request(body)).status).toBe(409)
    for (const table of ['personnel_handoff_batches', 'personnel_departures', 'crm_customer_handoffs', 'warehouse_log']) expect(f.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n).toBe(0)
    expect(f.db.prepare("SELECT enabled FROM users WHERE id='sales-1'").get()!.enabled).toBe(1)
  } finally { f.db.close() }
})

it('rolls back earlier writes if a later write fails', async () => {
  const f = fixture()
  try {
    const body = await f.payload('leave')
    f.db.exec("CREATE TRIGGER fail_batch BEFORE INSERT ON personnel_handoff_batches BEGIN SELECT RAISE(ABORT, 'CHECK constraint forced'); END")
    expect((await f.request(body)).status).toBe(409)
    expect(f.db.prepare("SELECT assigned_to_user_id FROM crm_customers WHERE id='c'").get()!.assigned_to_user_id).toBe('sales-1')
    expect(f.db.prepare('SELECT count(*) n FROM personnel_departures').get()!.n).toBe(0)
    expect(f.db.prepare('SELECT count(*) n FROM crm_customer_handoffs').get()!.n).toBe(0)
  } finally { f.db.close() }
})

it('supports department changes and rejects stale previews and unauthenticated requests', async () => {
  const f = fixture()
  try {
    expect((await f.request(undefined, undefined, 'missing')).status).toBe(401)
    const body = await f.payload('department')
    expect((await f.request({ ...body, assignments: [] })).status).toBe(200)
    expect(f.db.prepare("SELECT department_id FROM users WHERE id='sales-1'").get()!.department_id).toBe('sales-two')
    expect((await f.request(body)).status).toBe(409)
  } finally { f.db.close() }
})

it('bulk hands off 40 customers and orders below free invocation and binding limits', async () => {
  const f = fixture()
  try {
    for (let i = 1; i < 40; i++) {
      const id = `c${i}`
      f.db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value,row_revision) VALUES (?,?,?,?,?)').run(id, id, 'sales-1', JSON.stringify({ id, assignedToUserId: 'sales-1' }), 'v1')
      f.db.prepare('INSERT INTO warehouse_orders (id,value) VALUES (?,?)').run(`o${i}`, JSON.stringify({ id: `o${i}`, customerId: id, creator: 'sales-1', status: 'rejected', lines: [{ count: i }] }))
    }
    const body = await f.payload('leave')
    f.batches.length = 0
    f.bindingCounts.length = 0
    const result = await f.request(body)
    expect(result.status).toBe(200)
    expect(result.value).toMatchObject({ movedCustomers: 40, movedOrders: 40, sourceDisabled: true })
    expect(f.batches.reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(45)
    expect(f.batches).toEqual([9, 10])
    expect(Math.max(...f.bindingCounts)).toBeLessThanOrEqual(100)
    expect(f.db.prepare("SELECT count(*) n FROM crm_customers WHERE assigned_to_user_id='sales-2'").get()!.n).toBe(40)
    expect(f.db.prepare('SELECT count(*) n FROM crm_customer_handoffs').get()!.n).toBe(40)
    expect(f.db.prepare('SELECT count(*) n FROM warehouse_log').get()!.n).toBe(40)
    const orders = f.db.prepare('SELECT value FROM warehouse_orders').all().map(row => JSON.parse(String(row.value)))
    expect(orders.every(order => order.responsibleUserId === 'sales-2')).toBe(true)
    expect(orders.find(order => order.id === 'o39')).toMatchObject({ status: 'rejected', lines: [{ count: 39 }] })
  } finally { f.db.close() }
})

it('returns 503 without writing when the transaction guard singleton is missing', async () => {
  const f = fixture()
  try {
    const body = await f.payload()
    f.db.exec('DELETE FROM transaction_guard')
    expect((await f.request(body)).status).toBe(503)
    expect(f.db.prepare('SELECT count(*) n FROM personnel_handoff_batches').get()!.n).toBe(0)
  } finally { f.db.close() }
})

it('rejects oversized UTF-8 request bodies before database reads', async () => {
  const f = fixture()
  try {
    expect((await f.request({ reason: '\u4e2d'.repeat(350000) })).status).toBe(413)
    expect(f.batches).toEqual([])
  } finally { f.db.close() }
})

it('rejects oversized snapshots before any write batch', async () => {
  const f = fixture()
  try {
    const body = await f.payload()
    f.db.prepare("UPDATE crm_customers SET value=? WHERE id='c'").run(JSON.stringify({ id: 'c', notes: 'x'.repeat(1800000) }))
    f.batches.length = 0
    expect((await f.request(body)).status).toBe(413)
    expect(f.batches).toEqual([9])
    expect(f.db.prepare('SELECT count(*) n FROM personnel_handoff_batches').get()!.n).toBe(0)
  } finally { f.db.close() }
})
