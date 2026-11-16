import { Hono } from 'hono'
import { isCustomerSnapshot, mergeCustomerSnapshot } from './customer-snapshot'
import type { CustomerRow } from './customer-snapshot'
import { balances, post } from '../src/local-test/inventory'
import type { Movement, Sample } from '../src/local-test/inventory'
import { samplePermissions } from '../src/local-test/permissions'
import { handle } from 'hono/cloudflare-pages'
import type { Context, Next } from 'hono'
import { isPasswordHash, normalizePasswordForStorage, verifyPassword } from '../src/features/auth/password'
import { canAccessCustomer } from '../src/features/crm/customer-access'
import { validateHierarchy } from '../src/features/personnel/hierarchy'
import { canExecuteHandoff, insertHandoffLog, updateHandoffOwner } from './customer-handoff'

interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  BROWSER?: BrowserRenderingBinding
  CUSTOMER_ROW_API?: string
}

interface AdminUserRow {
  id: string
  account: string
  display_name: string
  role: string
  enabled: number
  password: string
  permissions: string
  department_id?: string | null
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
  departmentId?: string
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
    departmentId: row.department_id || '',
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
    password: user.password ? normalizePasswordForStorage(user.password) : '',
    permissions: JSON.stringify(user.permissions || {}),
    departmentId: user.departmentId?.trim() || null,
  }
}

async function syncAdminUsers(db: D1Database, users: unknown, actorId: string) {
  if (!Array.isArray(users))
    return

  const rows = users.map(userPayloadToDbRow).filter(user => user.id && user.account)
  const statements = rows.map(row =>
    db.prepare(`
      INSERT INTO users (id, account, display_name, role, enabled, password, permissions, department_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        account = excluded.account,
        display_name = excluded.display_name,
        role = excluded.role,
        enabled = excluded.enabled,
        password = CASE WHEN excluded.password = '' THEN users.password ELSE excluded.password END,
        permissions = excluded.permissions,
        department_id = users.department_id,
        updated_at = CURRENT_TIMESTAMP
    `).bind(row.id, row.account, row.displayName, row.role, row.enabled, row.password, row.permissions, row.departmentId),
  )

  const ids = rows.map(row => row.id)
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    // Remove sessions before deleting users because sessions has a foreign key
    // to users. Otherwise the app_state write succeeds but user sync rolls back.
    statements.push(db.prepare(`DELETE FROM sessions WHERE user_id != 'owner' AND user_id NOT IN (${placeholders})`).bind(...ids))
    statements.push(db.prepare(`DELETE FROM users WHERE id != 'owner' AND id NOT IN (${placeholders})`).bind(...ids))
  }

  statements.push(db.prepare(`INSERT INTO app_state (key, value, updated_by, updated_at) VALUES ('admin-users', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(users), actorId))
  await db.batch(statements)
}

async function replaceJsonRows(db: D1Database, table: string, rows: any[], mapper: (row: any) => D1PreparedStatement) {
  await db.prepare(`DELETE FROM ${table}`).run()
  if (!rows.length)
    return
  await db.batch(rows.map(mapper))
}

async function syncCustomers(db: D1Database) {
  // Read the saved snapshot inside D1 so large customer attachments are not
  // sent again as bound parameters in a second batch request.
  // Prune first. A large attachment can make the optional search index
  // upsert fail; deletions must still be removed from that legacy table.
  await db.prepare(`
      DELETE FROM crm_customers
      WHERE id NOT IN (
        SELECT json_extract(j.value, '$.id')
        FROM app_state AS a, json_each(a.value) AS j
        WHERE a.key = 'customers'
      )
    `).run()
  await db.prepare(`
      INSERT INTO crm_customers (id, name, owner, stage, assigned_to_user_id, value, updated_at)
      SELECT json_extract(j.value, '$.id'),
        COALESCE(json_extract(j.value, '$.name'), ''),
        COALESCE(json_extract(j.value, '$.owner'), ''),
        COALESCE(json_extract(j.value, '$.stage'), ''),
        COALESCE(json_extract(j.value, '$.assignedToUserId'), ''),
        j.value, CURRENT_TIMESTAMP
      FROM app_state AS a, json_each(a.value) AS j
      WHERE a.key = 'customers'
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner = excluded.owner,
        stage = excluded.stage,
        assigned_to_user_id = excluded.assigned_to_user_id,
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run()
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
  if (key === 'customers') {
    try {
      await syncCustomers(db)
    }
    catch (error) {
      // The saved snapshot remains authoritative even if this index fails.
      console.error('Failed to sync customer index', error)
    }
  }
  else if (key === 'pricing')
    await syncPricing(db, value)
  else if (key === 'system-state')
    await syncSystemState(db, value)
}

function parseStoredJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}

