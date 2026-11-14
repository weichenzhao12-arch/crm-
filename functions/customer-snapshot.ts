export interface CustomerRow {
  id: string
  assignedToUserId?: string
  owner?: string
}

export function isCustomerSnapshot(value: unknown): value is CustomerRow[] {
  return Array.isArray(value) && value.every(row => row && typeof row.id === 'string' && row.id.trim()
    && (row.assignedToUserId == null || typeof row.assignedToUserId === 'string')
    && (row.owner == null || typeof row.owner === 'string'))
    && new Set(value.map(row => row.id)).size === value.length
}

export function mergeCustomerSnapshot(current: CustomerRow[], incoming: CustomerRow[], access: {
  read: (row: CustomerRow) => boolean
  assign: boolean
  remove: boolean
  self: string
}) {
  const old = new Map(current.map(row => [row.id, row]))
  const next = new Set(incoming.map(row => row.id))
  if (!access.remove && current.some(row => access.read(row) && !next.has(row.id))) return null
  for (const row of incoming) {
    const previous = old.get(row.id)
    if (previous && !access.read(previous)) return null
    if (!access.assign && (previous
      ? (previous.assignedToUserId || '') !== (row.assignedToUserId || '') || (previous.owner || '') !== (row.owner || '')
      : row.assignedToUserId !== access.self)) return null
  }
  return [...incoming, ...current.filter(row => !access.read(row))]
}
