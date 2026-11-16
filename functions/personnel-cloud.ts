import { canExecuteHandoff } from './customer-handoff'
import { WarehouseError } from '../src/features/warehouse/model'
import type { Order } from '../src/features/warehouse/model'

type Person = { id: string, account: string, display_name: string, enabled: number, role: string, permissions: string, department_id: string | null }
type Customer = { id: string, assigned_to_user_id: string | null, row_revision: string, value: string }
const peopleSQL = 'SELECT id, account, display_name, enabled, role, permissions, department_id FROM users ORDER BY id'
const customersSQL = 'SELECT id, assigned_to_user_id, row_revision, value FROM crm_customers ORDER BY id'
const departmentsSQL = 'SELECT id, name FROM departments WHERE enabled = 1 ORDER BY rowid'
const reply = (status: number, value: unknown) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
const encoder = new TextEncoder()
function boundedJSON(value: unknown) {
  const text = JSON.stringify(value)
  // Leave headroom under D1's 2 MB string/row limit for JSON escaping and metadata.
  if (encoder.encode(text).byteLength > 1800000) throw new WarehouseError('交接快照过大，请缩小数据范围后重试', 413)
  return text
}
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Standalone bearer-session authentication; GET/POST match local-personnel. Requires migration 0014. */
export async function handlePersonnelRequest(request: Request, db: D1Database): Promise<Response> {
  try {
    const url = new URL(request.url)
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) throw new WarehouseError('不允许跨站请求', 403)
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
    const key = request.headers.get('idempotency-key') || ''
    let body: any
    if (request.method === 'POST') {
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > 1048576) { await reader.cancel(); throw new WarehouseError('交接数据过大', 413) }
          chunks.push(part.value)
        }
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new WarehouseError('交接数据格式错误') }
    }
    // All reads share a D1 batch snapshot; the first write validates it atomically.
    const reads = await db.batch<{ results: Record<string, unknown>[], meta?: { changes: number } }>([
      db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ? AND u.enabled = 1').bind(token, new Date().toISOString()),
      db.prepare(peopleSQL), db.prepare(customersSQL), db.prepare('SELECT value FROM warehouse_orders ORDER BY id'),
      db.prepare("SELECT value, revision FROM app_state WHERE key = 'customers'"), db.prepare(departmentsSQL),
      db.prepare('SELECT revision, (SELECT ok FROM transaction_guard WHERE id = 1) AS guard_ok FROM warehouse_revision WHERE id = 1'),
      db.prepare('SELECT * FROM personnel_departures ORDER BY user_id'),
      db.prepare('SELECT actor_id, request_hash, result FROM personnel_handoff_batches WHERE request_key = ?').bind(key),
    ])
    const actor = reads[0]!.results[0] as unknown as Person | undefined
    if (!actor) throw new WarehouseError('未登录或登录已过期', 401)
    const permissions = JSON.parse(actor.permissions)
    if ((permissions.warehouseOnly && actor.role !== 'owner') || !canExecuteHandoff(actor.role, permissions)) throw new WarehouseError('没有人员交接权限', 403)
    if (!['GET', 'POST'].includes(request.method)) throw new WarehouseError('操作不存在', 404)
    const mode = request.method === 'GET' ? url.searchParams.get('mode') : body?.mode
    if (mode !== 'handoff' && actor.role !== 'owner') throw new WarehouseError('调部门和离职处理仅限主账号', 403)
    if (request.method === 'POST' && (!body || !['department', 'leave', 'handoff'].includes(mode) || typeof body.sourceId !== 'string' || typeof body.sourceRevision !== 'string' || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000 || !Array.isArray(body.assignments) || body.assignments.length > 5000)) throw new WarehouseError('请完整填写人员、交接原因和分配信息')
    if (request.method === 'POST' && !/^[\w-]{8,128}$/.test(key)) throw new WarehouseError('缺少提交编号')
    const signature = request.method === 'POST' ? await hash(body) : ''
    const prior = reads[8]!.results.find(row => row.actor_id === actor.id)
    if (request.method === 'POST' && prior) {
      if (prior.request_hash !== signature) throw new WarehouseError('该交接已提交且内容不同，请先核对记录', 409)
      return reply(200, JSON.parse(String(prior.result)))
    }
    if (request.method === 'POST') {
      if (reads[6]!.results[0]?.guard_ok !== 1 || reads[6]!.results[0]?.revision === undefined) throw new WarehouseError('数据库尚未完成迁移', 503)
      // Reject oversized full snapshots before parsing or preparing any writes.
      for (const read of reads.slice(1, 8)) boundedJSON(read.results)
    }
    const people = reads[1]!.results as unknown as Person[]
    const rows = reads[2]!.results as unknown as Customer[]
    const orders = reads[3]!.results.map(row => JSON.parse(String(row.value)) as Order)
    const savedRaw = reads[4]!.results[0]
    const parsed = savedRaw ? JSON.parse(String(savedRaw.value)) : null
    const saved: any[] | null = Array.isArray(parsed) ? parsed : null
    const valueFor = (row: Customer) => {
      const value = saved?.find(item => item.id === row.id)
      return value && value.assignedToUserId === row.assigned_to_user_id ? value : JSON.parse(row.value)
    }
    const source = people.find(person => person.id === (request.method === 'GET' ? url.searchParams.get('sourceId') : body.sourceId))
    if (!source) throw new WarehouseError('人员不存在')
    if (mode !== 'handoff' && source.role === 'owner') throw new WarehouseError('主账号不进行部门调动或离职处理')
    const customers = await Promise.all(rows.filter(row => row.assigned_to_user_id === source.id).map(async row => {
      const value = valueFor(row)
      return { id: row.id, name: String(value.name || row.id), revision: await hash([row.row_revision, value]), reminders: Array.isArray(value.followUps) ? value.followUps.filter((item: any) => item.reminderDate && !item.reminderDone).length : 0 }
    }))
    const targets = people.filter(person => person.id !== source.id && person.enabled === 1 && ['quoter', 'manager'].includes(person.role) && JSON.parse(person.permissions).warehouseOnly !== true)
    const jsonPerson = async (person: Person) => ({ id: person.id, name: person.display_name, role: person.role, departmentId: person.department_id || '', enabled: Boolean(person.enabled), revision: await hash(person) })
    const openOrders = orders.filter(order => ['pending', 'rejected'].includes(order.status) && ((order.responsibleUserId || order.creator) === source.id || customers.some(customer => customer.id === order.customerId)))
    const related = rows.filter(row => openOrders.some(order => order.customerId === row.id)).map(row => [row.id, row.assigned_to_user_id, row.row_revision])
    const current = { source: await jsonPerson(source), customers, ordersRevision: await hash([openOrders, related]), openOrders: openOrders.map(order => ({ id: order.id, customerId: order.customerId, receiver: order.receiver, status: order.status, suggestedTargetId: targets.find(target => target.id === rows.find(row => row.id === order.customerId)?.assigned_to_user_id)?.id || '' })), targets: await Promise.all(targets.map(jsonPerson)), departments: reads[5]!.results }
    if (request.method === 'GET') return reply(200, current)
    if (mode === 'leave' && reads[7]!.results.some(row => row.user_id === source.id)) throw new WarehouseError('该员工已完成离职交接', 409)
    if (current.source.revision !== body.sourceRevision || current.ordersRevision !== body.ordersRevision) throw new WarehouseError('人员或未完成单据已变化，请重新预览', 409)
    const assignments = new Map<string, string>()
    for (const item of body.assignments) {
      if (!item || typeof item.id !== 'string' || typeof item.toUserId !== 'string' || assignments.has(item.id)) throw new WarehouseError('交接客资重复或格式错误')
      const customer = customers.find(customer => customer.id === item.id)
      const target = current.targets.find(target => target.id === item.toUserId)
      if (!customer || customer.revision !== item.revision || !target || target.revision !== item.targetRevision) throw new WarehouseError('客资归属、版本或接手人员已变化，请重新预览', 409)
      assignments.set(item.id, target.id)
    }
    if (mode === 'leave' && assignments.size !== customers.length) throw new WarehouseError('离职前必须交接全部客资')
    if (mode === 'handoff' && !assignments.size) throw new WarehouseError('请选择要交接的客资')
    if (mode === 'department' && body.departmentId !== '' && !current.departments.some(row => row.id === body.departmentId)) throw new WarehouseError('请选择启用部门')
    const clauses = ['(SELECT revision FROM warehouse_revision WHERE id = 1) = ?', 'EXISTS (SELECT 1 FROM sessions WHERE token = ? AND user_id = ? AND expires_at > ?)']
    const args: (string | number | null)[] = [Number(reads[6]!.results[0]!.revision), token, actor.id, new Date().toISOString()]
    // Compare exact typed rows and cardinality, including phantoms, using one JSON bind per table.
    for (const [table, columns, data, where] of [
      ['users', ['id', 'account', 'display_name', 'enabled', 'role', 'permissions', 'department_id'], people, '1'],
      ['crm_customers', ['id', 'assigned_to_user_id', 'row_revision', 'value'], rows, '1'],
      ['departments', ['id', 'name'], current.departments, 'enabled = 1'],
      ['app_state', ['value', 'revision'], reads[4]!.results, "key = 'customers'"],
      ['personnel_departures', ['user_id', 'batch_id', 'actor_id', 'reason'], reads[7]!.results, '1'],
    ] as const) {
      clauses.push(`(SELECT COUNT(*) FROM ${table} WHERE ${where}) = ? AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM ${table} t WHERE ${where} AND ${columns.map(column => `t.${column} IS json_extract(j.value, '$.${column}')`).join(' AND ')}))`)
      args.push(data.length, boundedJSON(data))
    }
    clauses.push('NOT EXISTS (SELECT 1 FROM personnel_handoff_batches WHERE actor_id = ? AND request_key = ?)')
    args.push(actor.id, key)
    const writes = [db.prepare(`UPDATE transaction_guard SET ok = CASE WHEN ${clauses.join(' AND ')} THEN 1 ELSE 0 END WHERE id = 1`).bind(...args)]
    let boundBytes = args.reduce<number>((sum, value) => sum + (typeof value === 'string' ? encoder.encode(value).byteLength : 8), 0)
    const add = (sql: string, ...values: (string | number | null)[]) => {
      for (const value of values) {
        const size = typeof value === 'string' ? encoder.encode(value).byteLength : 8
        if (size > 1800000) throw new WarehouseError('交接数据过大，请缩小数据范围后重试', 413)
        boundBytes += size
      }
      if (boundBytes > 8000000) throw new WarehouseError('交接数据过大，请缩小数据范围后重试', 413)
      writes.push(db.prepare(sql).bind(...values))
    }
    const batchId = crypto.randomUUID()
    const now = new Date().toISOString()
    const values = new Map<string, any>()
    const customerChanges: { id: string, target: string, owner: string, value: string, revision: string, logId: string }[] = []
    for (const [id, targetId] of assignments) {
      const target = current.targets.find(target => target.id === targetId)!
      const value = { ...valueFor(rows.find(row => row.id === id)!), assignedToUserId: targetId, owner: target.name, updatedAt: now }
      values.set(id, value)
      customerChanges.push({ id, target: targetId, owner: target.name, value: JSON.stringify(value), revision: crypto.randomUUID(), logId: crypto.randomUUID() })
    }
    if (assignments.size) {
      const changes = boundedJSON(customerChanges)
      add(`WITH changes AS (SELECT value FROM json_each(?))
        UPDATE crm_customers SET (assigned_to_user_id, owner, value, row_revision) =
          (SELECT json_extract(value,'$.target'), json_extract(value,'$.owner'), json_extract(value,'$.value'), json_extract(value,'$.revision')
           FROM changes WHERE json_extract(value,'$.id') = crm_customers.id), updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT json_extract(value,'$.id') FROM changes)`, changes)
      add(`INSERT INTO crm_customer_handoffs (id,customer_id,from_user_id,to_user_id,actor_user_id,reason,progress_note,next_action,due_at)
        SELECT json_extract(value,'$.logId'), json_extract(value,'$.id'), ?, json_extract(value,'$.target'), ?, ?, ?, ?, ? FROM json_each(?)`, source.id, actor.id, body.reason.trim(), '批量交接，保留原跟进和业务记录', '由接手人继续处理未完成事项', now, changes)
      const merged = saved ? saved.map(value => values.get(value.id) || value) : rows.map(row => values.get(row.id) || JSON.parse(row.value))
      for (const [id, value] of values) if (!merged.some(item => item.id === id)) merged.push(value)
      add("INSERT INTO app_state (key,value,revision,updated_by) VALUES ('customers',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, revision=excluded.revision, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP", boundedJSON(merged), crypto.randomUUID(), actor.id)
    }
    let movedOrders = 0
    const orderChanges: { id: string, value: string, detail: string }[] = []
    for (const order of orders.filter(order => ['pending', 'rejected'].includes(order.status))) {
      let targetId = assignments.get(order.customerId)
      if (!targetId && mode === 'leave' && (order.responsibleUserId || order.creator) === source.id) {
        const owner = rows.find(row => row.id === order.customerId)?.assigned_to_user_id
        targetId = current.targets.find(target => target.id === owner)?.id || body.orderTargetId
        const target = current.targets.find(target => target.id === targetId)
        if (!target || body.orderTargetId === targetId && target.revision !== body.orderTargetRevision) throw new WarehouseError('未绑定客户的未完成单据需要指定接手人')
      }
      if (!targetId) continue
      order.responsibleUserId = targetId
      orderChanges.push({ id: order.id, value: JSON.stringify(order), detail: JSON.stringify({ batchId, toUserId: targetId }) })
      movedOrders++
    }
    if (orderChanges.length) {
      const changes = boundedJSON(orderChanges)
      add(`WITH changes AS (SELECT value FROM json_each(?))
        UPDATE warehouse_orders SET value = (SELECT json_extract(value,'$.value') FROM changes WHERE json_extract(value,'$.id') = warehouse_orders.id)
        WHERE id IN (SELECT json_extract(value,'$.id') FROM changes)`, changes)
      add(`INSERT INTO warehouse_log (event,actor,target,detail,time)
        SELECT ?, ?, json_extract(value,'$.id'), json_extract(value,'$.detail'), ? FROM json_each(?)`, '发货单责任交接（不改变库存）', actor.id, now, changes)
    }
    if (mode === 'department') add('UPDATE users SET department_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', body.departmentId || null, source.id)
    if (mode === 'leave') {
      add('INSERT INTO personnel_departures (user_id,batch_id,actor_id,reason) VALUES (?,?,?,?)', source.id, batchId, actor.id, body.reason.trim())
      add('UPDATE users SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', source.id)
      add('DELETE FROM sessions WHERE user_id = ?', source.id)
    }
    const result = { id: batchId, movedCustomers: assignments.size, movedOrders, sourceDisabled: mode === 'leave' }
    add('INSERT INTO personnel_handoff_batches (id,actor_id,source_id,request_key,request_hash,mode,reason,assignments,result) VALUES (?,?,?,?,?,?,?,?,?)', batchId, actor.id, source.id, key, signature, mode, body.reason.trim(), JSON.stringify([...assignments]), JSON.stringify(result))
    try { await db.batch(writes) }
    catch (error) {
      if (/CHECK constraint|UNIQUE constraint|SQLITE_BUSY|database is locked/i.test(String(error))) {
        const committed = await db.prepare('SELECT request_hash, result FROM personnel_handoff_batches WHERE actor_id = ? AND request_key = ?').bind(actor.id, key).first<{ request_hash: string, result: string }>()
        if (committed?.request_hash === signature) return reply(200, JSON.parse(committed.result))
        throw new WarehouseError('人员、客资或单据已变化，请重新预览', 409)
      }
      throw error
    }
    return reply(200, result)
  }
  catch (error) {
    if (error instanceof WarehouseError) return reply(error.status, { message: error.message })
    console.error(error)
    return reply(500, { message: '交接失败，未执行本次变更' })
  }
}
