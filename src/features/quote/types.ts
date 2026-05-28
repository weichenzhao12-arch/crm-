export interface ProductRecord {
  id: string
  category: string
  shippingFrom: string
  itemNo: string
  height: string
  model: string
  needleRow: string
  density: string
  poundWeight: string
  backing: string
  priceText: string
  needlePrice: string
  warranty: string
  note: string
  imageDataUrl?: string
}

export interface MaterialRecord {
  id: string
  category: string
  name: string
  spec: string
  unit: string
  unitPrice: number
  note: string
  imageDataUrl?: string
}

export interface PriceTier {
  min: number
  max?: number
  price: number
}

export type QuoteLineKind = 'product' | 'material'

export interface QuoteLine {
  id: string
  kind: QuoteLineKind
  sourceId: string
  title: string
  spec: string
  quantity: number
  unit: string
  unitPrice: number
  rawPriceText?: string
  note?: string
  imageDataUrl?: string
}

export interface QuoteTotals {
  productSubtotal: number
  materialSubtotal: number
  freight: number
  labor: number
  untaxedTotal: number
  tax: number
  grandTotal: number
}

export interface QuoteMeta {
  title: string
  customerName: string
  projectName: string
  quoteDate: string
  remark: string
}

export type AreaMode = 'direct' | 'size'
export type MaterialQuoteMode = 'unit' | 'package'
export type FreightMode = 'combined' | 'separate'

export interface AreaInput {
  mode: AreaMode
  area: number
  length: number
  width: number
}

export interface ExtraChargeInput {
  freightMode: FreightMode
  combinedFee: number
  freightFee: number
  laborFee: number
  taxRate: number
}

export interface MaterialSelection {
  enabled: boolean
  materialId: string
  quantityPerSquare: number
  manualQuantity?: number
  unitPrice?: number
  imageDataUrl?: string
}

export interface GlueSelection {
  enabled: boolean
  materialId: string
  squarePerBucket: number
  bucketPrice?: number
  imageDataUrl?: string
}

export interface FlatSelection {
  enabled: boolean
  materialId: string
  quantity: number
  unitPrice?: number
  imageDataUrl?: string
}

export interface PackageSelection {
  enabled: boolean
  kind: 'A' | 'B'
  unitPrice?: number
  imageDataUrls: string[]
}

export interface ConstructionInput {
  mode: MaterialQuoteMode
  rubber: MaterialSelection
  sand: MaterialSelection
  glue: GlueSelection
  shockPad: FlatSelection
  seamTape: FlatSelection
  whiteTurf: FlatSelection
  other: FlatSelection
  package: PackageSelection
}

export interface QuoteExportPayload {
  meta: QuoteMeta
  lines: QuoteLine[]
}