async function readJsonRows(db: D1Database, table: string) {
  const rows = await db.prepare(`SELECT value FROM ${table} ORDER BY rowid ASC`).all<{ value: string }>()
  return (rows.results || [])
    .map(row => parseStoredJson(row.value, null))
    .filter(Boolean)
}

async function readNormalizedState(db: D1Database, key: string, fallback: any) {
  if (key === 'customers') {
    // app_state is the source of truth for customer writes. The legacy table
    // can lag behind if its large batch update fails; use it only for migration.
    return Array.isArray(fallback) ? fallback : readJsonRows(db, 'crm_customers')
  }

  if (key === 'pricing') {
    const products = await readJsonRows(db, 'quote_products')
    const materials = await readJsonRows(db, 'quote_materials')
    if (products.length || materials.length) {
      return {
        ...(fallback && typeof fallback === 'object' ? fallback : {}),
        products,
        materials,
      }
    }
    return fallback
  }

  if (key === 'system-state') {
    const recycleBin = await readJsonRows(db, 'recycle_records')
    const operationLogs = await readJsonRows(db, 'operation_logs')
    if (recycleBin.length || operationLogs.length) {
      return {
        ...(fallback && typeof fallback === 'object' ? fallback : {}),
        recycleBin,
        operationLogs,
      }
    }
    return fallback
  }

  if (key === 'admin-users') {
    const rows = await db
      .prepare('SELECT * FROM users ORDER BY CASE role WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END, updated_at ASC, account ASC')
      .bind('owner', 'manager')
      .all<AdminUserRow>()
    const users = (rows.results || []).map(row => ({
      id: row.id,
      account: row.account,
      displayName: row.display_name,
      role: row.role,
      enabled: Boolean(row.enabled),
      permissions: parseStoredJson(row.permissions || '{}', {}),
      departmentId: row.department_id || '',
    }))
    return users
  }

  return fallback
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
  if (userPermissions(user).warehouseOnly === true && user.role !== 'owner')
    return c.json({ message: '仓库岗位不能访问其他业务模块' }, 403)
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

  if (!user || !password || !user.password || !verifyPassword(password, user.password))
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

app.get('/health', async (c) => {
  const services = {
    d1: { ok: false, message: '' },
    r2: { ok: Boolean(c.env.IMAGES), message: c.env.IMAGES ? 'bound' : 'missing binding' },
    pdf: { ok: Boolean(c.env.BROWSER), message: c.env.BROWSER ? 'bound' : 'missing binding' },
  }

  try {
    await c.env.DB.prepare('SELECT 1').first()
    services.d1 = { ok: true, message: 'connected' }
  }
  catch (error) {
    services.d1 = { ok: false, message: error instanceof Error ? error.message : 'connection failed' }
  }

  return c.json({
    ok: services.d1.ok && services.r2.ok,
    services,
    checkedAt: new Date().toISOString(),
  })
})

app.use('/state/*', requireLogin)
app.use('/customers/*', requireLogin)
app.use('/images', requireLogin)
app.use('/pdf', requireLogin)
app.use('/departments', requireLogin)

app.get('/departments', async (c) => {
  const actor = c.get('user')
  if (actor.role !== 'owner' && actor.role !== 'manager' && !userPermissions(actor).manageUsers)
    return c.json({ message: '无权查看部门管理' }, 403)
  const { results } = await c.env.DB.prepare('SELECT id, name, enabled FROM departments ORDER BY rowid').all<{ id: string, name: string, enabled: number }>()
  return c.json({ departments: results.map(row => ({ ...row, enabled: Boolean(row.enabled) })) })
})

app.post('/departments', async (c) => {
  if (c.get('user').role !== 'owner') return c.json({ message: '仅主账号可维护部门' }, 403)
  const body = await c.req.json<{ id?: string, name?: string, enabled?: boolean }>()
  if ((body.id !== undefined && (typeof body.id !== 'string' || !body.id || body.id.length > 128)) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 40 || (body.enabled !== undefined && typeof body.enabled !== 'boolean'))
    return c.json({ message: '请填写有效的部门名称（最多40字）' }, 400)
  const name = body.name.trim()
  const id = body.id || crypto.randomUUID()
  if (body.id && !await c.env.DB.prepare('SELECT id FROM departments WHERE id = ?').bind(id).first()) return c.json({ message: '部门不存在' }, 404)
  const duplicate = await c.env.DB.prepare('SELECT id FROM departments WHERE name = ? COLLATE NOCASE AND id != ?').bind(name, id).first()
  if (duplicate) return c.json({ message: '部门名称已存在' }, 409)
  try {
    await c.env.DB.prepare(`INSERT INTO departments (id, name, enabled) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`)
      .bind(id, name, body.enabled === false ? 0 : 1).run()
  }
  catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return c.json({ message: '部门名称已存在' }, 409)
    throw error
  }
  return c.json({ ok: true, id })
})

