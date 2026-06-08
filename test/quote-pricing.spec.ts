import { describe, expect, it } from 'vitest'
import { applyNeedleAdditionToDensity, baggedTonQuantity, bucketQuantity, linePerSquare, lineSubtotal, packageUnitPrice, parseNeedlePrice, parsePriceTiers, priceWithNeedleAddition, quantityByUsage, quoteTotals, resolveArea, selectUnitPrice } from '~/features/quote/pricing'

describe('quote pricing helpers', () => {
  it('parses tiered price text from the company price sheet', () => {
    const tiers = parsePriceTiers('50-1000平16元一平\n1050-10000平15.8元一平')

    expect(tiers).toEqual([
      { min: 50, max: 1000, price: 16 },
      { min: 1050, max: 10000, price: 15.8 },
    ])
  })

  it('selects the matching unit price by quantity', () => {
    const priceText = '50-1000平16元一平\n1050-10000平15.8元一平'

    expect(selectUnitPrice(priceText, 1200)).toBe(15.8)
  })

  it('calculates area and construction usage defaults', () => {
    expect(resolveArea({ mode: 'size', area: 0, length: 50, width: 20 })).toBe(1000)
    expect(quantityByUsage(1000, 3, '吨')).toBe(3)
    expect(bucketQuantity(1000, 120)).toBe(9)
  })

  it('rounds rubber granule usage up to full 25kg bags before converting to tons', () => {
    expect(baggedTonQuantity(20 / 3, 3)).toBe(0.025)
    expect(baggedTonQuantity(110 / 3, 3)).toBe(0.125)
  })

  it('chooses package prices by area', () => {
    expect(packageUnitPrice('A', 1000)).toBe(4.5)
    expect(packageUnitPrice('A', 3200)).toBe(3.5)
    expect(packageUnitPrice('B', 2000)).toBe(8)
    expect(packageUnitPrice('B', 3200)).toBeUndefined()
  })

  it('calculates line, freight, tax, and quote totals', () => {
    expect(lineSubtotal(12.5, 20)).toBe(250)
    expect(linePerSquare(12.5, 20, 100)).toBe(2.5)

    expect(quoteTotals([
      {
        id: 'line-1',
        kind: 'product',
        sourceId: 'product-1',
        title: 'YBXXC3015400/0003',
        spec: '30MM 混织',
        quantity: 100,
        unit: '㎡',
        unitPrice: 20.5,
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
    ], {
      freightMode: 'separate',
      combinedFee: 0,
      freightFee: 100,
      laborFee: 200,
      taxRate: 3,
    })).toEqual({
      productSubtotal: 2050,
      materialSubtotal: 450,
      freight: 100,
      labor: 200,
      untaxedTotal: 2800,
      tax: 84,
      grandTotal: 2884,
    })
  })

  it('calculates freight and labor by field area when area is provided', () => {
    expect(quoteTotals([], {
      freightMode: 'separate',
      combinedFee: 0,
      freightFee: 2,
      laborFee: 3,
      taxRate: 0,
    }, 100)).toEqual({
      productSubtotal: 0,
      materialSubtotal: 0,
      freight: 200,
      labor: 300,
      untaxedTotal: 500,
      tax: 0,
      grandTotal: 500,
    })
  })

  it('adds selected needles to the final displayed density and unit price', () => {
    expect(parseNeedlePrice('1元')).toBe(1)
    expect(priceWithNeedleAddition(19, '1元', 3)).toBe(22)
    expect(applyNeedleAdditionToDensity('15针', 3)).toBe('18针')
    expect(applyNeedleAdditionToDensity('15750簇（15针）', 3)).toBe('15750簇（18针）')
  })
})
