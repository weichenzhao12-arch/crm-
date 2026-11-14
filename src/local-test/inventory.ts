export const sampleCategories = ['运动草', '免填充运动草', '景观草', '板式网球草', '果岭草', '宠物草', '3D提花草', '其他'] as const
export type SampleCategory = typeof sampleCategories[number]

export interface Sample {
  category?: SampleCategory
  needleCount?: string
  needleRow?: string
  backing?: string
  productId?: string
  height?: string
  poundWeight?: string
  density?: string
  id: string
  product: string
  spec: string
  location: string
  minimum: number
}

export type MovementKind = 'receipt' | 'reserve' | 'issue' | 'release' | 'pickup' | 'return' | 'reverse' | 'adjustDown' | 'cancel' | 'dispatch'
export interface Movement {
  openedBy?: string
  openedById?: string
  customerId?: string
  id: string
  kind: MovementKind
  customer: string
  reason: string
  original?: string
  tracking?: string
  requiresDispatch?: boolean
  time: string
  lines: { sample: Sample, quantity: number }[]
}

const deltas: Record<MovementKind, [number, number]> = {
  receipt: [1, 0], reserve: [0, 1], issue: [-1, 0], release: [0, -1],
  pickup: [-1, -1], return: [1, 0], reverse: [-1, 0], adjustDown: [-1, 0], cancel: [1, 0], dispatch: [0, 0],
}

export function shipmentStatus(entries: Movement[], id: string) {
  if (entries.some(item => item.original === id && item.kind === 'cancel')) return 'cancelled'
  if (entries.some(item => item.original === id && item.kind === 'dispatch')) return 'sent'
  return 'pending'
}

export function balances(entries: Movement[], id: string) {
  let stock = 0
  let reserved = 0
  for (const entry of entries) {
    const quantity = entry.lines.find(line => line.sample.id === id)?.quantity ?? 0
    const [stockDelta, reserveDelta] = deltas[entry.kind]
    stock += quantity * stockDelta
    const held = entry.kind === 'pickup'
      ? entries.find(item => item.id === entry.original)?.lines.find(line => line.sample.id === id)?.quantity ?? quantity
      : quantity
    reserved += held * reserveDelta
  }
  return { stock, reserved, available: stock - reserved }
}

export function post(entries: Movement[], entry: Movement) {
  if (entries.some(item => item.id === entry.id))
    throw new Error('单据已记账')
  if (entry.kind === 'cancel' || entry.kind === 'dispatch') {
    const original = entries.find(item => item.id === entry.original && item.kind === 'issue')
    if (!original || shipmentStatus(entries, original.id) !== 'pending'
      || entries.some(item => item.original === original.id && item.kind === 'return'))
      throw new Error('原单已处理或不可操作')
    if (entry.kind === 'cancel' ? !entry.reason.trim() : !entry.tracking?.trim())
      throw new Error(entry.kind === 'cancel' ? '请填写撤销原因' : '请填写快递单号')
    return [...entries, { ...entry, customer: original.customer, customerId: original.customerId,
      lines: entry.kind === 'cancel' ? original.lines : [] }]
  }
  if (!entry.reason.trim() || !entry.lines.length || new Set(entry.lines.map(line => line.sample.id)).size !== entry.lines.length)
    throw new Error('请填写原因并选择不重复的样品')
  if (['issue', 'reserve'].includes(entry.kind) && !entry.customer.trim())
    throw new Error('请填写领取人或客户名称')
  const sources: Partial<Record<MovementKind, MovementKind[]>> = {
    pickup: ['reserve'], release: ['reserve'], return: ['pickup', 'issue'], reverse: ['receipt'],
  }
  const allowed = sources[entry.kind]
  const original = entries.find(item => item.id === entry.original)
  if (allowed && (!original || !allowed.includes(original.kind)))
    throw new Error('原单据不适用此操作')
  const related = entries.filter(item => item.original === entry.original)
  if (entry.kind === 'return' && original?.kind === 'issue' && shipmentStatus(entries, original.id) === 'cancelled')
    throw new Error('已撤销单据不能退回')
  if (entry.kind === 'return' && original?.requiresDispatch && shipmentStatus(entries, original.id) !== 'sent')
    throw new Error('未寄出的单据请撤销，不可登记退回')
  if (original?.kind === 'reserve' && related.length)
    throw new Error('备样单已处理')
  if (original?.kind === 'reserve' && entry.lines.length !== original.lines.length)
    throw new Error('请按整张备样单领样或取消')
  const next = [...entries, { ...entry, lines: entry.lines.map(line => ({ ...line, sample: { ...line.sample } })) }]
  for (const line of entry.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < (entry.kind === 'pickup' ? 0 : 1))
      throw new Error('份数须为有效整数')
    if (allowed && original) {
      const limit = original.lines.find(item => item.sample.id === line.sample.id)?.quantity ?? 0
      const used = related.reduce((sum, item) => sum + (item.lines.find(row => row.sample.id === line.sample.id)?.quantity ?? 0), 0)
      if (line.quantity + used > limit || (entry.kind === 'release' && line.quantity !== limit)
        || (entry.kind === 'pickup' && !limit))
        throw new Error('数量与原单不符')
    }
    const result = balances(next, line.sample.id)
    if (entry.kind === 'issue' && result.stock < 1)
      throw new Error(`${line.sample.product} · ${line.sample.spec} 必须保留最后 1 份`)
    if (result.reserved < 0 || result.available < 0)
      throw new Error(`${line.sample.product} · ${line.sample.spec} 可用量不足`)
  }
  return next
}

export function releaseOldReservations(entries: Movement[]) {
  const open = entries.filter(entry => entry.kind === 'reserve' && !entries.some(item => item.original === entry.id))
  return open.reduce((ledger, entry) => post(ledger, {
    ...entry, id: `legacy-release-${entry.id}`, kind: 'release', original: entry.id,
    reason: '切换为直接出库，解除旧备样占用', time: new Date().toLocaleString('zh-CN'),
  }), entries)
}

export function stockStatus(quantity: number) {
  return quantity <= 1 ? '需补样 · 禁止出库' : quantity < 5 ? '需补样' : '充足'
}

export function filterSamples<T extends Sample & { quantity: number }>(
  rows: T[],
  filters: { category: string, stock: string, keyword: string },
) {
  const terms = filters.keyword.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    const category = row.category || '其他'
    if (filters.category && category !== filters.category)
      return false
    if (filters.stock === 'low' && row.quantity >= 5
      || filters.stock === 'blocked' && row.quantity > 1
      || filters.stock === 'ready' && row.quantity <= 1)
      return false
    const searchable = [category, row.product, row.height, row.needleCount, row.needleRow,
      row.backing, row.density, row.poundWeight, row.spec, row.location].join(' ').toLowerCase()
    return terms.every(term => searchable.includes(term))
  })
}
