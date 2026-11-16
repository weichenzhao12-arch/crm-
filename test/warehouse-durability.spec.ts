// @vitest-environment node
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { backupLocalDatabase, openLocalDatabase } from '../scripts/local-database'
import { localWarehouse } from '../scripts/local-warehouse'

const root = resolve(import.meta.dirname, '..')
const base = resolve(root, '.local-data/qa')
mkdirSync(base, { recursive: true })
const directory = mkdtempSync(resolve(base, 'durability-'))
afterAll(() => { if (directory.startsWith(`${base}\\`) || directory.startsWith(`${base}/`)) rmSync(directory, { recursive: true, force: true }) })

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
const order = { date: '2026-11-15', receiver: '持久化测试', lines: [{ stockId: 'demo-a', kind: 'meter', meters: 8, count: 1, price: null, packaging: '' }] }

it('keeps orders and locks across restart, replays writes once and restores a consistent backup', async () => {
  const file = resolve(directory, 'crm.sqlite')
  let db = openLocalDatabase(root, file)
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('durable-token', 'owner', '2050-01-01T00:00:00.000Z')
  let server = createServer(localWarehouse(db))
  let url = await listen(server)
  async function request(path: string, body?: unknown, key = randomUUID()) {
    const response = await fetch(url + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer durable-token', 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, value: await response.json() }
  }
  try {
    const key = randomUUID()
    const attempts = await Promise.all([request('/orders', order, key), request('/orders', order, key)])
    expect(attempts.map(result => result.status)).toEqual([200, 200])
    const id = attempts[0]!.value.id
    expect(attempts[1]!.value.id).toBe(id)
    const before = (await request('/')).value
    expect(before.orders).toHaveLength(1)
    expect(before.stocks.find((stock: { id: string }) => stock.id === 'demo-a').reservedRolls).toBe(1)
    expect((await request('/orders', { ...order, receiver: '不同内容' }, key)).status).toBe(409)
    const backup = resolve(directory, 'backup.sqlite')
    backupLocalDatabase(db, backup)
    await close(server)
    db.close()
    db = openLocalDatabase(root, file)
    server = createServer(localWarehouse(db))
    url = await listen(server)
    expect((await request('/')).value.stocks).toEqual(before.stocks)
    expect((await request('/orders', order, key)).value.id).toBe(id)
    const dispatch = { id, action: 'ship' }
    const shipKey = randomUUID()
    expect((await request('/dispatch', dispatch, shipKey)).status).toBe(200)
    expect((await request('/dispatch', dispatch, shipKey)).status).toBe(200)
    const shipped = (await request('/')).value
    const stock = shipped.stocks.find((stock: { id: string }) => stock.id === 'demo-a')
    expect(stock.rolls).toBe(4)
    expect(stock.reservedRolls).toBe(0)
    expect(stock.remnants[17]).toBe(1)
    expect(shipped.history.filter((event: { event: string }) => event.event === '锁定转出库')).toHaveLength(1)
    const adjustment = { id: 'demo-a', rolls: 2, direction: 'in' }
    const receiveKey = randomUUID()
    expect((await request('/stock', adjustment, receiveKey)).status).toBe(200)
    expect((await request('/stock', adjustment, receiveKey)).status).toBe(200)
    expect((await request('/')).value.stocks.find((stock: { id: string }) => stock.id === 'demo-a').rolls).toBe(6)
    const failure = await request('/stock', { id: 'demo-a', rolls: 5, remnants: [{ meters: 99, count: 1 }] })
    expect(failure.status).toBe(400)
    expect((await request('/')).value.stocks.find((stock: { id: string }) => stock.id === 'demo-a').rolls).toBe(6)
    const restoredPath = resolve(directory, 'restored.sqlite')
    copyFileSync(backup, restoredPath)
    const restored = openLocalDatabase(root, restoredPath)
    try {
      expect(JSON.parse(String(restored.prepare('SELECT value FROM warehouse_orders WHERE id = ?').get(id)!.value)).status).toBe('pending')
      expect(restored.prepare('SELECT COUNT(*) AS count FROM warehouse_requests').get()!.count).toBe(1)
    }
    finally { restored.close() }
  }
  finally { await close(server); db.close() }
}, 30000)

it('does not reapply old migrations or overwrite seed stock', () => {
  const file = resolve(directory, 'repeat.sqlite')
  let db = openLocalDatabase(root, file)
  localWarehouse(db)
  db.prepare('UPDATE warehouse_stock SET value = ? WHERE id = ?').run(JSON.stringify({ id: 'demo-a', rolls: 99 }), 'demo-a')
  const count = db.prepare('SELECT COUNT(*) AS count FROM local_migrations').get()!.count
  db.close()
  db = openLocalDatabase(root, file)
  try {
    localWarehouse(db)
    expect(db.prepare('SELECT COUNT(*) AS count FROM local_migrations').get()!.count).toBe(count)
    expect(JSON.parse(String(db.prepare('SELECT value FROM warehouse_stock WHERE id = ?').get('demo-a')!.value)).rolls).toBe(99)
  }
  finally { db.close() }
})

it('serializes competing reservations from two independent database connections', async () => {
  const file = resolve(directory, 'concurrent.sqlite')
  const first = openLocalDatabase(root, file)
  first.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('concurrent-token', 'owner', '2050-01-01T00:00:00.000Z')
  const firstServer = createServer(localWarehouse(first))
  const second = openLocalDatabase(root, file)
  const secondServer = createServer(localWarehouse(second))
  const urls = await Promise.all([listen(firstServer), listen(secondServer)])
  try {
    const responses = await Promise.all(urls.map(url => fetch(url + '/orders', { method: 'POST', headers: { Authorization: 'Bearer concurrent-token', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ ...order, lines: [{ ...order.lines[0], kind: 'roll', count: 3, stockId: 'demo-b' }] }) })))
    expect(responses.map(response => response.status).sort()).toEqual([200, 409])
    expect(first.prepare('SELECT COUNT(*) AS count FROM warehouse_orders').get()!.count).toBe(1)
    expect(second.prepare('SELECT COUNT(*) AS count FROM warehouse_requests').get()!.count).toBe(1)
  }
  finally { await Promise.all([close(firstServer), close(secondServer)]); first.close(); second.close() }
}, 30000)
