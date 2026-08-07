import { describe, expect, it } from 'vitest'
import { applyProductImport, buildProductImportPreview } from '~/features/quote/product-import'
import type { ProductRecord } from '~/features/quote/types'

const existing: ProductRecord = {
  id: 'p1', category: '仿真草坪', shippingFrom: '', itemNo: 'A001', model: '旧名称',
  height: '25MM', needleRow: '', density: '', poundWeight: '', backing: '',
  priceText: '20', needlePrice: '', warranty: '', note: '', imageDataUrl: 'old.jpg',
}

describe('product bulk import', () => {
  it('previews new, update and invalid rows without changing products', () => {
    const rows = [
      { 产品分类: '仿真草坪', 货号: 'A001', '产品名称/型号': '新名称', '出厂价格/阶梯价格': 22 },
      { 产品分类: '仿真草坪', 货号: 'A002', '产品名称/型号': '新品', '出厂价格/阶梯价格': 18 },
      { 产品分类: '仿真草坪', 货号: '', '产品名称/型号': '错误行', '出厂价格/阶梯价格': 18 },
    ]
    const preview = buildProductImportPreview(rows, [existing])
    expect(preview.map(row => row.status)).toEqual(['update', 'new', 'error'])
    expect(existing.model).toBe('旧名称')
  })

  it('updates by item number, preserves ids and appends new products', () => {
    const preview = buildProductImportPreview([
      { 产品分类: '仿真草坪', 货号: 'A001', '产品名称/型号': '新名称', '出厂价格/阶梯价格': 22 },
      { 产品分类: '仿真草坪', 货号: 'A002', '产品名称/型号': '新品', '出厂价格/阶梯价格': 18 },
    ], [existing])
    const result = applyProductImport([existing], preview)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'p1', model: '新名称', imageDataUrl: 'old.jpg' })
    expect(result[1]).toMatchObject({ itemNo: 'A002', model: '新品' })
  })
})
