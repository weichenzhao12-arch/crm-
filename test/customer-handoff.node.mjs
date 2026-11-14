import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { canExecuteHandoff, insertHandoffLog, updateHandoffOwner } from '../functions/customer-handoff.ts'

test('handoff is not granted by read or account administration', () => {
  const grants = { viewAllCustomers: true, transferCustomers: true, manageUsers: true }
  assert.equal(canExecuteHandoff('quoter', grants), false)
  assert.equal(canExecuteHandoff('viewer', grants), false)
  assert.equal(canExecuteHandoff('manager', { viewAllCustomers: true }), false)
  assert.equal(canExecuteHandoff('manager', { transferCustomers: true }), false)
  assert.equal(canExecuteHandoff('manager', grants), true)
})

test('handoff writes only for the current owner and revision, and rolls back if logging fails', () => {
  const db = new DatabaseSync(':memory:')
  const migrations = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(migrations).sort())
    db.exec(readFileSync(new URL(file, migrations), 'utf8'))
  db.prepare('INSERT INTO crm_customers (id, assigned_to_user_id, value) VALUES (?, ?, ?)').run('c', 'sales-1', '{}')
  const update = db.prepare(updateHandoffOwner)
  const log = db.prepare(insertHandoffLog)
  const owner = () => db.prepare("SELECT assigned_to_user_id AS id FROM crm_customers WHERE id='c'").get().id
  assert.equal(update.run('Sales 2', 'sales-2', '{}', 'r1', 'c', 'stale', 'sales-1', 'sales-2').changes, 0)
  assert.equal(log.run('r1', 'sales-1', 'owner', 'reason', 'progress', 'next', '2026-11-04T10:00', 'c', 'r1').changes, 0)
  db.exec('BEGIN')
  assert.equal(update.run('Sales 2', 'sales-2', '{}', 'r1', 'c', '', 'sales-1', 'sales-2').changes, 1)
  assert.throws(() => log.run('r1', 'sales-1', 'owner', '', 'progress', 'next', '2026-11-04T10:00', 'c', 'r1'))
  db.exec('ROLLBACK')
  assert.equal(owner(), 'sales-1')
  db.exec('BEGIN')
  assert.equal(update.run('Sales 2', 'sales-2', '{}', 'r1', 'c', '', 'sales-1', 'sales-2').changes, 1)
  assert.equal(log.run('r1', 'sales-1', 'owner', 'reason', 'progress', 'next', '2026-11-04T10:00', 'c', 'r1').changes, 1)
  db.exec('COMMIT')
  assert.equal(owner(), 'sales-2')
  db.close()
})
