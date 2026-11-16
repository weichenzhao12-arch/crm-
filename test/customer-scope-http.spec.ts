// @vitest-environment node
import { createServer } from 'node:http'
import type { SQLInputValue } from 'node:sqlite'
import { expect, it } from 'vitest'
import { openLocalDatabase } from '../scripts/local-database'
import { localWarehouse } from '../scripts/local-warehouse'
import { warehouseCloud } from '../functions/warehouse-cloud'
import { onRequest } from '../functions/[[path]]'

it('enforces explicit hierarchy scope across row, legacy and both warehouse handlers', async () => {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  let beforeCommit: (() => void) | undefined
  function prepare(sql: string) {
    const statement = db.prepare(sql)
    let args: SQLInputValue[] = []
    return {
      sql,
      bind(...values: SQLInputValue[]) { args = values; return this },
      first: async () => statement.get(...args) ?? null,
      all: async () => ({ results: statement.all(...args) }),
      execute: () => statement.columns().length ? { results: statement.all(...args) } : { meta: { changes: Number(statement.run(...args).changes) } },
      async run() { return this.execute() },
    }
  }
  const DB = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    if (statements.some(statement => statement.sql.startsWith('UPDATE transaction_guard')) && beforeCommit) {
      const change = beforeCommit
      beforeCommit = undefined
      change()
    }
    db.exec('BEGIN')
    try { const results = statements.map(statement => statement.execute()); db.exec('COMMIT'); return results }
    catch (error) { db.exec('ROLLBACK'); throw error }
  } }
  const server = createServer(localWarehouse(db))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const headers = { Authorization: 'Bearer scope', 'Content-Type': 'application/json' }
  const request = (path: string, method = 'GET', value?: unknown, row = true) => onRequest({
    request: new Request(`http://local/api${path}`, { method, headers, body: value ? JSON.stringify(value) : undefined }),
    env: { DB, CUSTOMER_ROW_API: row ? 'enabled' : undefined }, data: {}, functionPath: '/api', waitUntil() {}, passThroughOnException() {},
  }) as Promise<Response>
  const permissions = { position: 'director', issueSamples: true, warehouseCreate: true }
  function setPermissions(extra = {}) {
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify({ ...permissions, ...extra }), 'sales-1')
  }
  try {
    db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run('scope', 'sales-1', '2050-01-01T00:00:00.000Z')
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify({ position: 'sales', supervisorId: 'sales-1' }), 'sales-2')
    for (const id of ['sales-1', 'sales-2']) db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value) VALUES (?,?,?,?)').run(id, id, id, JSON.stringify({ id, name: id, assignedToUserId: id }))
    const rowIds = async () => (await (await request('/customers')).json()).customers.map((row: any) => row.value.id).sort()
    const cloudIds = async () => (await (await warehouseCloud(new Request('http://local/api/local-warehouse/', { headers }), DB as any)).json()).customers.map((row: any) => row.id).sort()
    const localIds = async () => (await (await fetch(`${url}/`, { headers })).json()).customers.map((row: any) => row.id).sort()
    setPermissions()
    expect(await rowIds()).toEqual(['sales-1'])
    expect(await cloudIds()).toEqual(['sales-1'])
    expect(await localIds()).toEqual(['sales-1'])
    setPermissions({ customerScope: 'team' })
    expect(await rowIds()).toEqual(['sales-1'])
    setPermissions({ customerScope: 'team', managedDepartmentIds: ['sales-two'] })
    expect(await rowIds()).toEqual(['sales-1', 'sales-2'])
    expect(await cloudIds()).toEqual(['sales-1', 'sales-2'])
    expect(await localIds()).toEqual(['sales-1', 'sales-2'])
    expect((await request('/customers/sales-2')).status).toBe(200)
    expect((await request('/customers/sales-2', 'PATCH', { revision: '', fields: { name: 'Denied' } })).status).toBe(404)
    const legacy = await (await request('/state/customers', 'GET', undefined, false)).json()
    expect(legacy.value.map((row: any) => row.id).sort()).toEqual(['sales-1', 'sales-2'])
    expect((await request('/customers/handoff-targets')).status).toBe(403)
    const order = { customerId: 'sales-2', date: '2026-11-15', receiver: 'Scope test', lines: [{ stockId: 'demo-a', kind: 'roll', count: 1, price: null, packaging: '' }] }
    const submit = () => warehouseCloud(new Request('http://local/api/local-warehouse/orders', {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(order),
    }), DB as any)
    beforeCommit = () => db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run('{"position":"sales"}', 'sales-2')
    expect((await submit()).status).toBe(409)
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouse_orders').get()!.count).toBe(0)
    expect((await submit()).status).toBe(403)
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run('{"position":"sales","supervisorId":"sales-1"}', 'sales-2')
    setPermissions({ customerScope: 'team', managedDepartmentIds: ['sales-two'], supervisorId: 'sales-2' })
    expect(await rowIds()).toEqual(['sales-1'])
    expect(await cloudIds()).toEqual(['sales-1'])
    expect(await localIds()).toEqual(['sales-1'])
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
