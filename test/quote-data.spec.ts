import { describe, expect, it } from 'vitest'
import pricingData from '~/data/pricing.json'
import { repairPricing } from '~/stores/quote'
import type { MaterialRecord, ProductRecord } from '~/features/quote/types'

describe('quote default data', () => {
  it('preserves intentionally cleared product and material lists', () => {
    const fallback = pricingData as { products: ProductRecord[], materials: MaterialRecord[] }
    expect(repairPricing({ products: [], materials: [] }, fallback)).toEqual({ products: [], materials: [] })
    expect(repairPricing({ products: [] }, fallback)).toEqual({ products: [], materials: fallback.materials })
  })
  it('includes quartz sand from the quote requirements', () => {
    expect(pricingData.materials).toContainEqual(expect.objectContaining({
      name: '石英砂',
      spec: '普白 20-40目',
      unit: '吨',
      unitPrice: 300,
    }))
  })
})
