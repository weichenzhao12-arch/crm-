import { availableStock, warehouseFields } from '../src/features/warehouse/model'
import type { Order, Stock } from '../src/features/warehouse/model'

const path = '/api/local-warehouse/dealer'
const ttl = 3600
const windowSeconds = 60
const json = (status: number, value: unknown, headers: Record<string, string> = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
})

async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function cookie(request: Request, token: string, age: number) {
  return `local-dealer=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}

async function passwordBody(request: Request): Promise<string | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 4096) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes))
    return body && typeof body.password === 'string' ? body.password : null
  }
  catch { return null }
}

/** Standalone dealer route: no CRM authentication or warehouse write permissions. */
export async function warehouseDealer(request: Request, db: D1Database, password: string): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== path) return json(404, { message: '查询入口不存在' })
  if (!['POST', 'GET', 'DELETE'].includes(request.method)) return json(405, { message: '不支持此操作' }, { Allow: 'POST, GET, DELETE' })
  if ((request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
    || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json(403, { message: '不允许跨站请求' })
  if (typeof password !== 'string' || !password.trim()) return json(503, { message: '库存查询尚未开放，请联系工作人员' })
  try {
    const now = Math.floor(Date.now() / 1000)
    const passwordHash = await hash(password)
    if (request.method === 'POST') {
      // Both gates increment atomically in D1, before any password check. Missing
      // trusted edge IP deliberately shares a bucket instead of trusting XFF.
      const ipKey = await hash(request.headers.get('CF-Connecting-IP') || 'unknown')
      const limits = await db.batch<{ results: Record<string, unknown>[] }>(['global', `ip:${ipKey}`].map(key => db.prepare(`
        INSERT INTO warehouse_dealer_rate (bucket, attempts, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(bucket) DO UPDATE SET
          attempts = CASE WHEN reset_at <= ? THEN 1 ELSE MIN(attempts + 1, 1001) END,
          reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
        RETURNING attempts, reset_at
      `).bind(key, now + windowSeconds, now, now)))
      if (Number(limits[0]!.results[0]!.attempts) > 1000 || Number(limits[1]!.results[0]!.attempts) > 5)
        return json(429, { message: '尝试次数过多，请稍后重试' }, { 'Retry-After': String(Math.max(1, ...limits.map(result => Number(result.results[0]!.reset_at) - now))) })
      const provided = await passwordBody(request)
      const providedHash = await hash(provided ?? '')
      let difference = 0
      for (let i = 0; i < passwordHash.length; i++) difference |= passwordHash.charCodeAt(i) ^ providedHash.charCodeAt(i)
      if (provided === null || difference !== 0) return json(401, { message: '查询密码不正确' })
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
      await db.batch([
        db.prepare('DELETE FROM warehouse_dealer_sessions WHERE expires_at <= ?').bind(now),
        db.prepare('DELETE FROM warehouse_dealer_rate WHERE reset_at <= ?').bind(now),
        db.prepare('INSERT INTO warehouse_dealer_sessions (token_hash, password_hash, expires_at) VALUES (?, ?, ?)').bind(await hash(token), passwordHash, now + ttl),
      ])
      return json(200, { ok: true }, { 'Set-Cookie': cookie(request, token, ttl) })
    }
    const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)local-dealer=([a-f0-9]{64})(?:;|$)/)?.[1] || ''
    const tokenHash = await hash(token)
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM warehouse_dealer_sessions WHERE token_hash = ?').bind(tokenHash).run()
      return json(200, { ok: true }, { 'Set-Cookie': cookie(request, '', 0) })
    }
    // One transaction snapshots session validity and physical/reserved stock together.
    const snapshot = await db.batch<{ results: Record<string, unknown>[] }>([
      db.prepare('SELECT token_hash FROM warehouse_dealer_sessions WHERE token_hash = ? AND password_hash = ? AND expires_at > ?').bind(tokenHash, passwordHash, now),
      db.prepare('SELECT value FROM warehouse_stock ORDER BY rowid'),
      db.prepare('SELECT value FROM warehouse_orders ORDER BY rowid'),
    ])
    if (!token || !snapshot[0]!.results.length) return json(401, { message: '请输入查询密码' })
    const stocks = snapshot[1]!.results.map(row => JSON.parse(String(row.value)) as Stock)
    const orders = snapshot[2]!.results.map(row => JSON.parse(String(row.value)) as Order)
    const published = availableStock(stocks, orders).filter(stock => stock.visible === true).map(stock => ({
      ...Object.fromEntries(warehouseFields.map(([key]) => [key, stock[key]])),
      id: stock.id, width: stock.width, length: stock.length, rolls: stock.rolls, remnants: stock.remnants,
    }))
    return json(200, { stocks: published })
  }
  catch {
    // Never echo database errors or reservation details into the public endpoint.
    return json(503, { message: '库存查询暂不可用，请稍后重试' })
  }
}
