const storageKey = 'warehouse-pending-mutations-v1'

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}

function read(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}') }
  catch { return {} }
}

export async function pendingMutation(actor: string, operation: string, body: unknown, fallbackKey: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([actor, operation, stable(body)]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const values = read()
  const key = values[signature] || fallbackKey
  if (!values[signature] && Object.keys(values).length >= 100) throw new Error('未确认提交过多，请先核对历史单据')
  values[signature] = key
  sessionStorage.setItem(storageKey, JSON.stringify(values))
  return {
    key,
    resolved() {
      const latest = read()
      for (const [pending, value] of Object.entries(latest)) if (value === key) delete latest[pending]
      sessionStorage.setItem(storageKey, JSON.stringify(latest))
    },
  }
}
