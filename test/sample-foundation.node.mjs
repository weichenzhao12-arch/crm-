import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { snapshotB2BPrice } from '../src/features/quote/b2b-pricing.ts'
import { balances, filterSamples, post, releaseOldReservations, sampleCategories, stockStatus } from '../src/local-test/inventory.ts'
import { samplePermissions } from '../src/local-test/permissions.ts'

test('sample issue does not grant stock maintenance', () => {
  assert.deepEqual(samplePermissions({ enabled: true, role: 'quoter', permissions: { issueSamples: true } }), { issue: true, maintain: false })
  assert.deepEqual(samplePermissions({ enabled: true, role: 'quoter', permissions: { manageSampleStock: true } }), { issue: false, maintain: true })
  assert.deepEqual(samplePermissions({ enabled: true, role: 'viewer', permissions: { issueSamples: true, manageSampleStock: true } }), { issue: false, maintain: false })
})

test('local workshop posts all lines or leaves the ledger unchanged', () => {
  const a = { id: 'a', product: 'Test A', spec: '20x30', location: 'A', minimum: 1 }
  const b = { ...a, id: 'b' }
  const make = (id, kind, lines, original) => ({ id, kind, lines, original, customer: 'Walk-in', reason: 'Test', time: 'test' })
  const line = (sample, quantity) => ({ sample, quantity })
  let ledger = post([], make('in', 'receipt', [line(a, 5), line(b, 5)]))
  assert.throws(() => post(ledger, make('bad', 'issue', [line(a, 2), line(b, 6)])))
  assert.deepEqual(balances(ledger, 'a'), { stock: 5, reserved: 0, available: 5 })
  ledger = post(ledger, make('out', 'issue', [line(a, 2)]))
  ledger = post(ledger, make('back', 'return', [line(a, 1)], 'out'))
  assert.deepEqual(balances(ledger, 'a'), { stock: 4, reserved: 0, available: 4 })
  assert.deepEqual(balances(ledger, 'b'), { stock: 5, reserved: 0, available: 5 })
  assert.throws(() => post(ledger, make('back2', 'return', [line(a, 2)], 'out')))
  ledger = post(ledger, make('hold', 'reserve', [line(a, 2), line(b, 2)]))
  ledger = post(ledger, make('pick', 'pickup', [line(a, 2), line(b, 0)], 'hold'))
  assert.deepEqual(balances(ledger, 'a'), { stock: 2, reserved: 0, available: 2 })
  assert.deepEqual(balances(ledger, 'b'), { stock: 5, reserved: 0, available: 5 })
  assert.throws(() => post(ledger, make('pick-again', 'pickup', [line(a, 2), line(b, 0)], 'hold')))
})

test('sample receipts, reservations, issues and partial returns reconcile', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0006_sample_inventory.sql', import.meta.url), 'utf8'))
  db.exec("INSERT INTO sample_skus (id, product_id, specification, location, reorder_at) VALUES ('s','p','20x30','A',1)")
  function line(id, kind, quantity, original = null) {
    db.prepare('INSERT INTO sample_documents (id,kind,customer_name,original_document_id,reason,created_by) VALUES (?,?,?,?,?,?)')
      .run(id, kind, kind === 'issue' ? 'Walk-in' : null, original, 'Test', 'tester')
    db.prepare('INSERT INTO sample_document_lines VALUES (?,?,?,?,?)').run(id, id, 's', '{}', quantity)
  }
  const post = (id, action) => db.prepare('INSERT INTO sample_movements (line_id,action,actor_id) VALUES (?,?,?)').run(id, action, 'tester')
  const balance = () => Object.values(db.prepare('SELECT on_hand,reserved,available FROM sample_availability').get())
  line('in', 'receipt', 2)
  post('in', 'receive')
  assert.throws(() => post('in', 'receive'))
  line('out', 'issue', 2)
  line('other', 'issue', 1)
  post('out', 'reserve')
  assert.throws(() => post('other', 'reserve'))
  assert.deepEqual(balance(), [2, 2, 0])
  post('out', 'issue')
  assert.throws(() => post('out', 'release'))
  assert.deepEqual(balance(), [0, 0, 0])
  line('back', 'return', 1, 'out')
  post('back', 'return')
  line('too-many', 'return', 2, 'out')
  assert.throws(() => post('too-many', 'return'))
  line('void-in', 'reversal', 2, 'in')
  assert.throws(() => post('void-in', 'reverse_receipt'))
  assert.deepEqual(balance(), [1, 0, 1])
  assert.equal(db.prepare('SELECT needs_restock FROM sample_availability').get().needs_restock, 1)
  line('cancel', 'issue', 1)
  post('cancel', 'reserve')
  post('cancel', 'release')
  assert.deepEqual(balance(), [1, 0, 1])
  db.close()
})

