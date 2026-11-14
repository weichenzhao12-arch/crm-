import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { onRequest } from '../functions/[[path]]'

it('enforces authenticated row isolation and handoff through HTTP', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const migrations = resolve('migrations')
    for (const file of readdirSync(migrations).sort())
      db.exec(readFileSync(resolve(migrations, file), 'utf8'))
    const session = db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)')
    const addUser = db.prepare('INSERT INTO users (id,account,display_name,role,password,permissions) VALUES (?,?,?,?,?,?)')
    addUser.run('clerk', 'clerk', 'Clerk', 'quoter', 'test', '{"assignUnclaimedCustomers":true}')
    addUser.run('viewer', 'viewer', 'Viewer', 'viewer', 'test', '{"assignUnclaimedCustomers":true}')
    addUser.run('read-manager', 'read-manager', 'Read manager', 'manager', 'test', '{"viewAllCustomers":true}')
    addUser.run('transfer-manager', 'transfer-manager', 'Transfer manager', 'manager', 'test', '{"transferCustomers":true}')
    for (const id of ['owner', 'sales-1', 'sales-2', 'clerk', 'viewer', 'read-manager', 'transfer-manager'])
      session.run(id, id, '2999-01-01T00:00:00.000Z')
    const insert = db.prepare('INSERT INTO crm_customers (id,assigned_to_user_id,value) VALUES (?,?,?)')
    insert.run('a', 'sales-1', JSON.stringify({ id: 'a', followUps: [{ id: 'original' }] }))
    insert.run('b', 'sales-2', JSON.stringify({ id: 'b' }))
    insert.run('u', null, JSON.stringify({ id: 'u' }))
    const DB = {
      prepare(sql: string) {
        const statement = db.prepare(sql)
        let args: SQLInputValue[] = []
        return {
          bind(...values: typeof args) { args = values; return this },
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
        }
      },
      async batch(statements: { run: () => Promise<unknown> }[]) {
        db.exec('BEGIN')
        try {
          const result = []
          for (const statement of statements)
            result.push(await statement.run())
          db.exec('COMMIT')
          return result
        }
        catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      },
    }
    const request = (path: string, user = '', method = 'GET', body?: unknown) => onRequest({
      request: new Request(`http://localhost/api/${path}`, {
        method, headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env: { DB, CUSTOMER_ROW_API: 'enabled' },
      data: {}, functionPath: '/api', waitUntil() {}, passThroughOnException() {},
    }) as Promise<Response>

    expect((await request('customers')).status).toBe(401)
    const list = await (await request('customers', 'sales-1')).json()
    expect(list.customers.map((row: { value: { id: string } }) => row.value.id)).toEqual(['a'])
    expect((await request('customers/b', 'sales-1')).status).toBe(404)
    expect((await request('customers/b', 'sales-1', 'PATCH', { revision: '', fields: { name: 'Forbidden' } })).status).toBe(404)
    expect((await request('state/customers', 'sales-1')).status).toBe(410)
    expect((await request('state/customers', 'owner', 'PUT', { value: [] })).status).toBe(410)

    const handoff = { revision: '', toUserId: 'sales-2', reason: 'Test', progress: 'Progress', nextAction: 'Call', dueAt: '2026-11-04T10:00' }
    expect((await request('customers/a/handoff', 'sales-1', 'POST', handoff)).status).toBe(403)
    expect((await request('customers/a', 'read-manager')).status).toBe(200)
    expect((await request('customers/a/handoff', 'read-manager', 'POST', handoff)).status).toBe(403)
    expect((await request('customers/a/handoff', 'transfer-manager', 'POST', handoff)).status).toBe(403)
    expect((await request('customers/a/handoff', 'owner', 'POST', handoff)).status).toBe(200)
    expect((await request('customers/a/handoff', 'owner', 'POST', handoff)).status).toBe(409)
    expect((await request('customers/a', 'sales-1')).status).toBe(404)
    const transferred = await (await request('customers/a', 'sales-2')).json()
    expect(transferred.value.assignedToUserId).toBe('sales-2')
    expect(transferred.value.followUps).toMatchObject([{ reminderDate: '2026-11-04', reminderTime: '10:00', nextAction: 'Call' }, { id: 'original' }])
    expect((await request('customers/a', 'sales-2', 'PATCH', { revision: transferred.revision, fields: { assignedToUserId: 'sales-1' } })).status).toBe(400)
    expect((await request('customers/a', 'sales-2', 'PATCH', { revision: transferred.revision, fields: { name: 'Edited' } })).status).toBe(200)
    expect((await request('customers/a', 'sales-2', 'PATCH', { revision: transferred.revision, fields: { name: 'Stale' } })).status).toBe(409)
    expect(db.prepare('SELECT count(*) AS count FROM crm_customer_handoffs').get()?.count).toBe(1)

    expect((await request('customers/unclaimed')).status).toBe(401)
    expect((await request('customers/unclaimed', 'sales-1')).status).toBe(403)
    expect((await request('customers/unclaimed', 'viewer')).status).toBe(403)
    expect((await request('customers/b', 'clerk')).status).toBe(404)
    expect((await request('customers/b/handoff', 'clerk', 'POST', handoff)).status).toBe(403)
    const queue = await (await request('customers/unclaimed', 'clerk')).json()
    expect(queue.customers).toEqual([{ value: { id: 'u' }, revision: '' }])
    const assignment = { toUserId: 'sales-2', customers: [{ id: 'u', revision: '' }, { id: 'b', revision: '' }] }
    expect((await request('customers/unclaimed/assign', 'viewer', 'POST', assignment)).status).toBe(403)
    expect((await request('customers/unclaimed/assign', 'clerk', 'POST', { ...assignment, toUserId: 'viewer' })).status).toBe(400)
    const assigned = await (await request('customers/unclaimed/assign', 'clerk', 'POST', assignment)).json()
    expect(assigned.items).toEqual([{ id: 'u', assigned: true }, { id: 'b', assigned: false }])
    const replay = await (await request('customers/unclaimed/assign', 'clerk', 'POST', assignment)).json()
    expect(replay.items.every((item: { assigned: boolean }) => !item.assigned)).toBe(true)
    expect((await request('customers/u', 'sales-2')).status).toBe(200)
    expect((await request('customers/u', 'clerk')).status).toBe(404)
    expect(db.prepare('SELECT actor_user_id, to_user_id FROM crm_customer_assignments').all())
      .toEqual([{ actor_user_id: 'clerk', to_user_id: 'sales-2' }])
  }
  finally {
    db.close()
  }
})
