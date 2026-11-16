// @vitest-environment node
import { expect, it } from 'vitest'
import type { SQLInputValue } from 'node:sqlite'
import { openLocalDatabase } from '../scripts/local-database'
import { onRequest } from '../functions/[[path]]'

it('persists independent departments and rejects unauthorized or invalid assignments', async () => {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  function prepare(sql: string) {
    const statement = db.prepare(sql)
    let args: SQLInputValue[] = []
    return {
      bind(...values: SQLInputValue[]) { args = values; return this },
      first: async () => statement.get(...args) ?? null,
      all: async () => ({ results: statement.all(...args) }),
      execute: () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
      async run() { return this.execute() },
    }
  }
  const DB = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    db.exec('BEGIN')
    try { const results = statements.map(statement => statement.execute()); db.exec('COMMIT'); return results }
    catch (error) { db.exec('ROLLBACK'); throw error }
  } }
  async function request(path: string, method = 'GET', value?: unknown, token = 'owner') {
    const response = await onRequest({ request: new Request(`http://local/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: value ? JSON.stringify(value) : undefined }), env: { DB }, data: {}, functionPath: '/api', waitUntil() {}, passThroughOnException() {} }) as Response
    return { status: response.status, value: await response.json() }
  }
  try {
    for (const id of ['owner', 'sales-1']) db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(id, id, '2050-01-01T00:00:00.000Z')
    const original = db.prepare('SELECT permissions, role FROM users WHERE id = ?').get('sales-1')
    db.prepare('INSERT INTO crm_customers (id, assigned_to_user_id, value) VALUES (?,?,?)').run('customer', 'sales-1', '{}')
    expect((await request('/departments')).value.departments.map((row: { name: string }) => row.name)).toEqual(['销售一部', '销售二部', '后勤部', '仓库'])
    expect((await request('/departments', 'POST', { name: '生产部' }, 'sales-1')).status).toBe(403)
    expect((await request('/departments', 'POST', { name: ' 后勤部 ' })).status).toBe(409)
    const created = await request('/departments', 'POST', { name: '生产部' })
    expect(created.status).toBe(200)
    const departmentId = created.value.id
    let users = (await request('/state/admin-users')).value.value
    const sales = users.find((user: { id: string }) => user.id === 'sales-1')
    expect(sales.departmentId).toBe('sales-one')
    sales.departmentId = departmentId
    expect((await request('/state/admin-users', 'PUT', { value: users })).status).toBe(409)
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(departmentId, 'sales-1')
    expect(db.prepare('SELECT department_id FROM users WHERE id = ?').get('sales-1')!.department_id).toBe(departmentId)
    expect(db.prepare('SELECT permissions, role FROM users WHERE id = ?').get('sales-1')).toEqual(original)
    expect(db.prepare('SELECT assigned_to_user_id FROM crm_customers WHERE id = ?').get('customer')!.assigned_to_user_id).toBe('sales-1')
    expect((await request('/departments', 'POST', { id: departmentId, name: '生产部', enabled: false })).status).toBe(200)
    expect((await request('/state/admin-users', 'PUT', { value: users })).status).toBe(200)
    const snapshot = db.prepare("SELECT value FROM app_state WHERE key = 'admin-users'").get()!.value
    users.find((user: { id: string }) => user.id === 'sales-2').departmentId = departmentId
    expect((await request('/state/admin-users', 'PUT', { value: users })).status).toBe(400)
    expect(db.prepare("SELECT value FROM app_state WHERE key = 'admin-users'").get()!.value).toBe(snapshot)
    expect(() => db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(departmentId, 'sales-2')).toThrow('DEPARTMENT_INACTIVE')
    users = (await request('/state/admin-users')).value.value
    users.find((user: { id: string }) => user.id === 'sales-2').departmentId = 'not-existing'
    expect((await request('/state/admin-users', 'PUT', { value: users })).status).toBe(400)
    expect((await request('/departments', 'POST', { id: 'logistics', name: '后勤与行政部', enabled: true })).status).toBe(200)
    expect(db.prepare('SELECT name FROM departments WHERE id = ?').get('logistics')!.name).toBe('后勤与行政部')
    const login = await request('/auth/login', 'POST', { account: 'sales1', password: '123456' })
    expect(login.value.user.departmentId).toBe(departmentId)
  }
  finally { db.close() }
}, 30000)
