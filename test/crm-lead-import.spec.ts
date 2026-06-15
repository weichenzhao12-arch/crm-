import { describe, expect, it } from 'vitest'
import { hasImportableLeadRow, leadImportMessage, summarizeLeadImport } from '~/features/crm/lead-import'

describe('CRM lead import helpers', () => {
  it('skips rows without customer name or contact information', () => {
    expect(hasImportableLeadRow({ 序号: 1 })).toBe(false)
    expect(hasImportableLeadRow({ 客户名称: '张三' })).toBe(true)
    expect(hasImportableLeadRow({ 客户联系方式: '13800000000' })).toBe(true)
    expect(hasImportableLeadRow({ 微信号: 'wx-test' })).toBe(true)
  })

  it('reports imported and skipped row counts', () => {
    const summary = summarizeLeadImport(8, 3, 1)

    expect(summary).toEqual({
      total: 8,
      imported: 3,
      skippedBlank: 5,
      duplicate: 1,
    })
    expect(leadImportMessage(summary)).toContain('成功 3 条')
    expect(leadImportMessage(summary)).toContain('跳过空白行 5 条')
    expect(leadImportMessage(summary)).toContain('可能重复 1 条')
  })
})