function customerReadScope(user: AdminUserRow) {
  return user.role === 'owner' || (user.role === 'manager' && userPermissions(user).viewAllCustomers === true)
    ? 'all' as const
    : 'own' as const
}

function canAssignUnclaimed(user: AdminUserRow) {
  return user.role === 'owner' || (user.role !== 'viewer' && userPermissions(user)?.assignUnclaimedCustomers === true)
}

app.get('/customers/handoff-targets', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)
  const actor = c.get('user')
  if (!canExecuteHandoff(actor.role, userPermissions(actor)))
    return c.json({ message: '没有执行客资交接的权限' }, 403)
  const targets = await c.env.DB.prepare("SELECT id, display_name FROM users WHERE enabled = 1 AND role IN ('quoter', 'manager') ORDER BY display_name").all()
  c.header('Cache-Control', 'no-store')
  return c.json(targets.results)
})

app.get('/customers/unclaimed', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)
  if (!canAssignUnclaimed(c.get('user')))
    return c.json({ message: '没有待分配客资权限' }, 403)
  const db = c.env.DB
  const { results } = await db.prepare(`SELECT value, row_revision FROM crm_customers
    WHERE COALESCE(assigned_to_user_id, '') = '' ORDER BY updated_at DESC, id LIMIT 200`).all<{ value: string, row_revision: string }>()
  const targets = await db.prepare("SELECT id, display_name FROM users WHERE enabled = 1 AND role IN ('quoter', 'manager') ORDER BY display_name").all()
  c.header('Cache-Control', 'no-store')
  return c.json({ customers: results.map(row => ({ value: JSON.parse(row.value), revision: row.row_revision })), targets: targets.results })
})

