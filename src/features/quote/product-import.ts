import type { ProductRecord } from './types'

export const productImportColumns = [
  '产品分类', '货号', '产品名称/型号', '草高', '针排', '密度', 'DTEX/磅重',
  '基布与背胶', '抗老化', '出厂价格/阶梯价格', '加针价格', '图片网址', '备注',
] as const

export interface ProductImportPreviewRow {
  rowNumber: number
  product: ProductRecord
  status: 'new' | 'update' | 'error'
  errors: string[]
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null)
      return text(row[key])
  }
  return ''
}

function keyOf(itemNo: string) {
  return text(itemNo).toLocaleLowerCase()
}

export function buildProductImportPreview(rows: Record<string, unknown>[], existing: ProductRecord[]): ProductImportPreviewRow[] {
  const existingKeys = new Set(existing.map(product => keyOf(product.itemNo)).filter(Boolean))
  const fileKeys = new Set<string>()

  return rows.map((row, index) => {
    const product: ProductRecord = {
      id: `product-import-${Date.now()}-${index}`,
      category: valueOf(row, '产品分类', '产品类型', 'category'),
      shippingFrom: valueOf(row, '发货地', 'shippingFrom'),
      itemNo: valueOf(row, '货号', 'itemNo'),
      model: valueOf(row, '产品名称/型号', '产品名称', 'model'),
      height: valueOf(row, '草高', 'height'),
      needleRow: valueOf(row, '针排', 'needleRow'),
      density: valueOf(row, '密度', 'density'),
      poundWeight: valueOf(row, 'DTEX/磅重', 'DTEX', '磅重', 'dtex', 'poundWeight'),
      backing: valueOf(row, '基布与背胶', '底布', 'backing'),
      warranty: valueOf(row, '抗老化', 'warranty'),
      priceText: valueOf(row, '出厂价格/阶梯价格', '阶梯价格', '出厂价格', 'priceText'),
      needlePrice: valueOf(row, '加针价格', 'needlePrice'),
      imageDataUrl: valueOf(row, '图片网址', '默认图片', 'imageDataUrl'),
      note: valueOf(row, '备注', 'note'),
    }
    const errors: string[] = []
    const itemKey = keyOf(product.itemNo)
    if (!product.category)
      errors.push('缺少产品分类')
    if (!product.itemNo)
      errors.push('缺少货号')
    if (!product.model)
      errors.push('缺少产品名称/型号')
    if (!product.priceText)
      errors.push('缺少价格')
    if (itemKey && fileKeys.has(itemKey))
      errors.push('文件内货号重复')
    if (itemKey)
      fileKeys.add(itemKey)

    return {
      rowNumber: index + 2,
      product,
      status: errors.length ? 'error' : existingKeys.has(itemKey) ? 'update' : 'new',
      errors,
    }
  })
}

export function applyProductImport(existing: ProductRecord[], preview: ProductImportPreviewRow[]) {
  const result = existing.map(product => ({ ...product }))
  const indexByItemNo = new Map(result.map((product, index) => [keyOf(product.itemNo), index]))

  for (const row of preview.filter(item => item.status !== 'error')) {
    const itemKey = keyOf(row.product.itemNo)
    const existingIndex = indexByItemNo.get(itemKey)
    if (existingIndex === undefined) {
      indexByItemNo.set(itemKey, result.length)
      result.push({ ...row.product })
      continue
    }

    const current = result[existingIndex]
    result[existingIndex] = {
      ...current,
      ...row.product,
      id: current.id,
      imageDataUrl: row.product.imageDataUrl || current.imageDataUrl,
    }
  }
  return result
}
