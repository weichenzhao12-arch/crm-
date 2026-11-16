import type { Specs, StockView } from './model'
import { measurement, stockProductKey, warehouseFields, warehouseInternalFields, wholeCount } from './model'
import type { WorkBook } from 'xlsx'

export type StockImportRow = Specs & Partial<Record<typeof warehouseInternalFields[number][0], string>> & {
  id?: string, width: number, length: number, receiveRolls: number,
  receiveRemnants: { meters: number, count: number }[], visible?: boolean,
}
export const sheetColumns = [
  ['id', '库存ID'], ...warehouseFields, ['width', '宽度(m)'], ['length', '整卷长度(m)'],
  ...warehouseInternalFields, ['rolls', '实物卷数'], ['remnants', '实物零货'],
  ['availableRolls', '可用卷数'], ['availableRemnants', '可用零货'], ['reservedRolls', '锁定卷数'],
  ['reservedRemnants', '锁定零货'], ['physicalArea', '实存面积(㎡)'], ['availableArea', '可用面积(㎡)'],
  ['visible', '代理商可见'], ['receiveRolls', '本次入库卷数'], ['receiveRemnants', '本次入库零货'],
] as const
const required = [...warehouseFields.map(([, label]) => label), '宽度(m)', '整卷长度(m)', '本次入库卷数', '本次入库零货']
const snapshots = new Set(['rolls', 'remnants', 'availableRolls', 'availableRemnants', 'reservedRolls', 'reservedRemnants', 'physicalArea', 'availableArea'])
const fail = (row: number, message: string): never => { throw new Error(`第 ${row} 行：${message}`) }
export function formatRemnants(parts: Record<string, number>) {
  return Object.entries(parts).sort(([a], [b]) => Number(a) - Number(b)).map(([meters, count]) => `${meters}×${count}`).join('; ')
}
function numeric(value: string, row: number, label: string, count = false) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) fail(row, `${label}必须是有效数字`)
  try { return count ? wholeCount(Number(value)) : measurement(Number(value)) }
  catch { return fail(row, `${label}数值无效`) }
}
export function parseRemnants(value: string, row: number) {
  if (!value) return []
  return value.split(/[;；,，\n]+/).filter(part => part.trim()).map(part => {
    const match = part.trim().match(/^(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+)$/)
    if (!match) return fail(row, '零货格式无效（例如 7×2）')
    const meters = numeric(match[1]!, row, '零货米数')
    const count = numeric(match[2]!, row, '零货段数', true)
    if (!count) fail(row, '零货段数必须大于零')
    return { meters, count }
  })
}
export async function parseStockWorkbook(book: WorkBook): Promise<{ rows: StockImportRow[], lineNumbers: number[] }> {
  const XLSX = await import('xlsx')
  const sheet = book.Sheets[book.SheetNames[0] || '']
  if (!sheet?.['!ref']) throw new Error('库存表为空')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (range.e.r > 10000 || range.e.c > 100) throw new Error('表格范围过大，请删除多余空行列')
  const headers: { key: string, column: number }[] = []
  const seen = new Set<string>()
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]
    const name = String(cell?.v ?? '').trim()
    const column = sheetColumns.find(([, label]) => label === name)
    if (!column || cell?.f) fail(range.s.r + 1, `未知表头：${name || '(空白)'}`)
    if (seen.has(name)) fail(range.s.r + 1, `重复表头：${name}`)
    seen.add(name); headers.push({ key: column![0], column: c })
  }
  for (const label of required) if (!seen.has(label)) fail(range.s.r + 1, `缺少表头：${label}`)
  const rows: StockImportRow[] = [], lineNumbers: number[] = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    if (!headers.some(({ column }) => { const c = sheet[XLSX.utils.encode_cell({ r, c: column })]; return c?.f || String(c?.v ?? '').trim() })) continue
    if (rows.length >= 200) fail(r + 1, '最多导入200行')
    const raw: Record<string, string> = {}
    for (const { key, column } of headers) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: column })]
      if (snapshots.has(key)) continue
      if (cell?.f) fail(r + 1, `${key}不允许公式`)
      if (cell?.t === 'e') fail(r + 1, `${key}单元格错误`)
      raw[key] = String(cell?.t === 'n' && !['width', 'length', 'receiveRolls'].includes(key) ? cell.w ?? cell.v : cell?.v ?? '').trim()
    }
    const row = Object.fromEntries(warehouseFields.map(([key]) => [key, raw[key] || ''])) as unknown as StockImportRow
    for (const key of ['category', 'code', 'name'] as const) if (!row[key]) fail(r + 1, `${key}不能为空`)
    if (warehouseFields.some(([key]) => row[key].length > 150)) fail(r + 1, '规格字段过长')
    if (raw.id) row.id = raw.id
    row.width = numeric(raw.width || '', r + 1, '宽度')
    row.length = numeric(raw.length || '', r + 1, '整卷长度')
    row.receiveRolls = numeric(raw.receiveRolls || '0', r + 1, '入库卷数', true)
    row.receiveRemnants = parseRemnants(raw.receiveRemnants || '', r + 1)
    if (row.receiveRemnants.length > 200) fail(r + 1, '零货明细最多200项')
    if (row.receiveRemnants.some(part => part.meters > row.length)) fail(r + 1, '零货米数不能超过整卷长度')
    for (const [key] of warehouseInternalFields) if (raw[key]) {
      if (raw[key]!.length > (key === 'remark' ? 1000 : 150)) fail(r + 1, `${key}字段过长`)
      row[key] = raw[key]
    }
    if (row.productionDate && (!/^\d{4}-\d{2}-\d{2}$/.test(row.productionDate) || row.productionDate.startsWith('0000') || !Number.isFinite(Date.parse(`${row.productionDate}T00:00:00Z`)) || new Date(`${row.productionDate}T00:00:00Z`).toISOString().slice(0, 10) !== row.productionDate)) fail(r + 1, '生产日期必须为 YYYY-MM-DD 文本')
    if (raw.visible) {
      if (!['是', '否', 'true', 'false', '1', '0'].includes(raw.visible)) fail(r + 1, '代理商可见必须为是或否')
      row.visible = ['是', 'true', '1'].includes(raw.visible)
    }
    rows.push(row); lineNumbers.push(r + 1)
  }
  if (!rows.length) throw new Error('没有可导入的数据行')
  return { rows, lineNumbers }
}
export async function readStockFile(file: File) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('请选择 .xlsx、.xls 或 .csv 文件')
  if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过5MB')
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true, cellText: true, raw: true })
  return parseStockWorkbook(book)
}
export function previewStockRows(rows: StockImportRow[], stocks: StockView[], access: { importStock: boolean, receive: boolean, addSpec: boolean, visibility: boolean }, lines = rows.map((_, i) => i + 2)) {
  const explicit = new Map<string, Record<string, unknown>>()
  const newlySeen = new Set<string>()
  return rows.map((row, index) => {
    const errors: string[] = []
    const key = stockProductKey(row)
    const matches = stocks.filter(stock => stockProductKey(stock) === key)
    const target = row.id ? stocks.find(stock => stock.id === row.id) : matches.length === 1 ? matches[0] : undefined
    if (!access.importStock) errors.push('无批量入库权限')
    if (row.id && (!target || stockProductKey(target) !== key)) errors.push('库存ID不存在或完整规格不匹配')
    if (!row.id && matches.length > 1) errors.push('存在多个相同规格，请填写库存ID')
    if (!target && !matches.length && !access.addSpec) errors.push('无新增规格权限')
    if ((row.receiveRolls || row.receiveRemnants.length) && !access.receive) errors.push('无入库权限')
    if (row.visible !== undefined && row.visible !== (target?.visible ?? false) && !access.visibility) errors.push('无可见范围设置权限')
    if (warehouseInternalFields.some(([field]) => row[field] !== undefined && row[field] !== (target?.[field] || '')) && !access.addSpec) errors.push('无内部资料修改权限')
    const metadataKey = target?.id || key
    const values = explicit.get(metadataKey) || {}
    for (const field of ['visible', ...warehouseInternalFields.map(([field]) => field)] as const) {
      if (row[field] === undefined) continue
      if (field in values && values[field] !== row[field]) errors.push('重复规格的显式资料冲突')
      values[field] = row[field]
    }
    explicit.set(metadataKey, values)
    const action = target || matches.length || newlySeen.has(key) ? '合并入库' : '新增规格'
    newlySeen.add(key)
    return { row, line: lines[index], action, error: errors.length ? `第 ${lines[index]} 行：${errors.join('；')}` : '' }
  })
}
export async function createStockWorkbook(stocks?: StockView[]) {
  const XLSX = await import('xlsx')
  const data: (string | number)[][] = [sheetColumns.map(([, label]) => label)]
  for (const stock of stocks || []) data.push(sheetColumns.map(([key]) => {
    if (key === 'reservedRemnants') return formatRemnants(Object.fromEntries(Object.entries(stock.remnants).map(([meters, count]) => [meters, Math.max(0, count - (stock.availableRemnants?.[meters] ?? count))]).filter(([, count]) => Number(count) > 0)))
    if (key === 'physicalArea' || key === 'availableArea') {
      const parts = key === 'physicalArea' ? stock.remnants : stock.availableRemnants ?? stock.remnants
      const rolls = key === 'physicalArea' ? stock.rolls : stock.availableRolls ?? stock.rolls
      return Number((stock.width * (rolls * stock.length + Object.entries(parts).reduce((sum, [meters, count]) => sum + Number(meters) * count, 0))).toFixed(6))
    }
    if (key === 'receiveRolls' || key === 'receiveRemnants') return ''
    if (key === 'visible') return stock.visible ? '是' : '否'
    if (key === 'remnants' || key === 'availableRemnants') return formatRemnants(stock[key] ?? stock.remnants)
    return stock[key] ?? (key === 'availableRolls' ? stock.rolls : key === 'reservedRolls' ? 0 : '')
  }))
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(data)
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] }
  sheet['!cols'] = sheetColumns.map(() => ({ wch: 18 }))
  const numericColumns = new Set(['width', 'length', 'rolls', 'availableRolls', 'reservedRolls', 'physicalArea', 'availableArea', 'receiveRolls'])
  const formattedRows = stocks ? stocks.length : 200
  for (let r = 1; r <= formattedRows; r++) {
    for (let c = 0; c < sheetColumns.length; c++) {
      if (numericColumns.has(sheetColumns[c]![0])) continue
      const address = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[address] || { t: 's', v: '' }
      cell.z = '@'
      sheet[address] = cell
    }
  }
  if (!stocks) sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 200, c: sheetColumns.length - 1 } })
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] }
  XLSX.utils.book_append_sheet(book, sheet, '库存')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['说明'], ['尺寸单位：米；整卷数量单位：卷；零货格式：7×2 表示7米2段，多种长度用分号分隔。'],
    ['仅本次入库卷数、本次入库零货追加库存；实物、可用、锁定数量为只读快照，不导入。'],
    ['生产日期使用 YYYY-MM-DD 文本；货号使用文本保留前导零。空白内部资料不修改已有值。'],
    ['相同完整规格合并入库。库存ID可留空；填写时必须与完整规格一致。最多200行。'],
  ]), '说明')
  return book
}
export async function downloadStockWorkbook(stocks?: StockView[]) {
  const book = await createStockWorkbook(stocks)
  const XLSX = await import('xlsx')
  XLSX.writeFile(book, stocks ? '库存完整资料.xlsx' : '库存入库模板.xlsx')
}