test('direct sample issue preserves the final piece and warns below five', () => {
  const a = { id: 'a', product: 'Test A', spec: '20x30', location: 'A', minimum: 5 }
  const b = { ...a, id: 'b' }
  const make = (id, kind, lines) => ({ id, kind, lines, customer: 'Walk-in', reason: 'Test', time: 'test' })
  const line = (sample, quantity) => ({ sample, quantity })
  let ledger = post([], make('in', 'receipt', [line(a, 5), line(b, 1)]))
  ledger = post(ledger, make('old', 'reserve', [line(a, 3)]))
  ledger = releaseOldReservations(ledger)
  assert.equal(releaseOldReservations(ledger).length, ledger.length)
  assert.equal(stockStatus(balances(ledger, 'a').stock), '充足')
  assert.throws(() => post(ledger, make('bad', 'issue', [line(a, 1), line(b, 1)])), /最后 1 份/)
  assert.equal(balances(ledger, 'a').stock, 5)
  ledger = post(ledger, make('out', 'issue', [line(a, 1)]))
  assert.equal(stockStatus(balances(ledger, 'a').stock), '需补样')
  ledger = post(ledger, make('last', 'issue', [line(a, 3)]))
  assert.equal(balances(ledger, 'a').stock, 1)
  assert.match(stockStatus(1), /禁止出库/)
  assert.throws(() => post(ledger, make('none', 'issue', [line(a, 1)])), /最后 1 份/)
})

test('sample filters combine category, stock status and specification keywords', () => {
  assert.equal(sampleCategories.length, 8)
  const base = { product: 'Turf A', spec: '20×30', location: 'A-01', minimum: 5 }
  const rows = [
    { ...base, id: 'a', category: '运动草', needleRow: '3/8', quantity: 4 },
    { ...base, id: 'b', category: '运动草', needleRow: '3/8', quantity: 5 },
    { ...base, id: 'c', quantity: 1 },
  ]
  assert.deepEqual(filterSamples(rows, { category: '运动草', stock: 'low', keyword: '3/8 A-01' }).map(row => row.id), ['a'])
  assert.deepEqual(filterSamples(rows, { category: '其他', stock: 'blocked', keyword: 'TURF' }).map(row => row.id), ['c'])
  assert.deepEqual(filterSamples(rows, { category: '', stock: 'ready', keyword: '' }).map(row => row.id), ['a', 'b'])
})

test('stock count corrections require a reason and cannot go negative', () => {
  const sample = { id: 'a', product: 'Turf A', spec: '20×30', location: 'A-01', minimum: 5 }
  const receipt = { id: 'in', kind: 'receipt', customer: '', reason: 'Receipt', time: 'test', lines: [{ sample, quantity: 2 }] }
  const ledger = post([], receipt)
  const correction = { ...receipt, id: 'correction', kind: 'adjustDown', reason: 'Damaged sample' }
  assert.throws(() => post(ledger, { ...correction, reason: ' ' }))
  assert.throws(() => post(ledger, { ...correction, lines: [{ sample, quantity: 3 }] }))
  assert.equal(balances(post(ledger, correction), sample.id).stock, 0)
  assert.equal(balances(ledger, sample.id).stock, 2)
})

test('B2B area boundaries and snapshots are independent of future price edits', () => {
  const version = { id: 'v1', productId: 'p', terms: 'Freight excluded', tiers: [
    { fromSquareMetres: 0, floorCents: 4500 },
    { fromSquareMetres: 1000, floorCents: 4000 },
    { fromSquareMetres: 2000, floorCents: 3800 },
  ] }
  assert.equal(snapshotB2BPrice(version, 999, 4500).floorCents, 4500)
  assert.throws(() => snapshotB2BPrice(version, 999, 4400))
  const quote = snapshotB2BPrice(version, 1000, 4400)
  assert.equal(quote.floorCents, 4000)
  assert.equal(snapshotB2BPrice(version, 2000, 3800).floorCents, 3800)
  version.tiers[1].floorCents = 5000
  assert.equal(quote.floorCents, 4000)
  version.tiers.push({ fromSquareMetres: 3000, floorCents: 3600 })
  assert.throws(() => snapshotB2BPrice(version, 3000, 5000))
})