app.post('/customers/unclaimed/assign', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)
  const actor = c.get('user')
  if (!canAssignUnclaimed(actor))
    return c.json({ message: '没有待分配客资权限' }, 403)
  const body = await c.req.json().catch(() => null)
  if (typeof body?.toUserId !== 'string' || !Array.isArray(body.customers) || !body.customers.length || body.customers.length > 50
    || body.customers.some((item: unknown) => !item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id
      || !('revision' in item) || typeof item.revision !== 'string')
    || new Set(body.customers.map((item: { id: string }) => item.id)).size !== body.customers.length)
    return c.json({ message: '请选择接手人及 1 至 50 条不同客资' }, 400)

  const db = c.env.DB
  const target = await db.prepare("SELECT id, display_name FROM users WHERE id = ? AND enabled = 1 AND role IN ('quoter', 'manager')")
    .bind(body.toUserId).first<{ id: string, display_name: string }>()
  if (!target)
    return c.json({ message: '请选择启用的销售账号' }, 400)

  const statements = (body.customers as { id: string, revision: string }[]).flatMap((item) => {
    const revision = crypto.randomUUID()
    return [
      db.prepare(`UPDATE crm_customers SET assigned_to_user_id = ?, owner = ?, row_revision = ?, updated_at = CURRENT_TIMESTAMP,
        value = json_set(value, '$.assignedToUserId', ?, '$.owner', ?, '$.updatedAt', ?)
        WHERE id = ? AND row_revision = ? AND COALESCE(assigned_to_user_id, '') = ''
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND enabled = 1 AND role IN ('quoter', 'manager'))`)
        .bind(target.id, target.display_name, revision, target.id, target.display_name, new Date().toISOString(),
          item.id, item.revision, target.id),
      db.prepare(`INSERT INTO crm_customer_assignments (id, customer_id, actor_user_id, to_user_id)
        SELECT ?, id, ?, ? FROM crm_customers WHERE id = ? AND row_revision = ?`)
        .bind(revision, actor.id, target.id, item.id, revision),
    ]
  })
  const results = await db.batch<{ meta: { changes: number } }>(statements)
  const items = (body.customers as { id: string }[]).map(({ id }, index) => ({ id, assigned: Boolean(results[index * 2]?.meta.changes) }))
  return c.json({ items })
})

app.get('/customers', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)
  const user = c.get('user')
  const all = customerReadScope(user) === 'all'
  const query = c.env.DB.prepare(all
    ? 'SELECT value, row_revision FROM crm_customers ORDER BY updated_at DESC, id'
    : 'SELECT value, row_revision FROM crm_customers WHERE assigned_to_user_id = ? ORDER BY updated_at DESC, id')
  const { results } = await (all ? query : query.bind(user.id)).all<{ value: string, row_revision: string }>()
  c.header('Cache-Control', 'no-store')
  return c.json({ customers: results.map(row => ({ value: JSON.parse(row.value), revision: row.row_revision })) })
})

app.on(['GET', 'PATCH'], '/customers/:id', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)

  c.header('Cache-Control', 'no-store')
  const db = c.env.DB
  const id = c.req.param('id')
  const user = c.get('user')
  const row = await db.prepare('SELECT assigned_to_user_id, value, row_revision FROM crm_customers WHERE id = ?')
    .bind(id).first<{ assigned_to_user_id: string, value: string, row_revision: string }>()
  const editing = c.req.method === 'PATCH'
  if (!row || !canAccessCustomer({
    id: user.id,
    scope: editing ? (user.role === 'owner' ? 'all' : 'own') : customerReadScope(user),
    actions: user.role === 'viewer' ? ['read'] : ['read', 'edit'],
  }, editing ? 'edit' : 'read', row.assigned_to_user_id))
    return c.json({ message: '客资不存在或无权访问' }, 404)

  const customer = JSON.parse(row.value)
  if (!editing)
    return c.json({ value: customer, revision: row.row_revision })

  const body = await c.req.json().catch(() => null)
  const editable = ['name', 'contact', 'phone', 'wechat', 'remark'] as const
  const fields = body?.fields
  if (typeof body?.revision !== 'string' || !fields || typeof fields !== 'object' || Array.isArray(fields)
    || !Object.keys(fields).length || Object.keys(fields).some(key => !editable.some(field => field === key))
    || Object.values(fields).some(value => typeof value !== 'string' || value.length > 4000))
    return c.json({ message: '修改字段或版本无效' }, 400)

  if (body.revision !== row.row_revision)
    return c.json({ message: '该客资已更新，请重新加载' }, 409)

  const revision = crypto.randomUUID()
  const value = { ...customer, ...fields, updatedAt: new Date().toISOString() }
  const result = await db.prepare(`
    UPDATE crm_customers SET name = ?, value = ?, row_revision = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND row_revision = ? AND assigned_to_user_id = ?
  `).bind(value.name, JSON.stringify(value), revision, id, row.row_revision, row.assigned_to_user_id).run()
  if (!result.meta.changes)
    return c.json({ message: '该客资已更新，请重新加载' }, 409)
  return c.json({ value, revision })
})

