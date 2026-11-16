import { webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { expect, it, vi } from 'vitest'
import { pendingMutation } from '../src/features/warehouse/mutation'

it('reuses unconfirmed submissions across reloads without storing customer data', async () => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('TextEncoder', TextEncoder)
  sessionStorage.clear()
  try {
    const payload = { receiver: 'private-test-name', lines: [{ stockId: 's', count: 1 }] }
    const first = await pendingMutation('sales', 'orders', payload, 'request-key-a')
    const retry = await pendingMutation('sales', 'orders', { lines: payload.lines, receiver: payload.receiver }, 'different-after-reload')
    expect(retry.key).toBe(first.key)
    expect(sessionStorage.getItem('warehouse-pending-mutations-v1')).not.toContain(payload.receiver)
    expect((await pendingMutation('other-sales', 'orders', payload, 'request-key-b')).key).toBe('request-key-b')
    first.resolved()
    expect((await pendingMutation('sales', 'orders', payload, 'new-intent-key')).key).toBe('new-intent-key')
  }
  finally { sessionStorage.clear(); vi.unstubAllGlobals() }
})
