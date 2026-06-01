import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { Context, Next } from 'hono'

interface Env {
  DB: D1Database
  IMAGES: R2Bucket
}

interface AdminUserRow {
  id: string
  account: string
  display_name: string
  role: string
  enabled: number
  password: string
  permissions: string
}

interface SessionRow {
  token: string
  user_id: string
}

interface AdminUserPayload {
  id?: string
  account?: string
  displayName?: string
  role?: string
  enabled?: boolean
  password?: string
  permissions?: unknown
}

interface AppBindings {
  Bindings: Env
  Variables: { user: AdminUserRow }
}

const app = new Hono<AppBindings>().basePath('/api')

function jsonUser(row: AdminUserRow) {
  return {
    id: row.id,
    account: row.account,
    displayName: row.display_name,
    role: row.role,
    enabled: Boolean(row.enabled),
    permissions: JSON.parse(row.permissions || '{}'),
  }
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

function userPayloadToDbRow(user: AdminUserPayload) {
  const account = String(user.account || '').trim()
  return {
    id: String(user.id || account || crypto.randomUUID()).trim(),
    account,
    displayName: String(user.displayName || account || '新账号').trim(),
    role: String(user.role || 'quoter').trim(),
    enabled: user.enabled === false ? 0 : 1,
    password: String(user.password || '123456'),
    permissions: JSON.stringify(user.permissions || {}),
  }
}

async function syncAdminUsers(db: D1Database, users: unknown) {
  if (!Array.isArray(users))
    return

  const rows = users.map(userPayloadToDbRow).filter(user => user.id && user.account)
  const statements = rows.map(row =>
    db.prepare(`
      INSERT INTO users (id, account, display_name, role, enabled, password, permissions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        account = excluded.account,
        display_name = excluded.display_name,
        role = excluded.role,
        enabled = excluded.enabled,
        password = excluded.password,
        permissions = excluded.permissions,
        updated_at = CURRENT_TIMESTAMP
    `).bind(row.id, row.account, row.displayName, row.role, row.enabled, row.password, row.permissions),
  )

  const ids = rows.map(row => row.id)
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    statements.push(db.prepare(`DELETE FROM users WHERE id != 'owner' AND id NOT IN (${placeholders})`).bind(...ids))
  }

  if (statements.length)
    await db.batch(statements)
}

async function requireLogin(c: Context<AppBindings>, next: Next) {
  const authorization = c.req.header('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  const session = await c.env.DB
    .prepare('SELECT token, user_id FROM sessions WHERE token = ? AND expires_at > ?')
    .bind(token, new Date().toISOString())
    .first<SessionRow>()

  if (!session)
    return c.json({ message: '未登录或登录已过期' }, 401)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND enabled = 1').bind(session.user_id).first<AdminUserRow>()
  if (!user)
    return c.json({ message: '账号不可用' }, 401)

  c.set('user', user)
  await next()
}

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ account?: string, password?: string }>()
  const account = String(body.account || '').trim().toLowerCase()
  const password = String(body.password || '')
  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE lower(account) = ? AND password = ? AND enabled = 1')
    .bind(account, password)
    .first<AdminUserRow>()

  if (!user)
    return c.json({ message: '账号或密码不正确' }, 401)

  const token = randomToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run()

  return c.json({ token, user: jsonUser(user) })
})

app.use('/state/*', requireLogin)
app.use('/images', requireLogin)

app.get('/state/:key', async (c) => {
  const key = c.req.param('key')
  const row = await c.env.DB.prepare('SELECT value FROM app_state WHERE key = ?').bind(key).first<{ value: string }>()
  if (!row)
    return c.json({ value: null })
  return c.json({ value: JSON.parse(row.value) })
})

app.put('/state/:key', async (c) => {
  const key = c.req.param('key')
  const user = c.get('user')
  const body = await c.req.json<{ value: unknown }>()
  await c.env.DB
    .prepare('INSERT INTO app_state (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP')
    .bind(key, JSON.stringify(body.value ?? null), user.id)
    .run()

  if (key === 'admin-users')
    await syncAdminUsers(c.env.DB, body.value)

  return c.json({ ok: true })
})

app.post('/images', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File))
    return c.json({ message: '请选择图片' }, 400)

  const safeName = file.name.replace(/[^\w.-]+/g, '-').slice(-80)
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })
  return c.json({ key, url: `/api/images/${key}` })
})

app.get('/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '')
  const object = await c.env.IMAGES.get(key)
  if (!object)
    return c.notFound()
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('cache-control', 'public, max-age=31536000')
  return new Response(object.body, { headers })
})

const apiHandler = handle(app)

export const onRequest = (context: any) => {
  const url = new URL(context.request.url)
  if (!url.pathname.startsWith('/api/'))
    return context.next()
  return apiHandler(context)
}
