// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { openLocalDatabase } from '../scripts/local-database'
import { localWarehouse } from '../scripts/local-warehouse'
import { warehouseCloud } from '../functions/warehouse-cloud'
import { d1Adapter } from './d1-test-adapter'

it('runs the cloud warehouse with guarded reservations, replay, cuts, cancellation and atomic rollback', async () => {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  localWarehouse(db)
  for (const id of ['owner', 'sales-1', 'sales-2']) db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(id, id, '2050-01-01T00:00:00.000Z')
  const permissions = { warehouseRead: true, warehouseCreate: true, warehouseEnterPrice: true, warehouseViewPrice: true }
  db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), 'sales-1')
  db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value) VALUES (?,?,?,?)').run('c', '测试客户', 'sales-1', '{}')
  let conflict = false
  const adapter = d1Adapter(db, sql => {
    if (conflict && sql.some(sql => sql.startsWith('UPDATE transaction_guard'))) {
      conflict = false
      db.prepare('UPDATE warehouse_revision SET revision = revision + 1 WHERE id = 1').run()
    }
  })
  async function request(path = '/', body?: unknown, actor = 'owner', key = crypto.randomUUID()) {
    const response = await warehouseCloud(new Request(`https://example.test/api/local-warehouse${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${actor}`, 'Idempotency-Key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), adapter)
    return { status: response.status, value: await response.json() }
  }
  const line = { stockId: 'demo-a', kind: 'meter', meters: 8, count: 1, price: 12, packaging: '' }
  const body = { receiver: '测试', customerId: 'c', date: '2026-11-16', lines: [line] }
  try {
    expect((await request('/', undefined, 'missing')).status).toBe(401)
    expect((await request('/orders', body, 'sales-2')).status).toBe(403)
    const before = (await request()).value.stocks.find((stock: any) => stock.id === 'demo-a')
    const key = crypto.randomUUID()
    const created = await request('/orders', body, 'sales-1', key)
    expect(created.status).toBe(200)
    expect((await request('/orders', body, 'sales-1', key)).value.id).toBe(created.value.id)
    expect((await request('/orders', { ...body, receiver: '不同内容' }, 'sales-1', key)).status).toBe(409)
    const pending = (await request()).value.stocks.find((stock: any) => stock.id === 'demo-a')
    expect(pending.rolls).toBe(before.rolls)
    expect(pending.availableRolls).toBe(before.rolls - 1)
    const ship = { id: created.value.id, action: 'ship' }
    const shipKey = crypto.randomUUID()
    expect((await request('/dispatch', ship, 'owner', shipKey)).status).toBe(200)
    expect((await request('/dispatch', ship, 'owner', shipKey)).status).toBe(200)
    const after = (await request()).value.stocks.find((stock: any) => stock.id === 'demo-a')
    expect(after.rolls).toBe(before.rolls - 1)
    expect(after.remnants[17]).toBe(1)
    expect((await request('/dispatch', { id: created.value.id, action: 'cancel', reason: '不能撤销已发货' })).status).toBe(409)
    const second = await request('/orders', body, 'sales-1')
    expect((await request('/dispatch', { id: second.value.id, action: 'cancel', reason: '测试取消' }, 'sales-1')).status).toBe(200)
    const cancelled = (await request()).value.stocks.find((stock: any) => stock.id === 'demo-a')
    expect(cancelled.reservedRolls).toBe(0)
    const count = db.prepare('SELECT count(*) AS n FROM warehouse_orders').get()!.n
    conflict = true
    expect((await request('/orders', body, 'sales-1')).status).toBe(409)
    expect(db.prepare('SELECT count(*) AS n FROM warehouse_orders').get()!.n).toBe(count)
    const excessive = { ...body, lines: [line, { ...line, count: 100000 }] }
    expect((await request('/orders', excessive, 'sales-1')).status).toBe(409)
    expect(db.prepare('SELECT count(*) AS n FROM warehouse_orders').get()!.n).toBe(count)
    const auditCount = db.prepare('SELECT count(*) AS n FROM warehouse_log').get()!.n
    db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON warehouse_log BEGIN SELECT RAISE(ABORT, 'injected-audit-failure'); END;")
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect((await request('/orders', body, 'sales-1')).status).toBe(500) }
    finally { errorLog.mockRestore() }
    expect(db.prepare('SELECT count(*) AS n FROM warehouse_orders').get()!.n).toBe(count)
    expect(db.prepare('SELECT count(*) AS n FROM warehouse_log').get()!.n).toBe(auditCount)
    db.exec('DROP TRIGGER fail_audit')
    db.exec('DELETE FROM transaction_guard')
    expect((await request('/orders', body, 'sales-1')).status).toBe(503)
    expect(db.prepare('SELECT count(*) AS n FROM warehouse_orders').get()!.n).toBe(count)
  }
  finally { db.close() }
})
