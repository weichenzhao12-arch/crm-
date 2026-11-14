export interface AreaPriceTier {
  fromSquareMetres: number
  floorCents: number
}

export interface B2BPriceVersion {
  id: string
  productId: string
  terms: string
  tiers: readonly AreaPriceTier[]
}

export function snapshotB2BPrice(version: B2BPriceVersion, area: number, saleCents: number) {
  if (!version.id || !version.productId || !version.terms.trim()
    || !Number.isFinite(area) || area <= 0 || !Number.isSafeInteger(saleCents)
    || !version.tiers.length || version.tiers.length > 3)
    throw new Error('Invalid B2B price inputs')

  let previous = -1
  let match: AreaPriceTier | undefined
  for (const tier of version.tiers) {
    if (!Number.isFinite(tier.fromSquareMetres) || tier.fromSquareMetres < 0
      || tier.fromSquareMetres <= previous || !Number.isSafeInteger(tier.floorCents) || tier.floorCents <= 0)
      throw new Error('Invalid B2B price tiers')
    previous = tier.fromSquareMetres
    if (area >= previous)
      match = tier
  }
  if (!match || saleCents < match.floorCents)
    throw new Error('No applicable tier or sale price below floor')

  return {
    versionId: version.id,
    productId: version.productId,
    terms: version.terms,
    area,
    floorCents: match.floorCents,
    saleCents,
  }
}
