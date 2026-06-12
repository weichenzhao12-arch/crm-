import { defineStore } from 'pinia'
import pricingData from '~/data/pricing.json'
import type { ExtraChargeInput, MaterialRecord, ProductRecord, QuoteLine, QuoteMeta } from '~/features/quote/types'
import { priceWithNeedleAddition, quoteTotals, selectUnitPrice } from '~/features/quote/pricing'
import { getCloudState, putCloudState } from '~/api/cloud-storage'
import { useSystemStore } from '~/stores/system'

interface PricingData {
  products: ProductRecord[]
  materials: MaterialRecord[]
}

const STORAGE_KEY = 'quote-calculator-pricing'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function cloneData(data: PricingData): PricingData {
  return JSON.parse(JSON.stringify(data)) as PricingData
}

function createLineId() {
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatNeedleRow(value: string) {
  const text = String(value || '').replace(/针排|閽堟帓/g, '').trim()
  if (!text)
    return ''
  if (text.includes('/'))
    return text

  const numberValue = Number(text)
  if (!Number.isFinite(numberValue))
    return text
  if (Number.isInteger(numberValue))
    return String(numberValue)

  let bestNumerator = 0
  let bestDenominator = 1
  let bestError = Number.POSITIVE_INFINITY
  for (let denominator = 2; denominator <= 32; denominator += 1) {
    const numerator = Math.round(numberValue * denominator)
    const error = Math.abs(numberValue - numerator / denominator)
    if (error < bestError) {
      bestNumerator = numerator
      bestDenominator = denominator
      bestError = error
    }
  }

  return bestError < 0.001 ? `${bestNumerator}/${bestDenominator}` : text
}

function productSpec(product: ProductRecord) {
  return [
    product.category,
    product.height,
    product.needleRow ? `针排${product.needleRow}` : '',
    product.density,
    product.poundWeight,
    product.backing,
    product.warranty ? `抗老化${product.warranty}` : '',
    product.model,
  ].filter(Boolean).map(part => part.includes(product.needleRow) ? formatNeedleRow(part) : part).join(' / ')
}

function loadPricing(): PricingData {
  const defaults = cloneData(pricingData as PricingData)

  if (typeof localStorage === 'undefined')
    return defaults

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved)
    return defaults

  try {
    const parsed = JSON.parse(saved) as PricingData
    return {
      products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
      materials: Array.isArray(parsed.materials) ? parsed.materials : defaults.materials,
    }
  }
  catch {
    return defaults
  }
}

function defaultCharges(): ExtraChargeInput {
  return {
    freightMode: 'combined',
    combinedFee: 0,
    freightFee: 0,
    laborFee: 0,
    taxRate: 0,
  }
}

