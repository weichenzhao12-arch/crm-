import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { Context, Next } from 'hono'
import { isPasswordHash, normalizePasswordForStorage, verifyPassword } from '../src/features/auth/password'

interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  BROWSER?: BrowserRenderingBinding
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

function userPermissions(row: AdminUserRow) {
  try {
    return JSON.parse(row.permissions || '{}') as Record<string, boolean>
  }
  catch {
    return {}
  }
}

function hasPermission(row: AdminUserRow, permission: string) {
  if (row.role === 'owner' || row.role === 'manager')
    return true
  return Boolean(userPermissions(row)[permission])
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
    password: normalizePasswordForStorage(user.password),
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

async function replaceJsonRows(db: D1Database, table: string, rows: any[], mapper: (row: any) => D1PreparedStatement) {
  await db.prepare(`DELETE FROM ${table}`).run()
  if (!rows.length)
    return
  await db.batch(rows.map(mapper))
}

async function syncCustomers(db: D1Database, customers: unknown) {
  if (!Array.isArray(customers))
    return
  await replaceJsonRows(db, 'crm_customers', customers, customer =>
    db.prepare(`
      INSERT INTO crm_customers (id, name, owner, stage, assigned_to_user_id, value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      String(customer.id || crypto.randomUUID()),
      String(customer.name || ''),
      String(customer.owner || ''),
      String(customer.stage || ''),
      String(customer.assignedToUserId || ''),
      JSON.stringify(customer),
    ),
  )
}

async function syncPricing(db: D1Database, pricing: any) {
  if (!pricing || typeof pricing !== 'object')
    return

  const products = Array.isArray(pricing.products) ? pricing.products : []
  const materials = Array.isArray(pricing.materials) ? pricing.materials : []

  await replaceJsonRows(db, 'quote_products', products, product =>
    db.prepare(`
      INSERT INTO quote_products (id, item_no, category, model, value, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      String(product.id || crypto.randomUUID()),
      String(product.itemNo || ''),
      String(product.category || ''),
      String(product.model || ''),
      JSON.stringify(product),
    ),
  )

  await replaceJsonRows(db, 'quote_materials', materials, material =>
    db.prepare(`
      INSERT INTO quote_materials (id, name, category, spec, value, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      String(material.id || crypto.randomUUID()),
      String(material.name || ''),
      String(material.category || ''),
      String(material.spec || ''),
      JSON.stringify(material),
    ),
  )
}

async function syncSystemState(db: D1Database, state: any) {
  if (!state || typeof state !== 'object')
    return

  const recycleBin = Array.isArray(state.recycleBin) ? state.recycleBin : []
  const operationLogs = Array.isArray(state.operationLogs) ? state.operationLogs : []

  await replaceJsonRows(db, 'recycle_records', recycleBin, record =>
    db.prepare(`
      INSERT INTO recycle_records (id, type, name, deleted_by, deleted_at, value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      String(record.id || crypto.randomUUID()),
      String(record.type || ''),
      String(record.name || ''),
      String(record.deletedBy || ''),
      String(record.deletedAt || ''),
      JSON.stringify(record),
    ),
  )

  await replaceJsonRows(db, 'operation_logs', operationLogs, log =>
    db.prepare(`
      INSERT INTO operation_logs (id, action, type, name, actor, created_at, detail, value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(log.id || crypto.randomUUID()),
      String(log.action || ''),
      String(log.type || ''),
      String(log.name || ''),
      String(log.actor || ''),
      String(log.createdAt || ''),
      String(log.detail || ''),
      JSON.stringify(log),
    ),
  )
}

async function syncNormalizedState(db: D1Database, key: string, value: unknown) {
  if (key === 'customers')
    await syncCustomers(db, value)
  else if (key === 'pricing')
    await syncPricing(db, value)
  else if (key === 'system-state')
    await syncSystemState(db, value)
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
    .prepare('SELECT * FROM users WHERE lower(account) = ? AND enabled = 1')
    .bind(account)
    .first<AdminUserRow>()

  if (!user || !verifyPassword(password, user.password))
    return c.json({ message: '账号或密码不正确' }, 401)

  if (!isPasswordHash(user.password)) {
    await c.env.DB
      .prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(normalizePasswordForStorage(password), user.id)
      .run()
  }

  const token = randomToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run()

  return c.json({ token, user: jsonUser(user) })
})

app.use('/state/*', requireLogin)
app.use('/images', requireLogin)
app.use('/pdf', requireLogin)

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
  const canWrite
    = key === 'admin-users'
      ? hasPermission(user, 'manageUsers')
      : key === 'pricing'
        ? (hasPermission(user, 'manageProducts') || hasPermission(user, 'manageMaterials') || hasPermission(user, 'importExcel'))
        : key === 'system-state'
          ? hasPermission(user, 'restoreRecords')
          : true

  if (!canWrite)
    return c.json({ message: '当前账号没有权限修改此数据' }, 403)

  await c.env.DB
    .prepare('INSERT INTO app_state (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP')
    .bind(key, JSON.stringify(body.value ?? null), user.id)
    .run()

  if (key === 'admin-users')
    await syncAdminUsers(c.env.DB, body.value)
  await syncNormalizedState(c.env.DB, key, body.value)

  return c.json({ ok: true })
})

app.post('/pdf', async (c) => {
  if (!c.env.BROWSER)
    return c.json({ message: 'PDF服务未启用' }, 503)

  const body = await c.req.json<{ html?: string, fileName?: string }>()
  const html = String(body.html || '')
  const fileName = String(body.fileName || 'quote.pdf').replace(/[^\w\u4E00-\u9FA5.-]+/g, '-')
  if (!html.trim())
    return c.json({ message: '缺少报价单内容' }, 400)

  const rendered = await c.env.BROWSER.quickAction('pdf', {
    html,
    pdfOptions: {
      format: 'a4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    },
  })

  if (rendered instanceof Response) {
    const response = new Response(rendered.body, rendered)
    response.headers.set('content-type', 'application/pdf')
    response.headers.set('content-disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    return response
  }

  return new Response(rendered as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  })
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
