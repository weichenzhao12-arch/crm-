import * as XLSX from 'xlsx'
import type { QuoteExportPayload, QuoteLine } from './types'
import { lineSubtotal, quoteTotals } from './pricing'

function lineRows(lines: QuoteLine[]) {
  return lines.map((line, index) => ({
    '序号': index + 1,
    '货号/名称': line.title,
    '规格': line.spec,
    '数量': line.quantity,
    '单位': line.unit,
    '单价': line.unitPrice,
    '金额': lineSubtotal(line.quantity, line.unitPrice),
    '备注': line.note ?? '',
  }))
}

function setColumnWidths(sheet: XLSX.WorkSheet) {
  sheet['!cols'] = [
    { wch: 8 },
    { wch: 24 },
    { wch: 24 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 28 },
  ]
}

export function buildQuoteWorkbook(quote: QuoteExportPayload): XLSX.WorkBook {
  const totals = quoteTotals(quote.lines)
  const productLines = quote.lines.filter(line => line.kind === 'product')
  const materialLines = quote.lines.filter(line => line.kind === 'material')
  const workbook = XLSX.utils.book_new()

  const summaryRows = [
    ['昱邦草坪报价单'],
    [],
    ['客户名称', quote.meta.customerName],
    ['报价日期', quote.meta.quoteDate],
    ['备注', quote.meta.remark],
    [],
    ['产品小计', totals.productSubtotal],
    ['材料小计', totals.materialSubtotal],
    ['报价总计', totals.grandTotal],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 16 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, '报价单')

  const productSheet = XLSX.utils.json_to_sheet(lineRows(productLines))
  setColumnWidths(productSheet)
  XLSX.utils.book_append_sheet(workbook, productSheet, '产品明细')

  const materialSheet = XLSX.utils.json_to_sheet(lineRows(materialLines))
  setColumnWidths(materialSheet)
  XLSX.utils.book_append_sheet(workbook, materialSheet, '材料明细')

  return workbook
}

export function downloadQuoteWorkbook(quote: QuoteExportPayload) {
  const workbook = buildQuoteWorkbook(quote)
  const customer = quote.meta.customerName.trim() || '客户'
  const date = quote.meta.quoteDate || new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `${customer}-报价单-${date}.xlsx`)
}