export const useQuoteStore = defineStore('quote', {
  state: () => ({
    pricing: loadPricing(),
    meta: {
      title: '足球场报价',
      customerName: '',
      projectName: '',
      quoteDate: today(),
      remark: '以最终场地规划价格为准',
    } as QuoteMeta,
    charges: defaultCharges(),
    lines: [] as QuoteLine[],
  }),
  getters: {
    categories: state => Array.from(new Set(state.pricing.products.map(product => product.category))),
    totals: state => quoteTotals(state.lines, state.charges),
    exportPayload: state => ({
      meta: state.meta,
      lines: state.lines,
    }),
  },
  actions: {
    addProduct(product: ProductRecord, quantity = 1, options: { needleAddition?: number } = {}) {
      const fallbackPrice = Number(product.priceText) || 0
      const basePrice = selectUnitPrice(product.priceText, quantity) ?? fallbackPrice
      const needleAddition = Number.isFinite(options.needleAddition) && Number(options.needleAddition) > 0 ? Math.floor(Number(options.needleAddition)) : 0
      const unitPrice = priceWithNeedleAddition(basePrice, product.needlePrice, needleAddition)
      this.lines.push({
        id: createLineId(),
        kind: 'product',
        sourceId: product.id,
        title: `${product.itemNo} ${product.model}`.trim(),
        spec: productSpec(product),
        quantity,
        unit: '㎡',
        unitPrice,
        rawPriceText: product.priceText,
        needleAddition,
        needlePrice: product.needlePrice,
        note: product.note,
      })
    },
    addManualLine(line: Omit<QuoteLine, 'id'>) {
      this.lines.push({ id: createLineId(), ...line })
    },
    addMaterial(material: MaterialRecord, quantity = 1, unitPrice = material.unitPrice, note = material.note) {
      this.lines.push({
        id: createLineId(),
        kind: 'material',
        sourceId: material.id,
        title: material.name,
        spec: material.spec,
        quantity,
        unit: material.unit || '件',
        unitPrice,
        note,
        imageDataUrl: material.imageDataUrl,
      })
    },
    updateLine(id: string, patch: Partial<Pick<QuoteLine, 'quantity' | 'unitPrice' | 'note'>>) {
      const line = this.lines.find(item => item.id === id)
      if (line)
        Object.assign(line, patch)
    },
    updateProductNeedle(id: string, patch: Partial<Pick<QuoteLine, 'needleAddition' | 'needlePrice'>>) {
      const line = this.lines.find(item => item.id === id)
      if (!line)
        return

      if (patch.needleAddition !== undefined)
        line.needleAddition = Number.isFinite(patch.needleAddition) && patch.needleAddition > 0 ? Math.floor(patch.needleAddition) : 0
      if (patch.needlePrice !== undefined)
        line.needlePrice = patch.needlePrice

      const basePrice = line.rawPriceText ? selectUnitPrice(line.rawPriceText, line.quantity) : undefined
      if (basePrice !== undefined)
        line.unitPrice = priceWithNeedleAddition(basePrice, line.needlePrice || '', line.needleAddition || 0)
    },
    updateProductQuantity(id: string, quantity: number) {
      const line = this.lines.find(item => item.id === id)
      if (!line)
        return

      const nextQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
      const nextPrice = line.rawPriceText ? selectUnitPrice(line.rawPriceText, nextQuantity) : undefined

      line.quantity = nextQuantity
      if (nextPrice !== undefined)
        line.unitPrice = priceWithNeedleAddition(nextPrice, line.needlePrice || '', line.needleAddition || 0)
    },
    removeLine(id: string) {
      this.lines = this.lines.filter(line => line.id !== id)
    },
    clearQuote() {
      this.lines = []
      this.meta.customerName = ''
      this.meta.projectName = ''
      this.meta.remark = '以最终场地规划价格为准'
      this.meta.quoteDate = today()
      this.charges = defaultCharges()
    },
    addProductRecord(category = '休闲草坪') {
      this.pricing.products.unshift({
        id: createLineId(),
        category,
        shippingFrom: '',
        itemNo: '新货号',
        height: '',
        model: '新产品',
        needleRow: '',
        density: '',
        poundWeight: '',
        backing: '',
        priceText: '0',
        needlePrice: '',
        warranty: '',
        note: '',
        imageDataUrl: '',
      })
    },
    addMaterialRecord(category = '施工材料') {
      this.pricing.materials.unshift({
        id: createLineId(),
        category,
        name: '新辅料',
        spec: '',
        unit: '件',
        unitPrice: 0,
        note: '',
      })
    },
    updateProduct(id: string, patch: Partial<ProductRecord>) {
      const product = this.pricing.products.find(item => item.id === id)
      if (product)
        Object.assign(product, patch)
    },
    updateMaterial(id: string, patch: Partial<MaterialRecord>) {
      const material = this.pricing.materials.find(item => item.id === id)
      if (material)
        Object.assign(material, patch)
    },
    removeProduct(id: string) {
      const product = this.pricing.products.find(item => item.id === id)
      if (product)
        useSystemStore().addRecycle('product', product.itemNo || product.model || '未命名产品', product)
      this.pricing.products = this.pricing.products.filter(item => item.id !== id)
    },
    removeMaterial(id: string) {
      const material = this.pricing.materials.find(item => item.id === id)
      if (material)
        useSystemStore().addRecycle('material', material.name || material.spec || '未命名辅料', material)
      this.pricing.materials = this.pricing.materials.filter(item => item.id !== id)
    },
    restoreProduct(product: ProductRecord) {
      this.pricing.products = this.pricing.products.filter(item => item.id !== product.id)
      this.pricing.products.unshift(product)
      this.savePricing()
    },
    restoreMaterial(material: MaterialRecord) {
      this.pricing.materials = this.pricing.materials.filter(item => item.id !== material.id)
      this.pricing.materials.unshift(material)
      this.savePricing()
    },
    savePricing() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pricing))
      putCloudState('pricing', this.pricing).catch(() => {})
    },
    async loadCloudPricing() {
      const pricing = await getCloudState<PricingData>('pricing').catch(() => null)
      if (pricing?.products && pricing?.materials) {
        this.pricing = pricing
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pricing))
      }
    },
    resetPricing() {
      this.pricing = cloneData(pricingData as PricingData)
      localStorage.removeItem(STORAGE_KEY)
    },
    exportPricingJson() {
      const blob = new Blob([`${JSON.stringify(this.pricing, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pricing.json'
      link.click()
      URL.revokeObjectURL(url)
    },
  },
})