app.post('/customers/:id/handoff', async (c) => {
  if (c.env.CUSTOMER_ROW_API !== 'enabled')
    return c.json({ message: '单条客资接口尚未启用' }, 404)
  const actor = c.get('user')
  if (!canExecuteHandoff(actor.role, userPermissions(actor)))
    return c.json({ message: '没有执行客资交接的权限' }, 403)

  const body = await c.req.json().catch(() => null)
  const fields = ['toUserId', 'reason', 'progress', 'nextAction', 'dueAt'] as const
  if (typeof body?.revision !== 'string' || fields.some(key =>
    typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 2000))
    return c.json({ message: '请完整填写接手人、交接信息和截止时间' }, 400)
  const dueAt = body.dueAt.trim()
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueAt)
    || !Number.isFinite(Date.parse(dueAt + ':00+08:00')))
    return c.json({ message: '截止时间格式无效' }, 400)

  const db = c.env.DB
  const id = c.req.param('id')
  const row = await db.prepare('SELECT assigned_to_user_id, value, row_revision FROM crm_customers WHERE id = ?')
    .bind(id).first<{ assigned_to_user_id: string, value: string, row_revision: string }>()
  if (!row)
    return c.json({ message: '客资不存在' }, 404)
  if (row.row_revision !== body.revision)
    return c.json({ message: '客资已更新，请重新加载' }, 409)
  const target = await db.prepare("SELECT id, display_name FROM users WHERE id = ? AND enabled = 1 AND role IN ('quoter', 'manager')")
    .bind(body.toUserId).first<{ id: string, display_name: string }>()
  if (!target || !row.assigned_to_user_id || target.id === row.assigned_to_user_id)
    return c.json({ message: '请选择不同的启用销售；未分配客资不走交接' }, 400)

  const revision = crypto.randomUUID()
  const customer = JSON.parse(row.value)
  const [reminderDate, reminderTime] = dueAt.split('T')
  const value = {
    ...customer,
    owner: target.display_name,
    assignedToUserId: target.id,
    updatedAt: new Date().toISOString(),
    followUps: [{
      id: revision, date: new Date().toISOString().slice(0, 10),
      content: body.progress.trim(), nextAction: body.nextAction.trim(),
      reminderDate, reminderTime, reminderDone: false,
    }, ...(Array.isArray(customer.followUps) ? customer.followUps : [])],
  }
  const [updated] = await db.batch<{ meta: { changes: number } }>([
    db.prepare(updateHandoffOwner).bind(target.display_name, target.id, JSON.stringify(value), revision, id,
      row.row_revision, row.assigned_to_user_id, target.id),
    db.prepare(insertHandoffLog).bind(revision, row.assigned_to_user_id, actor.id, body.reason.trim(),
      body.progress.trim(), body.nextAction.trim(), dueAt, id, revision),
  ])
  if (!updated?.meta.changes)
    return c.json({ message: '客资或接手账号已变化，请重新加载' }, 409)
  c.header('Cache-Control', 'no-store')
  return c.json({ value, revision })
})

function legacyCustomerAccess(user: AdminUserRow) {
  const permissions = userPermissions(user)
  const all = user.role === 'owner' || permissions.viewAllCustomers === true
  return {
    read: (row: CustomerRow) => all || (row.assignedToUserId ? row.assignedToUserId === user.id
      : Boolean(row.owner?.trim() && [user.id, user.account, user.display_name].includes(row.owner.trim()))),
    assign: user.role === 'owner' || (all && permissions.transferCustomers === true),
    remove: user.role === 'owner' || permissions.deleteCustomers === true,
    self: user.id,
  }
}

