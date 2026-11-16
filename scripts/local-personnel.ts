import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { canExecuteHandoff } from '../functions/customer-handoff'
import type { Order } from '../src/features/warehouse/model'
import { WarehouseError } from '../src/features/warehouse/model'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
type Person = { id: string, account: string, display_name: string, enabled: number, role: string, permissions: string, department_id: string | null }
type Customer = { id: string, assigned_to_user_id: string | null, row_revision: string, value: string }

export function localPersonnel(db: DatabaseSync) {
  const people = () => db.prepare('SELECT id, account, display_name, enabled, role, permissions, department_id FROM users ORDER BY id').all() as unknown as Person[]
  const customerRows = () => db.prepare('SELECT id, assigned_to_user_id, row_revision, value FROM crm_customers ORDER BY id').all() as unknown as Customer[]
  const orders = () => db.prepare('SELECT value FROM warehouse_orders ORDER BY id').all().map(row => JSON.parse(String(row.value)) as Order)
  function snapshot() {
    const row = db.prepare("SELECT value FROM app_state WHERE key = 'customers'").get()
    const parsed = row ? JSON.parse(String(row.value)) : null
    return Array.isArray(parsed) ? parsed : null
  }
  function customerValue(row: Customer, saved: any[] | null) {
    const value = saved?.find(item => item.id === row.id)
    return value && value.assignedToUserId === row.assigned_to_user_id ? value : JSON.parse(row.value)
  }
  function state(sourceId: string) {
    const allPeople = people()
    const source = allPeople.find(person => person.id === sourceId)
    if (!source) throw new WarehouseError('人员不存在', 400)
    const allRows = customerRows()
    const rows = allRows.filter(customer => customer.assigned_to_user_id === source.id)
    const saved = snapshot()
    const customers = rows.map(row => {
      const value = customerValue(row, saved)
      return { id: row.id, name: String(value.name || row.id), revision: hash([row.row_revision, value]), reminders: Array.isArray(value.followUps) ? value.followUps.filter((item: any) => item.reminderDate && !item.reminderDone).length : 0 }
    })
    const openOrders = orders().filter(order => ['pending', 'rejected'].includes(order.status)
      && ((order.responsibleUserId || order.creator) === source.id || customers.some(customer => customer.id === order.customerId)))
    const targets = allPeople.filter(person => person.id !== source.id && person.enabled === 1 && ['quoter', 'manager'].includes(person.role) && JSON.parse(person.permissions).warehouseOnly !== true)
    const jsonPerson = (person: Person) => ({ id: person.id, name: person.display_name, role: person.role, departmentId: person.department_id || '', enabled: Boolean(person.enabled), revision: hash(person) })
    const relatedRows = allRows.filter(row => openOrders.some(order => order.customerId === row.id)).map(row => [row.id, row.assigned_to_user_id, row.row_revision])
    return { source: jsonPerson(source), customers, ordersRevision: hash([openOrders, relatedRows]), openOrders: openOrders.map(order => ({ id: order.id, customerId: order.customerId, receiver: order.receiver, status: order.status, suggestedTargetId: targets.find(target => target.id === allRows.find(row => row.id === order.customerId)?.assigned_to_user_id)?.id || '' })), targets: targets.map(jsonPerson), departments: db.prepare('SELECT id, name FROM departments WHERE enabled = 1 ORDER BY rowid').all() }
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    function send(status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    let transaction = false
    try {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new WarehouseError('不允许跨站请求', 403)
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || ''
      const actor = db.prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ? AND u.enabled = 1`).get(token, new Date().toISOString()) as unknown as Person | undefined
      if (!actor) throw new WarehouseError('未登录或登录已过期', 401)
      const permissions = JSON.parse(actor.permissions)
      if ((permissions.warehouseOnly && actor.role !== 'owner') || !canExecuteHandoff(actor.role, permissions)) throw new WarehouseError('没有人员交接权限', 403)
      if (req.method === 'GET') {
        const query = new URL(req.url || '/', 'http://localhost').searchParams
        const mode = query.get('mode')
        if (mode !== 'handoff' && actor.role !== 'owner') throw new WarehouseError('调部门和离职处理仅限主账号', 403)
        db.exec('BEGIN'); transaction = true
        const result = state(query.get('sourceId') || '')
        if (mode !== 'handoff' && result.source.role === 'owner') throw new WarehouseError('主账号不进行部门调动或离职处理')
        db.exec('COMMIT'); transaction = false
        return send(200, result)
      }
      if (req.method !== 'POST') throw new WarehouseError('操作不存在', 404)
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) { size += chunk.length; if (size > 1048576) throw new WarehouseError('交接数据过大', 413); chunks.push(Buffer.from(chunk)) }
      let body: any
      try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { throw new WarehouseError('交接数据格式错误') }
      if (!body || !['department', 'leave', 'handoff'].includes(body.mode) || typeof body.sourceId !== 'string' || typeof body.sourceRevision !== 'string'
        || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000 || !Array.isArray(body.assignments) || body.assignments.length > 5000)
        throw new WarehouseError('请完整填写人员、交接原因和分配信息')
      if (body.mode !== 'handoff' && actor.role !== 'owner') throw new WarehouseError('调部门和离职处理仅限主账号', 403)
      const key = req.headers['idempotency-key']
      if (typeof key !== 'string' || !/^[\w-]{8,128}$/.test(key)) throw new WarehouseError('缺少提交编号')
      const signature = hash(body)
      db.exec('BEGIN IMMEDIATE'); transaction = true
      const prior = db.prepare('SELECT request_hash, result FROM personnel_handoff_batches WHERE actor_id = ? AND request_key = ?').get(actor.id, key)
      if (prior) {
        if (prior.request_hash !== signature) throw new WarehouseError('该交接已提交且内容不同，请先核对记录', 409)
        db.exec('COMMIT'); transaction = false
        return send(200, JSON.parse(String(prior.result)))
      }
      const current = state(body.sourceId)
      if (body.mode !== 'handoff' && current.source.role === 'owner') throw new WarehouseError('主账号不进行部门调动或离职处理')
      const freshActor = db.prepare('SELECT enabled, role, permissions FROM users WHERE id = ?').get(actor.id)
      if (!freshActor?.enabled || freshActor.role !== actor.role || freshActor.permissions !== actor.permissions) throw new WarehouseError('操作权限已变化，请重新登录', 403)
      if (body.mode === 'leave' && db.prepare('SELECT 1 FROM personnel_departures WHERE user_id = ?').get(body.sourceId)) throw new WarehouseError('该员工已完成离职交接', 409)
      if (current.source.revision !== body.sourceRevision || current.ordersRevision !== body.ordersRevision) throw new WarehouseError('人员或未完成单据已变化，请重新预览', 409)
      const batchId = randomUUID()
      const assignments = new Map<string, string>()
      for (const item of body.assignments) {
        if (!item || typeof item.id !== 'string' || typeof item.toUserId !== 'string' || assignments.has(item.id)) throw new WarehouseError('交接客资重复或格式错误')
        const customer = current.customers.find(customer => customer.id === item.id)
        const target = current.targets.find(target => target.id === item.toUserId)
        if (!customer || customer.revision !== item.revision || !target || target.revision !== item.targetRevision) throw new WarehouseError('客资归属、版本或接手人员已变化，请重新预览', 409)
        assignments.set(item.id, target.id)
      }
      if (body.mode === 'leave' && assignments.size !== current.customers.length) throw new WarehouseError('离职前必须交接全部客资')
      if (body.mode === 'handoff' && !assignments.size) throw new WarehouseError('请选择要交接的客资')
      if (body.mode === 'department' && body.departmentId !== '' && !current.departments.some(department => department.id === body.departmentId)) throw new WarehouseError('请选择启用部门')
      const saved = snapshot()
      const allRows = customerRows()
      const values = new Map<string, any>()
      for (const [id, targetId] of assignments) {
        const row = allRows.find(row => row.id === id)!
        const target = current.targets.find(target => target.id === targetId)!
        const value = { ...customerValue(row, saved), assignedToUserId: target.id, owner: target.name, updatedAt: new Date().toISOString() }
        values.set(id, value)
        db.prepare('UPDATE crm_customers SET assigned_to_user_id = ?, owner = ?, value = ?, row_revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(target.id, target.name, JSON.stringify(value), randomUUID(), id)
        db.prepare(`INSERT INTO crm_customer_handoffs (id, customer_id, from_user_id, to_user_id, actor_user_id, reason, progress_note, next_action, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), id, current.source.id, target.id, actor.id, body.reason.trim(), '批量交接，保留原跟进和业务记录', '由接手人继续处理未完成事项', new Date().toISOString())
      }
      if (assignments.size) {
        const merged = saved ? saved.map(value => values.get(value.id) || value) : allRows.map(row => values.get(row.id) || JSON.parse(row.value))
        for (const [id, value] of values) if (!merged.some(item => item.id === id)) merged.push(value)
        db.prepare(`INSERT INTO app_state (key, value, revision, updated_by) VALUES ('customers', ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
          .run(JSON.stringify(merged), randomUUID(), actor.id)
      }
      let movedOrders = 0
      for (const order of orders().filter(order => ['pending', 'rejected'].includes(order.status))) {
        let targetId = assignments.get(order.customerId)
        if (!targetId && body.mode === 'leave' && (order.responsibleUserId || order.creator) === current.source.id) {
          const customerOwner = allRows.find(row => row.id === order.customerId)?.assigned_to_user_id
          targetId = current.targets.find(target => target.id === customerOwner)?.id || body.orderTargetId
          const target = current.targets.find(target => target.id === targetId)
          if (!target || body.orderTargetId === targetId && target.revision !== body.orderTargetRevision) throw new WarehouseError('未绑定客户的未完成单据需要指定接手人')
        }
        if (!targetId) continue
        order.responsibleUserId = targetId
        db.prepare('UPDATE warehouse_orders SET value = ? WHERE id = ?').run(JSON.stringify(order), order.id)
        db.prepare('INSERT INTO warehouse_log VALUES (?, ?, ?, ?, ?)').run('发货单责任交接（不改变库存）', actor.id, order.id, JSON.stringify({ batchId, toUserId: targetId }), new Date().toISOString())
        movedOrders++
      }
      if (body.mode === 'department') db.prepare('UPDATE users SET department_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(body.departmentId || null, current.source.id)
      if (body.mode === 'leave') {
        db.prepare('INSERT INTO personnel_departures (user_id,batch_id,actor_id,reason) VALUES (?,?,?,?)').run(current.source.id, batchId, actor.id, body.reason.trim())
        db.prepare('UPDATE users SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(current.source.id)
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(current.source.id)
      }
      const result = { id: batchId, movedCustomers: assignments.size, movedOrders, sourceDisabled: body.mode === 'leave' }
      db.prepare('INSERT INTO personnel_handoff_batches (id,actor_id,source_id,request_key,request_hash,mode,reason,assignments,result) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(batchId, actor.id, current.source.id, key, signature, body.mode, body.reason.trim(), JSON.stringify([...assignments]), JSON.stringify(result))
      db.exec('COMMIT'); transaction = false
      return send(200, result)
    }
    catch (error) {
      if (transaction) db.exec('ROLLBACK')
      if (error instanceof WarehouseError) return send(error.status, { message: error.message })
      console.error(error)
      return send(500, { message: '本地交接失败，未执行本次变更' })
    }
  }
}
