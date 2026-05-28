import type { ExtraChargeInput, PriceTier, QuoteLine, QuoteTotals } from './types'

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function parsePriceTiers(text: string): PriceTier[] {
  const normalized = text.replace(/\r/g, '\n')
  const rangePattern = /(\d+(?:\.\d+)?)\s*(?:-|~|至|到)\s*(\d+(?:\.\d+)?)[^\d\n\r]*(\d+(?:\.\d+)?)\s*(?:元|块|\/平|每平|一平|平方|㎡|平)?/g
  const tiers: PriceTier[] = []
  let match: RegExpExecArray | null

  while ((match = rangePattern.exec(normalized))) {
    tiers.push({
      min: Number(match[1]),
      max: Number(match[2]),
      price: Number(match[3]),
    })
  }

  if (tiers.length > 0)
    return tiers

  const single = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*(?:元|块|\/平|每平|一平|平方|㎡|平)?\s*$/)
  return single ? [{ min: 0, price: Number(single[1]) }] : []
}

export function selectUnitPrice(text: string, quantity: number): number | undefined {
  const tiers = parsePriceTiers(text)
  if (tiers.length === 0)
    return undefined

  const exact = tiers.find(tier => quantity >= tier.min && (tier.max === undefined || quantity <= tier.max))
  if (exact)
    return exact.price

  const sorted = [...tiers].sort((a, b) => a.min - b.min)
  const lowerMatches = sorted.filter(tier => quantity >= tier.min)
  const lower = lowerMatches[lowerMatches.length - 1]
  return lower?.price ?? sorted[0]?.price
}

export function resolveArea(input: { mode: 'direct' | 'size', area: number, length: number, width: number }) {
  const area = input.mode === 'size' ? input.length * input.width : input.area
  return roundMoney(Number.isFinite(area) && area > 0 ? area : 0)
}

export function packageUnitPrice(kind: 'A' | 'B', area: number): number | undefined {
  if (kind === 'A') {
    if (area >= 1000 && area <= 1049)
      return 4.5
    if (area >= 1050 && area <= 3049)
      return 4
    if (area >= 3050 && area <= 10000)
      return 3.5
  }

  if (kind === 'B') {
    if (area >= 1000 && area <= 1049)
      return 10
    if (area >= 1050 && area <= 3000)
      return 8
  }

  return undefined
}

export function quantityByUsage(area: number, kgPerSquare: number, unit: string) {
  const kg = area * kgPerSquare
  return unit === '吨' ? roundMoney(kg / 1000) : roundMoney(kg)
}

export function baggedTonQuantity(area: number, kgPerSquare: number, bagKg = 25) {
  const rawKg = area * kgPerSquare
  if (!rawKg || rawKg <= 0 || !bagKg)
    return 0
  const billedKg = Math.ceil(rawKg / bagKg) * bagKg
  return roundQuantity(billedKg / 1000)
}

export function bucketQuantity(area: number, squarePerBucket: number) {
  if (!area || !squarePerBucket)
    return 0
  return Math.ceil(area / squarePerBucket)
}

export function lineSubtotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice)
}

export function linePerSquare(quantity: number, unitPrice: number, area: number): number {
  if (!area || area <= 0)
    return 0
  return roundMoney(lineSubtotal(quantity, unitPrice) / area)
}

export function extraCharges(input: ExtraChargeInput, area = 1) {
  const multiplier = area > 0 ? area : 0
  const freight = (input.freightMode === 'combined' ? input.combinedFee : input.freightFee) * multiplier
  const labor = (input.freightMode === 'combined' ? 0 : input.laborFee) * multiplier
  return {
    freight: roundMoney(Math.max(0, freight || 0)),
    labor: roundMoney(Math.max(0, labor || 0)),
    taxRate: Math.max(0, input.taxRate || 0),
  }
}

export function quoteTotals(lines: QuoteLine[], charges?: ExtraChargeInput, area = 1): QuoteTotals {
  const base = lines.reduce<QuoteTotals>((totals, line) => {
    const subtotal = lineSubtotal(line.quantity, line.unitPrice)

    if (line.kind === 'product')
      totals.productSubtotal = roundMoney(totals.productSubtotal + subtotal)
    else
      totals.materialSubtotal = roundMoney(totals.materialSubtotal + subtotal)

    totals.untaxedTotal = roundMoney(totals.productSubtotal + totals.materialSubtotal + totals.freight + totals.labor)
    totals.grandTotal = totals.untaxedTotal
    return totals
  }, {
    productSubtotal: 0,
    materialSubtotal: 0,
    freight: 0,
    labor: 0,
    untaxedTotal: 0,
    tax: 0,
    grandTotal: 0,
  })

  if (!charges)
    return base

  const extra = extraCharges(charges, area)
  const untaxedTotal = roundMoney(base.productSubtotal + base.materialSubtotal + extra.freight + extra.labor)
  const tax = roundMoney(untaxedTotal * extra.taxRate / 100)

  return {
    ...base,
    freight: extra.freight,
    labor: extra.labor,
    untaxedTotal,
    tax,
    grandTotal: roundMoney(untaxedTotal + tax),
  }
}