app.use('/sample-ledger', requireLogin)
app.on(['GET', 'POST'], '/sample-ledger', async (c) => {
  const actor = c.get('user')
  const access = samplePermissions({ enabled: true, role: actor.role, permissions: userPermissions(actor) })
  if (!access.issue && !access.maintain) return c.json({ message: '无样品权限' }, 403)
  const db = c.env.DB
  const stored = await db.prepare('SELECT value, revision FROM crm_sample_ledger WHERE singleton = 1')
    .first<{ value: string, revision: number }>()
  if (!stored) return c.json({ message: '共享样品账本尚未初始化' }, 503)
  const data = JSON.parse(stored.value) as { samples: Sample[], entries: Movement[] }
  const customers = await db.prepare("SELECT value FROM app_state WHERE key = 'customers'").first<{ value: string }>()
  const customerRows = await readNormalizedState(db, 'customers', customers ? parseStoredJson(customers.value, null) : null)
  if (!isCustomerSnapshot(customerRows)) return c.json({ message: '客户快照格式无效' }, 409)
  const allowedCustomers = new Set(customerRows.filter(legacyCustomerAccess(actor).read).map(row => row.id))
  const visibleEntry = (entry: Movement) => actor.role === 'owner' || (entry.customerId
    ? allowedCustomers.has(entry.customerId) : entry.openedById === actor.id || (access.maintain && ['receipt', 'reverse', 'adjustDown'].includes(entry.kind)))
  c.header('Cache-Control', 'no-store')
  if (c.req.method === 'GET') return c.json({
    revision: stored.revision,
    samples: data.samples.map(sample => ({ ...sample, ...balances(data.entries, sample.id) })),
    entries: data.entries.filter(visibleEntry),
  })
  const body = await c.req.json().catch(() => null)
  if (body?.revision !== stored.revision) return c.json({ message: '库存已更新，请刷新后重试' }, 409)
  const sample = body.sample
  const entry = body.entry
  if (!sample && !entry) return c.json({ message: '请提供样品或库存单据' }, 400)
  if (sample) {
    if (!access.maintain) return c.json({ message: '无库存维护权限' }, 403)
    const fields = ['id', 'product', 'spec', 'location', 'category', 'height', 'needleCount', 'needleRow', 'backing', 'density', 'poundWeight'] as const
    if (fields.some(key => sample[key] !== undefined && (typeof sample[key] !== 'string' || sample[key].length > 240))
      || ['id', 'product', 'spec', 'location'].some(key => !sample[key]?.trim())
      || data.samples.some(row => row.id === sample.id || (row.product === sample.product.trim() && row.spec === sample.spec.trim() && row.location === sample.location.trim())))
      return c.json({ message: '样品资料无效或重复' }, 400)
    data.samples.push({ ...Object.fromEntries(fields.map(key => [key, sample[key]?.trim()])), minimum: 5 } as Sample)
  }
  if (entry) {
    const issue = ['issue', 'cancel', 'dispatch'].includes(entry.kind)
    if (!(issue ? access.issue : access.maintain)) return c.json({ message: '无该单据操作权限' }, 403)
    if (![ 'issue', 'cancel', 'dispatch', 'receipt', 'return', 'reverse', 'adjustDown' ].includes(entry.kind)
      || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 120 || typeof entry.reason !== 'string'
      || typeof entry.customer !== 'string' || entry.customer.length > 240 || entry.reason.length > 2000
      || (entry.customerId !== undefined && typeof entry.customerId !== 'string')
      || (entry.original !== undefined && typeof entry.original !== 'string')
      || !Array.isArray(entry.lines) || entry.lines.length > 200
      || (entry.tracking !== undefined && typeof entry.tracking !== 'string'))
      return c.json({ message: '单据格式无效' }, 400)
    const original = data.entries.find(row => row.id === entry.original)
    if (original && !visibleEntry(original)) return c.json({ message: '无权操作原单' }, 403)
    if (entry.customerId && !allowedCustomers.has(entry.customerId)) return c.json({ message: '无权关联该客户' }, 403)
    const lines = entry.lines.map((line: { sampleId?: string, quantity?: number } | null) => ({
      sample: data.samples.find(row => row.id === line?.sampleId), quantity: line?.quantity,
    }))
    if (lines.some((line: { sample?: Sample }) => !line.sample)) return c.json({ message: '样品不存在' }, 400)
    const linked = ['return', 'reverse', 'cancel', 'dispatch'].includes(entry.kind)
    try {
      data.entries = post(data.entries, {
        id: entry.id, kind: entry.kind, reason: entry.reason, customer: linked ? original?.customer ?? '' : entry.customer,
        customerId: linked ? original?.customerId : entry.customerId, original: linked ? entry.original : undefined,
        tracking: entry.tracking, requiresDispatch: entry.kind === 'issue', time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        openedBy: actor.display_name, openedById: actor.id, lines,
      })
    }
    catch (error) { return c.json({ message: error instanceof Error ? error.message : '无法记账' }, 409) }
  }
  const updated = await db.prepare('UPDATE crm_sample_ledger SET value = ?, revision = revision + 1 WHERE singleton = 1 AND revision = ?')
    .bind(JSON.stringify(data), stored.revision).run()
  return updated.meta.changes ? c.json({ revision: stored.revision + 1 }) : c.json({ message: '库存已更新，请刷新后重试' }, 409)
})

