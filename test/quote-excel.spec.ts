import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildQuoteWorkbook } from '~/features/quote/excel'

describe('quote Excel export', () => {
  it('builds a workbook with quote summary and line sheets', () => {
    const workbook = buildQuoteWorkbook({
      meta: {
        customerName: '测试客户',
        quoteDate: '2026-05-21',
        remark: '含材料',
      },
      lines: [
        {
          id: 'line-1',
          kind: 'product',
          sourceId: 'product-1',
          title: 'YBXXC3015400/0003',
          spec: '30MM 深M',
          quantity: 100,
          unit: '㎡',
          unitPrice: 20.5,
          note: '休闲草',
        },
        {
          id: 'line-2',
          kind: 'material',
          sourceId: 'material-1',
          title: '双组胶水 A类',
          spec: '9kg胶水+1kg固化剂',
          quantity: 2,
          unit: '桶',
          unitPrice: 225,
        },
      ],
    })

    expect(workbook.SheetNames).toEqual(['报价单', '产品明细', '材料明细'])

    const summarySheet = workbook.Sheets['报价单']
    expect(summarySheet).toBeDefined()
    const summary = XLSX.utils.sheet_to_json(summarySheet!, { header: 1 }) as unknown[][]
    expect(summary.flat()).toContain('测试客户')
    expect(summary.flat()).toContain(2500)
  })
})
