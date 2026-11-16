// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { warehouseDealer } from '../functions/warehouse-dealer'
import { warehouseFields } from '../src/features/warehouse/model'
import { d1Adapter } from './d1-test-adapter'

const databases: DatabaseSync[] = []
afterEach(() => { vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close() })
function setup() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  for (const file of ['0009_warehouse.sql', '0015_dealer_access.sql'])
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  const call = (method = 'GET', options: { cookie?: string, password?: unknown, secret?: string, headers?: Record<string, string>, url?: string } = {}) => warehouseDealer(new Request(options.url || 'https://dealer.test/api/local-warehouse/dealer', {
    method, headers: { ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers },
    ...(method === 'POST' ? { body: JSON.stringify({ password: options.password ?? 'production-secret' }) } : {}),
  }), d1Adapter(db), options.secret ?? 'production-secret')
  return { db, call }
}

it('persists hashed sessions across adapters, rotates credentials, expires and revokes cookies', async () => {
  const { db, call } = setup()
  expect((await call()).status).toBe(401)
  const login = await call('POST')
  expect(login.status).toBe(200)
  const cookie = login.headers.get('Set-Cookie')!
  expect(cookie).toContain('Path=/api/local-warehouse/dealer; HttpOnly; SameSite=Strict; Max-Age=3600; Secure')
  const token = cookie.split(';')[0]!.split('=')[1]!
  const stored = db.prepare('SELECT * FROM warehouse_dealer_sessions').get()!
  expect(stored.token_hash).not.toBe(token)
  expect(String(stored.token_hash)).toMatch(/^[a-f0-9]{64}$/)
  expect(stored.password_hash).not.toBe('production-secret')
  expect((await call('GET', { cookie })).status).toBe(200)
  expect((await call('GET', { cookie, secret: 'rotated' })).status).toBe(401)
  expect((await call('DELETE', { cookie })).headers.get('Set-Cookie')).toContain('Max-Age=0; Secure')
  expect((await call('GET', { cookie })).status).toBe(401)
  const next = (await call('POST')).headers.get('Set-Cookie')!
  db.exec('UPDATE warehouse_dealer_sessions SET expires_at = 0')
  expect((await call('GET', { cookie: next })).status).toBe(401)
  const http = await call('POST', { url: 'http://dealer.test/api/local-warehouse/dealer' })
  expect(http.headers.get('Set-Cookie')).not.toContain('; Secure')
})

it('publishes only whitelisted complete stock specs with pending reservations deducted', async () => {
  const { db, call } = setup()
  const stock = { ...Object.fromEntries(warehouseFields.map(([key]) => [key, `spec-${key}`])), id: 'public', width: 4, length: 25, rolls: 6, remnants: { 7: 3, 9: 2 }, visible: true, customer: 'PRIVATE', orders: ['PRIVATE'], price: 999 }
  for (const item of [stock, { ...stock, id: 'hidden', visible: false }])
    db.prepare('INSERT INTO warehouse_stock VALUES (?, ?)').run(item.id, JSON.stringify(item))
  const line = { stockId: 'public', kind: 'cut', meters: 5, count: 2, price: 123, customer: 'PRIVATE' }
  for (const order of [
    { id: 'pending', status: 'pending', customerId: 'PRIVATE', lines: [line, { ...line, kind: 'remnant', meters: 7, count: 1 }, { ...line, sourceMeters: 9, count: 1 }] },
    { id: 'shipped', status: 'shipped', lines: [line] },
  ]) db.prepare('INSERT INTO warehouse_orders VALUES (?, ?)').run(order.id, JSON.stringify(order))
  const before = db.prepare('SELECT * FROM warehouse_stock').all()
  const cookie = (await call('POST')).headers.get('Set-Cookie')!
  const response = await call('GET', { cookie })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const value = await response.json()
  expect(value).toEqual({ stocks: [{ ...Object.fromEntries(warehouseFields.map(([key]) => [key, `spec-${key}`])), id: 'public', width: 4, length: 25, rolls: 4, remnants: { 7: 2, 9: 1 } }] })
  expect(JSON.stringify(value)).not.toMatch(/PRIVATE|price|visible|customer|orders/)
  expect(db.prepare('SELECT * FROM warehouse_stock').all()).toEqual(before)
  expect((await call('POST', { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
  expect((await call('DELETE', { cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
})

it('atomically rate limits concurrent attempts across handler instances and resets durably', async () => {
  const { db, call } = setup()
  const start = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(start)
  const replies = await Promise.all(Array.from({ length: 12 }, () => call('POST', { password: 'incorrect' })))
  expect(replies.filter(response => response.status === 401)).toHaveLength(5)
  expect(replies.filter(response => response.status === 429)).toHaveLength(7)
  expect((await call('POST')).status).toBe(429)
  expect(db.prepare("SELECT attempts FROM warehouse_dealer_rate WHERE bucket LIKE 'ip:%'").get()!.attempts).toBe(13)
  vi.mocked(Date.now).mockReturnValue(start + 61000)
  expect((await call('POST')).status).toBe(200)
  db.exec("UPDATE warehouse_dealer_rate SET attempts = 1000 WHERE bucket = 'global'")
  expect((await call('POST', { headers: { 'CF-Connecting-IP': '192.0.2.10' } })).status).toBe(429)
})

it('fails closed without a configured password, bounds input and hides internal errors', async () => {
  const { db, call } = setup()
  expect((await call('POST', { secret: '' })).status).toBe(503)
  const invalid = await call('POST', { password: 'wrong' })
  expect(invalid.status).toBe(401)
  expect(await invalid.json()).toMatchObject({ message: '查询密码不正确' })
  expect((await call('POST', { password: 'x'.repeat(5000) })).status).toBe(401)
  expect((await call('POST', { password: { nested: 'no' } })).status).toBe(401)
  expect((await call('PATCH')).status).toBe(405)
  expect((await call('GET', { url: 'https://dealer.test/api/local-warehouse/dealer/other' })).status).toBe(404)
  const cookie = (await call('POST')).headers.get('Set-Cookie')!
  db.exec("INSERT INTO warehouse_stock VALUES ('private-code', 'not-json')")
  const failed = await call('GET', { cookie })
  expect(failed.status).toBe(503)
  expect(await failed.text()).not.toContain('private-code')
})