app.get('/state/:key', async (c) => {
  const key = c.req.param('key')
  if (!['customers', 'admin-users', 'pricing', 'system-state'].includes(key))
    return c.json({ message: '未知数据类型' }, 404)
  if (key === 'customers' && c.env.CUSTOMER_ROW_API === 'enabled')
    return c.json({ message: '请使用新版客资接口' }, 410)
  const row = await c.env.DB.prepare('SELECT value, revision FROM app_state WHERE key = ?').bind(key).first<{ value: string, revision: string }>()
  const fallback = row ? parseStoredJson(row.value, null) : null
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (key === 'admin-users') return c.json({ value: await readNormalizedState(c.env.DB, key, null) })
  if (key === 'system-state' && c.get('user').role !== 'owner' && userPermissions(c.get('user')).restoreRecords !== true)
    return c.json({ message: '当前账号无权查看回收站和操作日志' }, 403)
  if (key === 'customers') {
    const value = await readNormalizedState(c.env.DB, key, fallback)
    if (!isCustomerSnapshot(value)) return c.json({ message: '客户快照格式无效' }, 500)
    return c.json({ value: value.filter(legacyCustomerAccess(c.get('user')).read), revision: row?.revision ?? null })
  }
  try {
    const value = await readNormalizedState(c.env.DB, key, fallback)
    return c.json({ value, revision: key === 'customers' ? row?.revision ?? null : undefined })
  }
  catch {
    return c.json({ value: fallback, revision: key === 'customers' ? row?.revision ?? null : undefined })
  }
})

