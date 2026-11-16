import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { apiFetch, CloudApiError } from '../src/api/cloud-storage'
import * as XLSX from 'xlsx'
import { createStockWorkbook, parseStockWorkbook, previewStockRows, sheetColumns } from '../src/features/warehouse/stock-sheet'
import { warehouseAccess, warehouseFields } from '../src/features/warehouse/model'
import type { Stock } from '../src/features/warehouse/model'
import StockSheetDialog from '../src/features/warehouse/StockSheetDialog.vue'
vi.mock('../src/api/cloud-storage', async importOriginal => ({ ...await importOriginal<typeof import('../src/api/cloud-storage')>(), apiFetch: vi.fn() }))

const access = warehouseAccess({ enabled: true, role: 'owner' })
const stock = { ...Object.fromEntries(warehouseFields.map(([key]) => [key, ''])), id: 's1', category: '草', code: '0010', name: '产品', width: 2, length: 25, rolls: 8, remnants: { 7: 2 }, visible: false, productionDate: '2026-01-02', location: '01' } as unknown as Stock
function workbook(headers: string[], data: unknown[][]) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...data]), '库存')
  return book
}
describe('stock spreadsheet', () => {
  it('roundtrips all specs as text, but never copies inventory into additions', async () => {
    const book = await createStockWorkbook([stock])
    const saved = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
    const { rows } = await parseStockWorkbook(saved)
    expect(rows[0]).toMatchObject({ code: '0010', productionDate: '2026-01-02', location: '01', receiveRolls: 0, receiveRemnants: [] })
    expect(rows[0]).not.toHaveProperty('rolls')
    expect(rows[0]).not.toHaveProperty('remnants')
  })
  it('template contains no live data row', async () => {
    const book = await createStockWorkbook()
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['库存']!)
    expect(rows.filter(row => Object.values(row).some(value => value !== ''))).toEqual([])
    const saved = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })
    for (const key of ['code', 'gauge', 'productionDate', 'location']) {
      const column = sheetColumns.findIndex(([field]) => field === key)
      expect(saved.Sheets['库存']![XLSX.utils.encode_cell({ r: 1, c: column })]?.z).toBe('@')
    }
    expect(book.Sheets['库存']!['!autofilter']?.ref).toBe(book.Sheets['库存']!['!ref'])
  })
  it('rejects missing, duplicate and unknown headers', async () => {
    const headers = sheetColumns.map(([, label]) => label)
    await expect(parseStockWorkbook(workbook(headers.slice(1, -1), []))).rejects.toThrow('缺少表头')
    await expect(parseStockWorkbook(workbook([...headers, headers[0]!], []))).rejects.toThrow('重复表头')
    await expect(parseStockWorkbook(workbook([...headers, '未知'], []))).rejects.toThrow('未知表头')
  })
  it('rejects writable formulas, invalid quantities and date with row numbers', async () => {
    for (const [key, value] of [['receiveRolls', '-1'], ['productionDate', '2026-02-30']] as const) {
      const book = await createStockWorkbook([stock])
      const column = sheetColumns.findIndex(([field]) => field === key)
      book.Sheets['库存']![XLSX.utils.encode_cell({ r: 1, c: column })] = { t: 's', v: value }
      await expect(parseStockWorkbook(book)).rejects.toThrow('第 2 行')
    }
    const book = await createStockWorkbook([stock])
    book.Sheets['库存']!['B2'] = { t: 's', v: '草', f: '1+1' }
    await expect(parseStockWorkbook(book)).rejects.toThrow('不允许公式')
  })
  it('merges full specs, separates technical variations and rejects conflicting metadata', async () => {
    const { rows } = await parseStockWorkbook(await createStockWorkbook([stock]))
    const row = { ...rows[0]!, receiveRolls: 2 }; delete row.id
    expect(previewStockRows([row], [stock], access)[0]?.action).toBe('合并入库')
    expect(previewStockRows([{ ...row, color: '红' }], [stock], access)[0]?.action).toBe('新增规格')
    expect(previewStockRows([row, { ...row, location: '02' }], [stock], access)[1]?.error).toContain('冲突')
    expect(previewStockRows([{ ...row, visible: false }], [], { ...access, visibility: false })[0]?.error).toBe('')
  })
  it('renders import controls only with import permission', () => {
    const denied = mount(StockSheetDialog, { props: { stocks: [], access: { ...access, importStock: false }, actor: 'a' } })
    expect(denied.find('input[type=file]').exists()).toBe(false)
    const allowed = mount(StockSheetDialog, { props: { stocks: [], access, actor: 'a' } })
    expect(allowed.find('input[type=file]').attributes('accept')).toBe('.xlsx,.xls,.csv')
    expect(allowed.find('button.wh-primary').exists()).toBe(false)
  })
  it('retains a failed attempt key, maps row numbers, and prevents duplicate confirmation after success', async () => {
    sessionStorage.clear()
    const book = await createStockWorkbook([stock])
    const column = sheetColumns.findIndex(([key]) => key === 'receiveRolls')
    book.Sheets['库存']![XLSX.utils.encode_cell({ r: 1, c: column })] = { t: 'n', v: 2 }
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' })
    const file = new File([], '入库.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes })
    const wrapper = mount(StockSheetDialog, { props: { stocks: [stock], access, actor: 'a' } })
    const input = wrapper.get('input[type=file]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change'); await flushPromises()
    await wrapper.get('input[maxlength="300"]').setValue('验收入库')
    vi.mocked(apiFetch).mockRejectedValueOnce(new CloudApiError(409, '第 1 行：库存变更')).mockResolvedValueOnce({ ok: true })
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(wrapper.text()).toContain('第 2 行：库存变更')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(wrapper.text()).toContain('入库成功')
    const calls = vi.mocked(apiFetch).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[1]?.headers).toEqual(calls[1]?.[1]?.headers)
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(wrapper.get('button.wh-primary').attributes('disabled')).toBeDefined()
  })
})
