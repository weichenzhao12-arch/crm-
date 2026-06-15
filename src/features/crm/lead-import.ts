export interface LeadImportSummary {
  total: number
  imported: number
  skippedBlank: number
  duplicate: number
}

export function firstImportText(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || ''
}

export function normalizeImportColumnName(value: string) {
  return value.replace(/[\s\n\r（）()、，,]/g, '').toLowerCase()
}

export function importRowText(row: Record<string, any>, ...names: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeImportColumnName(key), value] as const)
  for (const name of names) {
    if (row[name] !== undefined)
      return firstImportText(row[name])
    const normalizedName = normalizeImportColumnName(name)
    const matched = normalizedEntries.find(([key]) => key === normalizedName)
    if (matched)
      return firstImportText(matched[1])
  }
  return ''
}

export function hasImportableLeadRow(row: Record<string, any>) {
  return Boolean(
    importRowText(row, '客户名称', 'name')
    || importRowText(row, '客户联系方式', '联系方式', '电话', 'phone', 'contact')
    || importRowText(row, '微信', '微信号', 'wechat'),
  )
}

export function summarizeLeadImport(total: number, imported: number, duplicate = 0): LeadImportSummary {
  return {
    total,
    imported,
    skippedBlank: Math.max(0, total - imported),
    duplicate,
  }
}

export function leadImportMessage(summary: LeadImportSummary) {
  return [
    `导入完成：成功 ${summary.imported} 条`,
    `跳过空白行 ${summary.skippedBlank} 条`,
    summary.duplicate ? `可能重复 ${summary.duplicate} 条` : '',
  ].filter(Boolean).join('\n')
}