app.put('/state/:key', async (c) => {
  const key = c.req.param('key')
  if (!['customers', 'admin-users', 'pricing', 'system-state'].includes(key))
    return c.json({ message: '未知数据类型' }, 404)
  if (key === 'customers' && c.env.CUSTOMER_ROW_API === 'enabled')
    return c.json({ message: '旧版整表写入已停用' }, 410)
  const user = c.get('user')
  const body = await c.req.json<{ value: unknown, revision?: string | null }>()
  if (key === 'customers' && !isCustomerSnapshot(body.value))
    return c.json({ message: '客户数据格式不正确' }, 400)
  const canWrite
    = key === 'admin-users'
      ? user.role === 'owner'
      : key === 'pricing'
        ? (hasPermission(user, 'manageProducts') || hasPermission(user, 'manageMaterials') || hasPermission(user, 'importExcel'))
        : key === 'system-state'
          ? user.role === 'owner' || userPermissions(user).restoreRecords === true
          : true

  if (!canWrite)
    return c.json({ message: '当前账号没有权限修改此数据' }, 403)

  if (key === 'admin-users' && !Array.isArray(body.value)) return c.json({ message: '人员数据格式不正确' }, 400)

  if (key === 'admin-users' && Array.isArray(body.value)) {
    const hierarchyError = validateHierarchy(body.value)
    if (hierarchyError) return c.json({ message: hierarchyError }, 400)
    const { results: departments } = await c.env.DB.prepare('SELECT id, enabled FROM departments').all<{ id: string, enabled: number }>()
    const { results: existing } = await c.env.DB.prepare('SELECT id, department_id FROM users').all<{ id: string, department_id: string | null }>()
    for (const person of body.value as AdminUserPayload[]) {
      if (person.departmentId === undefined) continue
      if (typeof person.departmentId !== 'string') return c.json({ message: '人员部门格式不正确' }, 400)
      const departmentId = person.departmentId.trim()
      const department = departments.find(item => item.id === departmentId)
      const prior = existing.find(item => item.id === person.id)
      if (departmentId && (!department || (!department.enabled && prior?.department_id !== departmentId)))
        return c.json({ message: '不能分配到不存在或已停用的部门' }, 400)
      if (prior && (prior.department_id || '') !== departmentId)
        return c.json({ message: '部门调动请使用人员交接流程，先确认客户如何处理' }, 409)
    }
  }

  let revision: string | undefined
  if (key === 'customers') {
    if (user.role === 'viewer') return c.json({ message: '当前账号不能修改客户' }, 403)
    if (!Object.prototype.hasOwnProperty.call(body, 'revision'))
      return c.json({ message: '客户页面版本已过期，请刷新后重试' }, 409)
    if (body.revision !== null && (typeof body.revision !== 'string' || !body.revision))
      return c.json({ message: '客户数据版本无效，请刷新后重试' }, 409)
    const stored = await c.env.DB.prepare("SELECT value, revision FROM app_state WHERE key = 'customers'").first<{ value: string, revision: string }>()
    if ((stored?.revision ?? null) !== body.revision)
      return c.json({ message: '云端客户数据已被其他页面修改，请刷新后重试' }, 409)
    const current = await readNormalizedState(c.env.DB, key, stored ? parseStoredJson(stored.value, null) : null)
    if (!isCustomerSnapshot(current) || !isCustomerSnapshot(body.value))
      return c.json({ message: '客户快照格式无效' }, 409)
    const merged = mergeCustomerSnapshot(current, body.value, legacyCustomerAccess(user))
    if (!merged) return c.json({ message: '不能修改其他负责人的客户、转移归属或删除无权限的客户' }, 403)
    body.value = merged
    revision = crypto.randomUUID()
    const statement = body.revision === null
      ? c.env.DB.prepare('INSERT INTO app_state (key, value, updated_by, revision, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING')
        .bind(key, JSON.stringify(body.value), user.id, revision)
      : c.env.DB.prepare('UPDATE app_state SET value = ?, updated_by = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND revision = ?')
        .bind(JSON.stringify(body.value), user.id, revision, key, body.revision)
    const result = await statement.run()
    if (!result.meta.changes)
      return c.json({ message: '云端客户数据已被其他页面修改，请刷新后重试' }, 409)
  }
  else if (key !== 'admin-users') {
    await c.env.DB
      .prepare('INSERT INTO app_state (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP')
      .bind(key, JSON.stringify(body.value ?? null), user.id)
      .run()
  }

  if (key === 'admin-users') {
    try { await syncAdminUsers(c.env.DB, body.value, user.id) }
    catch (error) {
      if (String(error).includes('DEPARTMENT_INACTIVE')) return c.json({ message: '部门已停用，请刷新部门列表后重新选择', }, 409)
      if (String(error).includes('OFFBOARDED_USER')) return c.json({ message: '离职账号必须保留历史，不能重新启用或删除' }, 409)
      throw error
    }
  }
  await syncNormalizedState(c.env.DB, key, body.value)

  return c.json({ ok: true, revision })
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
