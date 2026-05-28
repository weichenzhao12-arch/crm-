import { describe, expect, it } from 'vitest'
import pricingData from '~/data/pricing.json'

describe('quote default data', () => {
  it('includes quartz sand from the quote requirements', () => {
    expect(pricingData.materials).toContainEqual(expect.objectContaining({
      name: '石英砂',
      spec: '普白 20-40目',
      unit: '吨',
      unitPrice: 300,
    }))
  })
})
