<route lang="json">
{
  "meta": {
    "title": "报价系统",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { applyNeedleAdditionToDensity, baggedTonQuantity, bucketQuantity, linePerSquare, lineSubtotal, packageUnitPrice, quantityByUsage, quoteTotals, resolveArea, selectUnitPrice } from '~/features/quote/pricing'
import type { ConstructionInput, MaterialRecord, QuoteLine } from '~/features/quote/types'
import { uploadCloudImage } from '~/api/cloud-storage'
import { useCrmStore } from '~/stores/crm'
import { useQuoteStore } from '~/stores/quote'

const ALL = '全部'
const CURRENCY = '¥'

const quote = useQuoteStore()
const crm = useCrmStore()
const route = useRoute()
const router = useRouter()
const { pricing, meta, charges, lines, categories } = storeToRefs(quote)

watch(pricing, () => quote.savePricing(), { deep: true })

const view = ref<'quote' | 'print' | 'settings'>('quote')
const settingsTab = ref<'products' | 'materials'>('products')
const category = ref(ALL)
const keyword = ref('')
const syncedCrmQuoteId = ref('')
const heightFilter = ref(ALL)
const densityFilter = ref(ALL)
const poundWeightFilter = ref(ALL)
const settingsKeyword = ref('')
const areaInput = ref({ mode: 'direct' as const, area: 1000, length: 50, width: 20 })
const quoteParamVisible = ref({
  height: true,
  dtex: true,
  grass: true,
  density: true,
  needleRow: true,
  backing: true,
  warranty: true,
})

const quoteParamOptions = [
  { key: 'height', label: '草高' },
  { key: 'dtex', label: 'DTEX' },
  { key: 'grass', label: '草丝' },
  { key: 'density', label: '密度' },
  { key: 'needleRow', label: '针排' },
  { key: 'backing', label: '底布' },
  { key: 'warranty', label: '抗老化' },
] as const

const linkedCustomerId = computed(() => String(route.query.customerId || ''))
const linkedCustomer = computed(() => linkedCustomerId.value ? crm.findCustomer(linkedCustomerId.value) : undefined)

watch(linkedCustomer, (customer) => {
  if (!customer)
    return
  if (!meta.value.customerName)
    meta.value.customerName = customer.name
  if (!meta.value.projectName)
    meta.value.projectName = customer.projectType || customer.scenario || ''
}, { immediate: true })

watch(view, (value) => {
  if (typeof document !== 'undefined')
    document.body.classList.toggle('quote-sheet-mode', value === 'print')
}, { immediate: true })

const construction = ref<ConstructionInput>({
  mode: 'unit',
  rubber: { enabled: false, materialId: '', quantityPerSquare: 3 },
  sand: { enabled: false, materialId: '', quantityPerSquare: 30 },
  glue: { enabled: false, materialId: '', squarePerBucket: 120 },
  shockPad: { enabled: false, materialId: '', quantity: 0 },
  seamTape: { enabled: false, materialId: '', quantity: 0 },
  whiteTurf: { enabled: false, materialId: '', quantity: 0 },
  other: { enabled: false, materialId: '', quantity: 0 },
  package: { enabled: false, kind: 'A', imageDataUrls: [] },
})

type NewMaterialTarget = 'rubber' | 'sand' | 'glue' | 'shockPad' | 'seamTape' | 'whiteTurf'

const newMaterialModal = ref({
  open: false,
  target: 'rubber' as NewMaterialTarget,
  title: '新增规格',
  name: '',
  spec: '',
  unit: '吨',
  unitPrice: 0,
})

const selectedArea = computed(() => resolveArea(areaInput.value))
const productLines = computed(() => lines.value.filter(line => line.kind === 'product'))
const manualMaterialLines = computed(() => lines.value.filter(line => line.kind === 'material'))
const heightOptions = computed(() => productFilterOptions('height'))
const densityOptions = computed(() => productFilterOptions('density'))
const poundWeightOptions = computed(() => productFilterOptions('poundWeight'))
const filteredProducts = computed(() => pricing.value.products.filter((product) => {
  const text = normalizeSearchText([product.itemNo, product.category, product.height, product.model, product.needleRow, product.density, product.poundWeight, product.backing, product.warranty, product.priceText].join(' '))
  const searchText = normalizeSearchText(keyword.value)
  return (category.value === ALL || product.category === category.value)
    && (heightFilter.value === ALL || normalizeProductFilterValue('height', product.height) === normalizeProductFilterValue('height', heightFilter.value))
    && (densityFilter.value === ALL || normalizeProductFilterValue('density', product.density) === normalizeProductFilterValue('density', densityFilter.value))
    && (poundWeightFilter.value === ALL || normalizeProductFilterValue('poundWeight', product.poundWeight) === normalizeProductFilterValue('poundWeight', poundWeightFilter.value))
    && (!keyword.value || text.includes(searchText))
}).slice(0, 120))
const filteredProductsForSettings = computed(() => pricing.value.products.filter((product) => {
  const text = normalizeSearchText([product.itemNo, product.category, product.height, product.model, product.priceText].join(' '))
  return !settingsKeyword.value || text.includes(normalizeSearchText(settingsKeyword.value))
}).slice(0, 180))
const filteredMaterialsForSettings = computed(() => pricing.value.materials.filter((material) => {
  const text = [material.name, material.spec, material.category, material.unit, material.note].join(' ').toLowerCase()
  return !settingsKeyword.value || text.includes(settingsKeyword.value.toLowerCase())
}).slice(0, 160))
const allQuoteLines = computed(() => [...lines.value, ...constructionLines.value])
const totals = computed(() => quoteTotals(allQuoteLines.value, charges.value, selectedArea.value))

const rubberOptions = computed(() => materialsByName('橡胶颗粒'))
const sandOptions = computed(() => pricing.value.materials.filter(item => item.name.includes('石英砂')))
const glueOptions = computed(() => pricing.value.materials.filter(item => item.name.includes('胶水')))
const shockPadOptions = computed(() => materialsByName('减震垫'))
const seamTapeOptions = computed(() => materialsByName('接缝布'))
const whiteTurfOptions = computed(() => materialsByName('白草坪'))
const otherMaterialOptions = computed(() => pricing.value.materials
  .filter(item => item.category !== '辅料表')
  .filter(item => !['橡胶颗粒', '石英砂', '胶水', '减震垫', '接缝布', '白草坪'].some(name => item.name.includes(name)))
  .filter(item => item.name.trim() && item.spec.trim())
  .slice()
  .sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN')
    || a.spec.localeCompare(b.spec, 'zh-CN')
  ))
const selectedOtherMaterial = computed(() => materialById(construction.value.other.materialId))

const constructionLines = computed<QuoteLine[]>(() => {
  const area = selectedArea.value
  const built: QuoteLine[] = []
  const input = construction.value

  if (input.mode === 'package' && input.package.enabled) {
    const price = input.package.unitPrice ?? packageUnitPrice(input.package.kind, area)
    if (price !== undefined) {
      built.push({
        id: 'construction-package',
        kind: 'material',
        sourceId: `package-${input.package.kind}`,
        title: `辅料${input.package.kind}`,
        spec: input.package.kind === 'A' ? '草坪专用树脂胶、连接带、运动白草' : '草坪专用双组胶水、连接带、运动白草',
        quantity: area,
        unit: '㎡',
        unitPrice: price,
        note: '包工包料模式',
      })
    }
  }

  addRubberLine(built, input.rubber, area)
  addUsageLine(built, input.sand, area, 'sand')
  addFlatLine(built, input.shockPad)

  if (input.mode === 'unit')
    addGlueLine(built, input.glue, area)

  if (input.mode === 'unit') {
    addFlatLine(built, input.seamTape)
    addFlatLine(built, input.whiteTurf)
    addFlatLine(built, input.other)
  }

  return built
})

watch(selectedArea, (area) => {
  construction.value.shockPad.quantity = area
  construction.value.other.quantity = area
}, { immediate: true })

function materialsByName(name: string) {
  return pricing.value.materials.filter(item => item.name.includes(name))
}

function selectCategory(value: string) {
  category.value = value
  heightFilter.value = ALL
  densityFilter.value = ALL
  poundWeightFilter.value = ALL
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/毫米|㎜/g, 'mm')
    .replace(/\s+/g, '')
}

function normalizeProductFilterValue(field: 'height' | 'density' | 'poundWeight', value: unknown) {
  const text = normalizeSearchText(value)
  if (field === 'height')
    return text.replace(/(\d+(?:\.\d+)?)mm$/, '$1mm')
  return text
}

function productFilterOptions(field: 'height' | 'density' | 'poundWeight') {
  const values = pricing.value.products
    .filter(product => category.value === ALL || product.category === category.value)
    .map(product => product[field])
    .filter(Boolean)
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
}

function materialById(id: string) {
  return pricing.value.materials.find(item => item.id === id)
}

function materialPrice(id: string) {
  return materialById(id)?.unitPrice ?? 0
}

function optionalNumber(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : undefined
}

function selectedPrice(current: number | undefined, materialId: string) {
  return current ?? materialPrice(materialId)
}

function selectedPackagePrice() {
  return construction.value.package.unitPrice ?? packageUnitPrice(construction.value.package.kind, selectedArea.value) ?? 0
}

function syncAccessoryPrice(target: { materialId: string, unitPrice?: number }) {
  target.unitPrice = materialPrice(target.materialId)
}

function syncGluePrice() {
  construction.value.glue.bucketPrice = materialPrice(construction.value.glue.materialId)
}

function syncPackagePrice() {
  construction.value.package.unitPrice = packageUnitPrice(construction.value.package.kind, selectedArea.value) ?? 0
}

function newSpecLabel(name: string) {
  const count = pricing.value.materials.filter(item => item.name === name && item.note === '新增规格').length + 1
  return `新规格${count}`
}

function openNewMaterialModal(target: NewMaterialTarget, name: string, unit: string) {
  newMaterialModal.value = {
    open: true,
    target,
    title: `新增${name}规格`,
    name,
    spec: newSpecLabel(name),
    unit,
    unitPrice: 0,
  }
}

function closeNewMaterialModal() {
  newMaterialModal.value.open = false
}

function saveNewMaterial() {
  const form = newMaterialModal.value
  const name = form.name.trim() || '新辅料'
  const spec = form.spec.trim() || newSpecLabel(name)
  const item: MaterialRecord = {
    id: `material-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    category: '施工材料',
    name,
    spec,
    unit: form.unit,
    unitPrice: Number(form.unitPrice) || 0,
    note: '新增规格',
  }
  pricing.value.materials.unshift(item)

  if (form.target === 'glue') {
    construction.value.glue.materialId = item.id
    construction.value.glue.bucketPrice = item.unitPrice
  }
  else {
    const target = construction.value[form.target]
    target.materialId = item.id
    target.unitPrice = item.unitPrice
  }

  closeNewMaterialModal()
}

function defaultMaterial(options: MaterialRecord[]) {
  return options[0]?.id ?? ''
}

function ensureDefaults() {
  if (!construction.value.rubber.materialId) {
    construction.value.rubber.materialId = defaultMaterial(rubberOptions.value)
    syncAccessoryPrice(construction.value.rubber)
  }
  if (!construction.value.sand.materialId) {
    construction.value.sand.materialId = defaultMaterial(sandOptions.value)
    syncAccessoryPrice(construction.value.sand)
  }
  if (!construction.value.glue.materialId) {
    construction.value.glue.materialId = defaultMaterial(glueOptions.value.filter(item => item.name.includes('单组')))
    syncGluePrice()
  }
  if (!construction.value.shockPad.materialId) {
    construction.value.shockPad.materialId = defaultMaterial(shockPadOptions.value)
    syncAccessoryPrice(construction.value.shockPad)
  }
  if (!construction.value.seamTape.materialId) {
    construction.value.seamTape.materialId = defaultMaterial(seamTapeOptions.value)
    syncAccessoryPrice(construction.value.seamTape)
  }
  if (!construction.value.whiteTurf.materialId) {
    construction.value.whiteTurf.materialId = defaultMaterial(whiteTurfOptions.value)
    syncAccessoryPrice(construction.value.whiteTurf)
  }
  if (otherMaterialOptions.value.length && !construction.value.other.materialId) {
    construction.value.other.materialId = defaultMaterial(otherMaterialOptions.value)
    syncAccessoryPrice(construction.value.other)
  }
}

onMounted(async () => {
  await quote.loadCloudPricing()
  crm.loadCloudCustomers()
  ensureDefaults()
})

function addUsageLine(target: QuoteLine[], selection: ConstructionInput['rubber'], area: number, id: string) {
  if (!selection.enabled)
    return
  const material = materialById(selection.materialId)
  if (!material)
    return
  const unitPrice = selection.unitPrice ?? material.unitPrice
  target.push({
    id: `construction-${id}`,
    kind: 'material',
    sourceId: material.id,
    title: material.name,
    spec: material.spec,
    quantity: selection.manualQuantity ?? quantityByUsage(area, selection.quantityPerSquare, material.unit || '公斤'),
    unit: material.unit || '公斤',
    unitPrice,
    note: `${selection.quantityPerSquare}kg/㎡`,
  })
}

function addRubberLine(target: QuoteLine[], selection: ConstructionInput['rubber'], area: number) {
  if (!selection.enabled)
    return
  const material = materialById(selection.materialId)
  if (!material)
    return
  const rawKg = area * selection.quantityPerSquare
  const billedKg = Math.ceil(rawKg / 25) * 25
  target.push({
    id: 'construction-rubber',
    kind: 'material',
    sourceId: material.id,
    title: material.name,
    spec: material.spec,
    quantity: selection.manualQuantity ?? baggedTonQuantity(area, selection.quantityPerSquare, 25),
    unit: '吨',
    unitPrice: selection.unitPrice ?? material.unitPrice,
    note: `${selection.quantityPerSquare}kg/㎡，25kg/袋，实际${rawKg.toFixed(1)}kg，按${billedKg}kg计`,
  })
}

function addGlueLine(target: QuoteLine[], selection: ConstructionInput['glue'], area: number) {
  if (!selection.enabled)
    return
  const material = materialById(selection.materialId)
  if (!material)
    return
  target.push({
    id: 'construction-glue',
    kind: 'material',
    sourceId: material.id,
    title: material.name,
    spec: material.spec,
    quantity: bucketQuantity(area, selection.squarePerBucket),
    unit: '桶',
    unitPrice: selection.bucketPrice ?? material.unitPrice,
    note: `${selection.squarePerBucket}㎡/桶`,
  })
}

function addFlatLine(target: QuoteLine[], selection: ConstructionInput['shockPad']) {
  if (!selection.enabled)
    return
  const material = materialById(selection.materialId)
  if (!material)
    return
  target.push({
    id: `construction-${material.id}`,
    kind: 'material',
    sourceId: material.id,
    title: material.name,
    spec: material.spec,
    quantity: selection.quantity,
    unit: material.unit || '件',
    unitPrice: selection.unitPrice ?? material.unitPrice,
    note: material.note,
  })
}

function money(value: number) {
  return CURRENCY + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function perSquare(line: QuoteLine) {
  return linePerSquare(line.quantity, line.unitPrice, selectedArea.value)
}

function amountPerSquare(amount: number) {
  return selectedArea.value > 0 ? amount / selectedArea.value : 0
}

function totalPerSquare() {
  return amountPerSquare(totals.value.grandTotal)
}

function untaxedPerSquare() {
  return amountPerSquare(totals.value.untaxedTotal)
}

function hasTax() {
  return charges.value.taxRate > 0 || totals.value.tax > 0
}

function quoteTotalRowsHtml() {
  const taxRows = hasTax()
    ? `<tr class="total-row" style="height:12pt;mso-height-rule:exactly;"><td colspan="2" class="note">含税（专票）合计单价：以最终场地规划价格为准</td><td colspan="2">${totalPerSquare().toFixed(2)}</td></tr><tr class="total-row" style="height:12pt;mso-height-rule:exactly;"><td colspan="2" class="note">合计含税含运场地金额：</td><td colspan="2">${totals.value.grandTotal.toFixed(2)}</td></tr>`
    : `<tr class="total-row" style="height:12pt;mso-height-rule:exactly;"><td colspan="2" class="note">总价：以最终场地规划价格为准</td><td colspan="2">${totals.value.untaxedTotal.toFixed(2)}</td></tr>`

  return `<tr class="total-row" style="height:12pt;mso-height-rule:exactly;"><td colspan="2" class="note">不含税合计单价：以最终场地规划价格为准</td><td colspan="2">${untaxedPerSquare().toFixed(2)}</td></tr>${taxRows}`
}

function lineImageUrls(line: QuoteLine) {
  if (line.imageDataUrl)
    return [line.imageDataUrl]
  if (line.kind === 'product')
    return [pricing.value.products.find(product => product.id === line.sourceId)?.imageDataUrl].filter(Boolean)
  if (line.kind === 'material') {
    const materialImage = pricing.value.materials.find(material => material.id === line.sourceId)?.imageDataUrl
    if (materialImage)
      return [materialImage]
  }
  if (line.sourceId === construction.value.rubber.materialId)
    return [construction.value.rubber.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.sand.materialId)
    return [construction.value.sand.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.glue.materialId)
    return [construction.value.glue.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.shockPad.materialId)
    return [construction.value.shockPad.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.seamTape.materialId)
    return [construction.value.seamTape.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.whiteTurf.materialId)
    return [construction.value.whiteTurf.imageDataUrl].filter(Boolean)
  if (line.sourceId === construction.value.other.materialId)
    return [construction.value.other.imageDataUrl].filter(Boolean)
  if (line.sourceId.startsWith('package-'))
    return construction.value.package.imageDataUrls.filter(Boolean)
  return []
}

function lineParam(line: QuoteLine) {
  return [line.spec, line.note].filter(Boolean).join('\n')
}

function formatNeedleText(value: string) {
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

function cleanQuoteSpec(value: string) {
  return value
    .split(' / ')
    .map((part) => {
      if (/^(针排|閽堟帓)/.test(part))
        return formatNeedleText(part)
      return part
    })
    .filter(Boolean)
    .join(' / ')
}

function productByLine(line: QuoteLine) {
  return line.kind === 'product'
    ? pricing.value.products.find(product => product.id === line.sourceId)
    : undefined
}

function normalizeDtex(value: string) {
  const text = String(value || '').trim()
  if (!text)
    return ''
  const match = text.match(/\d+/)
  return match ? `${match[0]}D` : text
}

function grassShape(value: string) {
  const text = String(value || '')
  const match = text.match(/\(([^)]*[A-Za-z][^)]*)\)/)
  if (match) {
    const letter = match[1].match(/[A-Za-z]/)?.[0]
    return letter ? `${letter.toUpperCase()}型` : match[1]
  }
  if (/S/i.test(text))
    return 'S型'
  if (/C/i.test(text))
    return 'C型'
  return ''
}

function withUnit(value: string, unit: string) {
  const text = String(value || '').trim()
  if (!text)
    return ''
  return text.includes(unit) ? text : `${text}${unit}`
}

function quoteDensityText(product: { density: string }, line: QuoteLine) {
  const text = applyNeedleAdditionToDensity(product.density, line.needleAddition || 0)
  if (!text)
    return ''
  return text.includes('针') && !text.includes('簇') ? text : withUnit(text, '簇')
}

function productQuoteParams(line: QuoteLine) {
  const product = productByLine(line)
  if (!product)
    return cleanQuoteSpec(line.spec)

  const rows = [
    quoteParamVisible.value.height && product.height ? `草高：${product.height}` : '',
    quoteParamVisible.value.dtex && product.poundWeight ? `DTEX：${normalizeDtex(product.poundWeight)}` : '',
    quoteParamVisible.value.grass && grassShape(product.poundWeight) ? `草丝：${grassShape(product.poundWeight)}` : '',
    quoteParamVisible.value.density && product.density ? `密度：${quoteDensityText(product, line)}` : '',
    quoteParamVisible.value.needleRow && product.needleRow ? `针排：${formatNeedleText(product.needleRow)}` : '',
    quoteParamVisible.value.backing && product.backing ? `底布：${product.backing}` : '',
    quoteParamVisible.value.warranty && product.warranty ? `抗老化：${withUnit(product.warranty, '年')}` : '',
  ].filter(Boolean)

  return rows.join('\n')
}

function quoteSheetParam(line: QuoteLine) {
  const notes = (line.note || '')
    .split(/[，,]/)
    .map(item => item.trim())
    .filter(item => item && item !== '包工包料模式' && !item.includes('袋') && !item.startsWith('实际') && !item.startsWith('按'))

  const base = line.kind === 'product' ? productQuoteParams(line) : cleanQuoteSpec(line.spec)
  return [base, ...notes].filter(Boolean).join('\n').replace(/、/g, '\n')
}

function packageLineItems(kind: 'A' | 'B') {
  return kind === 'A'
    ? [
        { title: '运动白草', param: '常规规格' },
        { title: '草坪专用树脂胶', param: '规格：15KG/桶\n单组份树脂胶' },
        { title: '连接带', param: '30CM宽幅' },
      ]
    : [
        { title: '运动白草', param: '常规规格' },
        { title: '草坪专用双组胶水', param: '规格：10KG/组\n双组份胶水' },
        { title: '连接带', param: '30CM宽幅' },
      ]
}

function quoteSheetRows() {
  const rows = allQuoteLines.value.map(line => ({
    key: line.id,
    type: line.title,
    packageItems: line.sourceId === 'package-A'
      ? packageLineItems('A').map((item, index) => ({ ...item, images: construction.value.package.imageDataUrls[index] ? [construction.value.package.imageDataUrls[index]] : [] }))
      : line.sourceId === 'package-B'
        ? packageLineItems('B').map((item, index) => ({ ...item, images: construction.value.package.imageDataUrls[index] ? [construction.value.package.imageDataUrls[index]] : [] }))
        : [],
    images: lineImageUrls(line),
    params: quoteSheetParam(line),
    price: perSquare(line),
  }))

  const chargePrice = linePerSquare(1, totals.value.freight + totals.value.labor, selectedArea.value)
  if (chargePrice > 0) {
    rows.push({
      key: 'freight-labor',
      type: charges.value.freightMode === 'combined' ? '施工+运费' : '运费+施工费',
      packageItems: [],
      images: [],
      params: charges.value.freightMode === 'combined'
        ? '铺装、填充、食宿等\n草坪运费+颗粒运费'
        : '运费、施工费',
      price: chargePrice,
    })
  }

  return rows
}

function imageCellHtml(images: string[]) {
  if (images.length === 0)
    return '&nbsp;'
  return images.map(url => `<img class="sheet-img" src="${url}" width="160">`).join('')
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function autoPrice(text: string, quantity: number) {
  return selectUnitPrice(text, quantity) ?? (Number(text) || 0)
}

function productBadge(product: { model: string }) {
  return product.model.includes('免填充') ? '免填充' : '非免填充'
}

function addProduct(id: string) {
  const product = pricing.value.products.find(item => item.id === id)
  if (product)
    quote.addProduct(product, selectedArea.value || 1)
}

function updateProductQuantity(lineId: string, event: Event) {
  quote.updateProductQuantity(lineId, Number((event.target as HTMLInputElement).value))
}

function updateProductNeedleAddition(lineId: string, event: Event) {
  quote.updateProductNeedle(lineId, { needleAddition: Number((event.target as HTMLInputElement).value) })
}

function updateProductNeedlePrice(lineId: string, event: Event) {
  quote.updateProductNeedle(lineId, { needlePrice: (event.target as HTMLInputElement).value })
}

function uploadQuoteLineImage(event: Event, line: QuoteLine) {
  uploadOne(event, (url) => {
    line.imageDataUrl = url
  })
}

function fileToDataUrl(file: File, done: (url: string) => void) {
  const reader = new FileReader()
  reader.onload = () => done(String(reader.result || ''))
  reader.readAsDataURL(file)
}

function uploadOne(event: Event, done: (url: string) => void) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  uploadCloudImage(file)
    .then(result => done(result.url))
    .catch(() => fileToDataUrl(file, done))
    .finally(() => {
      input.value = ''
    })
}

function uploadPackage(event: Event, index: number) {
  uploadOne(event, (url) => {
    construction.value.package.imageDataUrls[index] = url
  })
}

function quoteHtmlOld() {
  const rows = allQuoteLines.value.map(line => `<tr><td>${line.title}</td><td>${line.spec}</td><td>${line.quantity}${line.unit}</td><td>${money(line.unitPrice)}</td><td>${money(perSquare(line))}</td><td>${money(lineSubtotal(line.quantity, line.unitPrice))}</td></tr>`).join('')
  const imageRows = [
    construction.value.rubber.imageDataUrl,
    construction.value.sand.imageDataUrl,
    construction.value.glue.imageDataUrl,
    construction.value.shockPad.imageDataUrl,
    construction.value.seamTape.imageDataUrl,
    construction.value.whiteTurf.imageDataUrl,
    ...construction.value.package.imageDataUrls,
  ].filter(Boolean).map(url => `<img src="${url}" style="width:120px;height:90px;object-fit:cover;margin:6px;border:1px solid #ddd">`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${meta.value.title}</title><style>@page{size:A4;margin:12mm}body{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:12mm;font-family:Microsoft YaHei,Arial;font-size:12px}h1{text-align:center;font-size:28px;margin:0 0 8px}p{margin:6px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #111;padding:6px;text-align:center;word-break:break-word}th{background:#f5f5f5}.total{font-weight:bold;text-align:right}</style></head><body><h1>${meta.value.title}</h1><p>客户：${meta.value.customerName || ''}　项目：${meta.value.projectName || ''}　日期：${meta.value.quoteDate}</p><p>场地面积：${selectedArea.value}㎡</p><table><thead><tr><th>名称</th><th>规格参数</th><th>数量</th><th>单价</th><th>每平方</th><th>金额</th></tr></thead><tbody>${rows}</tbody></table><p class="total">不含税合计：${money(totals.value.untaxedTotal)}　税费：${money(totals.value.tax)}　总价：${money(totals.value.grandTotal)}</p><p>${meta.value.remark}</p><div>${imageRows}</div></body></html>`
}

function quoteHtml() {
  const rows = quoteSheetRows().map((row) => {
    if (row.packageItems.length) {
      return row.packageItems.map((item, index) => `<tr class="package-sub-row" style="height:20pt;mso-height-rule:exactly;">
        <td class="type-cell">${escapeHtml(item.title)}</td>
        <td class="image-cell">${imageCellHtml(item.images)}</td>
        <td class="param-cell">${escapeHtml(item.param).replace(/\n/g, '<br>')}</td>
        ${index === 0 ? `<td class="price-cell" rowspan="${row.packageItems.length}">${row.price.toFixed(2)}</td>` : ''}
      </tr>`).join('')
    }

    const params = escapeHtml(row.params).replace(/\n/g, '<br>')
    return `<tr class="item-row" style="height:28pt;mso-height-rule:exactly;">
      <td class="type-cell">${escapeHtml(row.type)}</td>
      <td class="image-cell">${imageCellHtml(row.images)}</td>
      <td class="param-cell">${params}</td>
      <td class="price-cell">${row.price.toFixed(2)}</td>
    </tr>`
  }).join('')

  const sheetStyles = `
    @page WordSection1{size:21cm 29.7cm;margin:.35cm .45cm .35cm .45cm;}
    body{margin:0;background:#fff;font-family:SimSun,"Microsoft YaHei",Arial,sans-serif;color:#000;}
    .sheet{
      box-sizing:border-box;
      width:20.1cm;
      margin:0 auto;
      padding:0;
      font-size:6.5pt;
      font-weight:700;
      background:#fff;
    }
    h1{text-align:center;font-size:12pt;font-weight:400;margin:0 0 1pt;line-height:1;}
    .subtitle{text-align:center;font-size:5.5pt;margin:0 0 2pt;line-height:1;}
    table{width:20.1cm;border-collapse:collapse;table-layout:fixed;font-size:6.5pt;mso-table-layout-alt:fixed;}
    th,td{border:1pt solid #000;padding:1pt 2pt;text-align:center;vertical-align:middle;word-break:break-all;line-height:1.05;}
    th{background:#fff;font-weight:700;}
    .area-row td{height:14pt;mso-height-rule:exactly;}
    .head-row th{height:14pt;mso-height-rule:exactly;}
    .item-row td{height:28pt;mso-height-rule:exactly;}
    .package-sub-row td{height:20pt;mso-height-rule:exactly;}
    .total-row td{height:12pt;mso-height-rule:exactly;}
    .sheet-img{width:2cm;max-height:1.35cm;object-fit:cover;margin:0;}
    .sheet-param{white-space:pre-line;line-height:1.05;}
    .note{line-height:1.05;}
  `

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(meta.value.title)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>${sheetStyles}</style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(meta.value.title || '足球场报价')}</h1>
    <p class="subtitle">以最终场地规划价格为准</p>
    <table width="744" cellspacing="0" cellpadding="0">
      <colgroup>
        <col width="193">
        <col width="186">
        <col width="186">
        <col width="179">
      </colgroup>
      <tbody>
        <tr class="area-row" style="height:14pt;mso-height-rule:exactly;"><td colspan="2">场地面积（平方米）：</td><td colspan="2">${selectedArea.value}</td></tr>
        <tr class="head-row" style="height:14pt;mso-height-rule:exactly;"><th>产品类型</th><th>产品图</th><th>产品参数</th><th>价格/平方</th></tr>
        ${rows}
        ${quoteTotalRowsHtml()}
      </tbody>
    </table>
  </div>
</body>
</html>`
}

function rtfEscape(value: unknown) {
  return String(value ?? '').replace(/[\\{}\n\r]|[^\x20-\x7E]/g, (char) => {
    if (char === '\\')
      return '\\\\'
    if (char === '{')
      return '\\{'
    if (char === '}')
      return '\\}'
    if (char === '\n' || char === '\r')
      return '\\line '
    const code = char.charCodeAt(0)
    return `\\u${code > 32767 ? code - 65536 : code}?`
  })
}

function dataUrlToRtfImage(url: string) {
  const match = url.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
  if (!match)
    return ''

  const type = match[1].toLowerCase().startsWith('jp') ? 'jpegblip' : 'pngblip'
  const binary = atob(match[2])
  let hex = ''
  for (let index = 0; index < binary.length; index += 1)
    hex += binary.charCodeAt(index).toString(16).padStart(2, '0')

  return `{\\pict\\${type}\\picwgoal1500\\pichgoal1000 ${hex}}`
}

function rtfImageCell(images: string[]) {
  const image = images[0]
  return image ? dataUrlToRtfImage(image) : rtfEscape('-')
}

function rtfText(value: unknown) {
  return `\\pard\\intbl\\qc\\b\\fs15 ${rtfEscape(value)}\\b0\\cell`
}

function rtfCell(content: string) {
  return `\\pard\\intbl\\qc\\b\\fs15 ${content}\\b0\\cell`
}

function rtfRow(cells: string[], height = 560, mergeFlags: string[] = []) {
  const widths = [2200, 4400, 7200, 9400]
  const defs = widths.map((width, index) => `\\clvertalc${mergeFlags[index] || ''}\\cellx${width}`).join('')
  return `{\\trowd\\trgaph0\\trrh-${height}${defs}${cells.join('')}\\row}\n`
}

function quoteRtf() {
  const rows = quoteSheetRows().map((row) => {
    if (row.packageItems.length) {
      return row.packageItems.map((item, index) => {
        const priceCell = index === 0 ? rtfText(row.price.toFixed(2)) : rtfText('')
        const merge = index === 0 ? ['', '', '', '\\clvmgf'] : ['', '', '', '\\clvmrg']
        return rtfRow([
          rtfText(item.title),
          rtfCell(rtfImageCell(item.images)),
          rtfText(item.param),
          priceCell,
        ], 520, merge)
      }).join('')
    }

    return rtfRow([
      rtfText(row.type),
      rtfCell(rtfImageCell(row.images)),
      rtfText(row.params),
      rtfText(row.price.toFixed(2)),
    ], 720)
  }).join('')

  const totalRows = hasTax()
    ? [
        ['不含税合计单价：以最终场地规划价格为准', untaxedPerSquare().toFixed(2)],
        ['含税（专票）合计单价：以最终场地规划价格为准', totalPerSquare().toFixed(2)],
        ['合计含税含运场地金额：', totals.value.grandTotal.toFixed(2)],
      ]
    : [
        ['不含税合计单价：以最终场地规划价格为准', untaxedPerSquare().toFixed(2)],
        ['总价：以最终场地规划价格为准', totals.value.untaxedTotal.toFixed(2)],
      ]

  const totalTableRows = totalRows.map(([label, value]) => rtfRow([
    rtfText(label),
    rtfText(''),
    rtfText(value),
    rtfText(''),
  ], 300, ['\\clmgf', '\\clmrg', '\\clmgf', '\\clmrg'])).join('')

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 SimSun;}{\\f1 Microsoft YaHei;}}
\\paperw11906\\paperh16838\\margl850\\margr850\\margt520\\margb520\\f0\\fs15
\\pard\\qc\\b\\fs32 ${rtfEscape(meta.value.title || '足球场报价')}\\b0\\par
\\pard\\qc\\b\\fs14 ${rtfEscape('以最终场地规划价格为准')}\\b0\\par
${rtfRow([rtfText('场地面积（平方米）：'), rtfText(''), rtfText(selectedArea.value), rtfText('')], 360, ['\\clmgf', '\\clmrg', '\\clmgf', '\\clmrg'])}
${rtfRow([rtfText('产品类型'), rtfText('产品图'), rtfText('产品参数'), rtfText('价格/平方')], 330)}
${rows}
${totalTableRows}
}`
}

function textDataUrl(content: string, mime = 'application/rtf;charset=utf-8') {
  return `data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}`
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function loadHtml2Pdf() {
  const existing = (window as any).html2pdf
  if (existing)
    return Promise.resolve(existing)

  return new Promise<any>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js'
    script.onload = () => resolve((window as any).html2pdf)
    script.onerror = () => reject(new Error('PDF 生成工具加载失败'))
    document.head.appendChild(script)
  })
}

async function quotePdfDataUrl(fileName: string) {
  const html2pdf = await loadHtml2Pdf()
  const source = document.createElement('div')
  source.style.position = 'fixed'
  source.style.left = '-10000px'
  source.style.top = '0'
  source.style.width = '210mm'
  source.style.minHeight = '297mm'
  source.style.background = '#ffffff'
  source.style.zIndex = '-1'
  const parsed = new DOMParser().parseFromString(quoteHtml(), 'text/html')
  parsed.querySelectorAll('style').forEach(style => source.appendChild(style.cloneNode(true)))
  source.appendChild(parsed.body.firstElementChild?.cloneNode(true) || parsed.body.cloneNode(true))
  document.body.appendChild(source)

  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return await html2pdf()
      .set({
        filename: fileName,
        margin: 0,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(source)
      .outputPdf('datauristring')
  }
  finally {
    source.remove()
  }
}

function syncQuoteToCustomer(status = '已导出', attachment?: { name: string, dataUrl: string }) {
  if (!linkedCustomerId.value)
    return
  syncedCrmQuoteId.value = crm.saveQuoteRecord(linkedCustomerId.value, {
    id: syncedCrmQuoteId.value || undefined,
    date: meta.value.quoteDate,
    title: meta.value.title || `${meta.value.projectName || linkedCustomer.value?.name || '客户'}报价`,
    amount: totals.value.grandTotal,
    status,
    quoteFileName: attachment?.name,
    quoteFileDataUrl: attachment?.dataUrl,
  })
}

function returnToCustomer() {
  if (!linkedCustomerId.value)
    return
  syncQuoteToCustomer('已保存报价')
  router.push(`/crm/customer/${linkedCustomerId.value}?tab=quote&quoteSaved=${Date.now()}`)
}

function exportWord() {
  const rtf = quoteRtf()
  const fileName = `${meta.value.customerName || '客户'}-报价单-${Date.now()}.rtf`
  syncQuoteToCustomer('已导出Word', {
    name: fileName,
    dataUrl: textDataUrl(rtf),
  })
  const blob = new Blob([rtf], { type: 'application/rtf;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function printPdf() {
  const fileName = `${meta.value.customerName || '客户'}-报价单-${Date.now()}.pdf`
  try {
    const dataUrl = await quotePdfDataUrl(fileName)
    syncQuoteToCustomer('已打印/PDF', {
      name: fileName,
      dataUrl,
    })
    downloadDataUrl(dataUrl, fileName)
  }
  catch {
    syncQuoteToCustomer('PDF生成失败，请重试')
    window.alert('PDF生成失败，请检查网络后再试一次。')
  }
  view.value = 'print'
}
</script>

<template>
  <main class="quote-page">
    <section class="toolbar no-print">
      <div>
        <p class="eyebrow">报价系统</p>
        <h1>{{ meta.title }}</h1>
      </div>
      <nav>
        <button :class="{ active: view === 'quote' }" @click="view = 'quote'">计算</button>
        <button :class="{ active: view === 'print' }" @click="view = 'print'">报价单</button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'">数据维护</button>
        <button v-if="linkedCustomerId" class="admin-link primary" @click="returnToCustomer">返回当前客户</button>
        <RouterLink class="admin-link" to="/">返回CRM</RouterLink>
        <RouterLink class="admin-link" to="/admin">管理后台</RouterLink>
      </nav>
    </section>

    <section v-if="view === 'quote'" class="workspace">
      <div class="left">
        <section class="overview-panel">
          <article>
            <span>场地面积</span>
            <b>{{ selectedArea }}㎡</b>
          </article>
          <article>
            <span>已选产品</span>
            <b>{{ productLines.length }}项</b>
          </article>
          <article>
            <span>不含税合计</span>
            <b>{{ money(totals.untaxedTotal) }}</b>
          </article>
          <article class="accent">
            <span>报价总价</span>
            <b>{{ money(totals.grandTotal) }}</b>
          </article>
        </section>

        <section class="band meta-band">
          <label>标题<input v-model="meta.title"></label>
          <label>客户名称<input v-model="meta.customerName"></label>
          <label>项目名称<input v-model="meta.projectName"></label>
          <label>日期<input v-model="meta.quoteDate" type="date"></label>
          <label class="wide">备注<input v-model="meta.remark"></label>
        </section>

        <section class="band">
          <header><h2>场地面积</h2></header>
          <div class="segmented">
            <button :class="{ active: areaInput.mode === 'direct' }" @click="areaInput.mode = 'direct'">直接填写</button>
            <button :class="{ active: areaInput.mode === 'size' }" @click="areaInput.mode = 'size'">长 × 宽</button>
          </div>
          <div class="fields">
            <label v-if="areaInput.mode === 'direct'">面积(㎡)<input v-model.number="areaInput.area" type="number"></label>
            <template v-else>
              <label>长(m)<input v-model.number="areaInput.length" type="number"></label>
              <label>宽(m)<input v-model.number="areaInput.width" type="number"></label>
            </template>
            <strong class="area-result">{{ selectedArea }}㎡</strong>
          </div>
        </section>

        <section class="band">
          <header><h2>草坪产品</h2><strong class="area-pill">报价面积 {{ selectedArea }}㎡</strong></header>
          <div class="chips">
            <button :class="{ active: category === ALL }" @click="selectCategory(ALL)">{{ ALL }}</button>
            <button v-for="item in categories" :key="item" :class="{ active: category === item }" @click="selectCategory(item)">{{ item }}</button>
          </div>
          <div class="product-filters">
            <label>草高<select v-model="heightFilter"><option>{{ ALL }}</option><option v-for="item in heightOptions" :key="item">{{ item }}</option></select></label>
            <label>密度<select v-model="densityFilter"><option>{{ ALL }}</option><option v-for="item in densityOptions" :key="item">{{ item }}</option></select></label>
            <label>磅重<select v-model="poundWeightFilter"><option>{{ ALL }}</option><option v-for="item in poundWeightOptions" :key="item">{{ item }}</option></select></label>
          </div>
          <input v-model="keyword" class="search" placeholder="搜索货号、名称、草高、密度、基布、价格">
          <div class="products">
            <article v-for="product in filteredProducts" :key="product.id" class="product-row">
              <div class="product-main">
                <div class="title-line">
                  <b>{{ product.itemNo }}</b>
                  <span :class="['fill-badge', productBadge(product) === '免填充' ? 'free' : 'paid']">{{ productBadge(product) }}</span>
                </div>
                <p>{{ product.category }} / {{ product.model || '常规型号' }}</p>
                <dl>
                  <div><dt>草高</dt><dd>{{ product.height || '-' }}</dd></div>
                  <div><dt>针排</dt><dd>{{ formatNeedleText(product.needleRow) || '-' }}</dd></div>
                  <div><dt>密度</dt><dd>{{ product.density || '-' }}</dd></div>
                  <div><dt>磅重</dt><dd>{{ product.poundWeight || '-' }}</dd></div>
                  <div><dt>基布背胶</dt><dd>{{ product.backing || '-' }}</dd></div>
                  <div><dt>抗老化</dt><dd>{{ product.warranty || '-' }}</dd></div>
                </dl>
              </div>
              <div class="price-cell">
                <b>{{ money(autoPrice(product.priceText, selectedArea)) }}/㎡</b>
                <small>{{ product.priceText }}</small>
                <button @click="addProduct(product.id)">加入</button>
              </div>
            </article>
          </div>
        </section>

        <section class="band">
          <header><h2>报价单参数显示</h2><strong class="area-pill">可勾选</strong></header>
          <div class="param-toggles">
            <label v-for="item in quoteParamOptions" :key="item.key" class="check-label">
              <input v-model="quoteParamVisible[item.key]" type="checkbox">
              {{ item.label }}
            </label>
          </div>
        </section>

        <section class="band">
          <header><h2>施工以及辅料</h2></header>
          <div class="segmented">
            <button :class="{ active: construction.mode === 'unit' }" @click="construction.mode = 'unit'">单价报价</button>
            <button :class="{ active: construction.mode === 'package' }" @click="construction.mode = 'package'">包工包料</button>
          </div>

          <div v-if="construction.mode === 'package'" class="option-line">
            <label class="check-label"><input v-model="construction.package.enabled" type="checkbox">辅料包</label>
            <select v-model="construction.package.kind" @change="syncPackagePrice"><option value="A">辅料A</option><option value="B">辅料B</option></select>
            <span>{{ construction.package.kind === 'A' ? '草坪专用树脂胶、连接带、运动白草' : '草坪专用双组胶水、连接带、运动白草' }}</span>
            <input class="price-input" type="number" step="0.01" :value="selectedPackagePrice()" @input="construction.package.unitPrice = optionalNumber($event)">
            <label v-for="index in 3" :key="index" class="file-chip">图{{ index }}<input type="file" accept="image/*" @change="uploadPackage($event, index - 1)"></label>
          </div>

          <div class="accessory-grid">
            <article class="accessory">
              <label class="check-label"><input v-model="construction.rubber.enabled" type="checkbox">橡胶颗粒</label>
              <select v-model="construction.rubber.materialId" @change="syncAccessoryPrice(construction.rubber)"><option v-for="item in rubberOptions" :key="item.id" :value="item.id">{{ item.spec }} {{ money(item.unitPrice) }}/{{ item.unit || '吨' }}</option></select>
              <input v-model.number="construction.rubber.quantityPerSquare" type="number" step="0.1">
              <span>kg/㎡</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.rubber.unitPrice, construction.rubber.materialId)" @input="construction.rubber.unitPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('rubber', '橡胶颗粒', '吨')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.rubber.imageDataUrl = url)"></label>
            </article>

            <article class="accessory">
              <label class="check-label"><input v-model="construction.sand.enabled" type="checkbox">石英砂</label>
              <select v-model="construction.sand.materialId" @change="syncAccessoryPrice(construction.sand)"><option v-for="item in sandOptions" :key="item.id" :value="item.id">{{ item.spec }} {{ money(item.unitPrice) }}/{{ item.unit || '吨' }}</option></select>
              <input v-model.number="construction.sand.quantityPerSquare" type="number" step="1">
              <span>kg/㎡</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.sand.unitPrice, construction.sand.materialId)" @input="construction.sand.unitPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('sand', '石英砂', '吨')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.sand.imageDataUrl = url)"></label>
            </article>

            <article v-if="construction.mode === 'unit'" class="accessory">
              <label class="check-label"><input v-model="construction.glue.enabled" type="checkbox">胶水</label>
              <select v-model="construction.glue.materialId" @change="syncGluePrice"><option v-for="item in glueOptions" :key="item.id" :value="item.id">{{ item.name }} {{ item.spec }} {{ money(item.unitPrice) }}</option></select>
              <input v-model.number="construction.glue.squarePerBucket" type="number">
              <span>㎡/桶</span>
              <input class="price-input" type="number" step="0.01" :value="construction.glue.bucketPrice ?? materialPrice(construction.glue.materialId)" @input="construction.glue.bucketPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('glue', '单组胶水', '桶')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.glue.imageDataUrl = url)"></label>
            </article>

            <article class="accessory">
              <label class="check-label"><input v-model="construction.shockPad.enabled" type="checkbox">减震垫</label>
              <select v-model="construction.shockPad.materialId" @change="syncAccessoryPrice(construction.shockPad)"><option v-for="item in shockPadOptions" :key="item.id" :value="item.id">{{ item.spec }} {{ money(item.unitPrice) }}/㎡</option></select>
              <input v-model.number="construction.shockPad.quantity" type="number" placeholder="数量">
              <span>㎡</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.shockPad.unitPrice, construction.shockPad.materialId)" @input="construction.shockPad.unitPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('shockPad', '减震垫', '平方')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.shockPad.imageDataUrl = url)"></label>
            </article>

            <article v-if="construction.mode === 'unit'" class="accessory">
              <label class="check-label"><input v-model="construction.seamTape.enabled" type="checkbox">接缝布</label>
              <select v-model="construction.seamTape.materialId" @change="syncAccessoryPrice(construction.seamTape)"><option v-for="item in seamTapeOptions" :key="item.id" :value="item.id">{{ item.spec }} {{ money(item.unitPrice) }}/米</option></select>
              <input v-model.number="construction.seamTape.quantity" type="number" placeholder="米">
              <span>米</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.seamTape.unitPrice, construction.seamTape.materialId)" @input="construction.seamTape.unitPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('seamTape', '接缝布', '米')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.seamTape.imageDataUrl = url)"></label>
            </article>

            <article v-if="construction.mode === 'unit'" class="accessory">
              <label class="check-label"><input v-model="construction.whiteTurf.enabled" type="checkbox">白草坪</label>
              <select v-model="construction.whiteTurf.materialId" @change="syncAccessoryPrice(construction.whiteTurf)"><option v-for="item in whiteTurfOptions" :key="item.id" :value="item.id">{{ item.spec }} {{ money(item.unitPrice) }}/㎡</option></select>
              <input v-model.number="construction.whiteTurf.quantity" type="number" placeholder="㎡">
              <span>㎡</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.whiteTurf.unitPrice, construction.whiteTurf.materialId)" @input="construction.whiteTurf.unitPrice = optionalNumber($event)">
              <button type="button" @click="openNewMaterialModal('whiteTurf', '白草坪', '平方')">新增规格</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.whiteTurf.imageDataUrl = url)"></label>
            </article>

            <article v-if="construction.mode === 'unit' && otherMaterialOptions.length" class="accessory">
              <label class="check-label"><input v-model="construction.other.enabled" type="checkbox">其他辅料</label>
              <select v-model="construction.other.materialId" @change="syncAccessoryPrice(construction.other)">
                <option v-for="item in otherMaterialOptions" :key="item.id" :value="item.id">{{ item.name }} {{ item.spec }} {{ money(item.unitPrice) }}/{{ item.unit || '件' }}</option>
              </select>
              <input v-model.number="construction.other.quantity" type="number" placeholder="数量">
              <span>{{ selectedOtherMaterial?.unit || '件' }}</span>
              <input class="price-input" type="number" step="0.01" :value="selectedPrice(construction.other.unitPrice, construction.other.materialId)" @input="construction.other.unitPrice = optionalNumber($event)">
              <button type="button" @click="view = 'settings'; settingsTab = 'materials'">管理辅料</button>
              <label class="file-chip">图片<input type="file" accept="image/*" @change="uploadOne($event, url => construction.other.imageDataUrl = url)"></label>
            </article>
          </div>
        </section>
      </div>

      <aside class="summary">
        <header><h2>实时价格</h2><button @click="quote.clearQuote()">清空</button></header>
        <section>
          <h3>产品明细</h3>
          <p v-if="!productLines.length" class="empty">暂无产品</p>
          <article v-for="line in productLines" :key="line.id" class="quote-line">
            <div class="quote-line-main">
              <label>产品类型<input v-model="line.title" placeholder="报价单产品类型"></label>
              <p>{{ line.spec }}</p>
              <div class="line-needle-controls">
                <label>加针数<input :value="line.needleAddition || 0" min="0" step="1" type="number" @input="updateProductNeedleAddition(line.id, $event)"></label>
                <label>每针加价<input :value="line.needlePrice || ''" placeholder="如 1元" @input="updateProductNeedlePrice(line.id, $event)"></label>
              </div>
            </div>
            <input :value="line.quantity" type="number" @input="updateProductQuantity(line.id, $event)">
            <input v-model.number="line.unitPrice" type="number" step="0.01">
            <span>{{ money(perSquare(line)) }}/㎡</span>
            <b>{{ money(lineSubtotal(line.quantity, line.unitPrice)) }}</b>
            <div class="line-actions">
              <label class="image-dot" :class="{ filled: lineImageUrls(line).length }" title="临时替换图片">
                图
                <input type="file" accept="image/*" @change="uploadQuoteLineImage($event, line)">
              </label>
              <button @click="quote.removeLine(line.id)">×</button>
            </div>
          </article>
        </section>
        <section>
          <h3>辅料明细</h3>
          <p v-if="!manualMaterialLines.length && !constructionLines.length" class="empty">暂无辅料</p>
          <article v-for="line in [...manualMaterialLines, ...constructionLines]" :key="line.id" class="quote-line readonly">
            <div><b>{{ line.title }}</b><p>{{ line.spec }}</p></div>
            <span>{{ line.quantity }}{{ line.unit }}</span>
            <span>{{ money(line.unitPrice) }}</span>
            <span>{{ money(perSquare(line)) }}/㎡</span>
            <b>{{ money(lineSubtotal(line.quantity, line.unitPrice)) }}</b>
            <span></span>
          </article>
        </section>
        <section class="charges">
          <div class="segmented slim">
            <button :class="{ active: charges.freightMode === 'combined' }" @click="charges.freightMode = 'combined'">运费+施工</button>
            <button :class="{ active: charges.freightMode === 'separate' }" @click="charges.freightMode = 'separate'">分开填写</button>
          </div>
          <label v-if="charges.freightMode === 'combined'">运费+施工费/㎡<input v-model.number="charges.combinedFee" type="number"></label>
          <template v-else>
            <label>运费/㎡<input v-model.number="charges.freightFee" type="number"></label>
            <label>施工费/㎡<input v-model.number="charges.laborFee" type="number"></label>
          </template>
          <label>税率(%)<input v-model.number="charges.taxRate" type="number" step="0.1"></label>
        </section>
        <section class="totals">
          <p><span>产品小计</span><b>{{ money(totals.productSubtotal) }}<small>{{ money(amountPerSquare(totals.productSubtotal)) }}/㎡</small></b></p>
          <p><span>辅料小计</span><b>{{ money(totals.materialSubtotal) }}<small>{{ money(amountPerSquare(totals.materialSubtotal)) }}/㎡</small></b></p>
          <p><span>运费</span><b>{{ money(totals.freight) }}<small>{{ money(amountPerSquare(totals.freight)) }}/㎡</small></b></p>
          <p><span>施工费</span><b>{{ money(totals.labor) }}<small>{{ money(amountPerSquare(totals.labor)) }}/㎡</small></b></p>
          <p><span>不含税合计</span><b>{{ money(totals.untaxedTotal) }}<small>{{ money(untaxedPerSquare()) }}/㎡</small></b></p>
          <p><span>税费</span><b>{{ money(totals.tax) }}<small>{{ money(amountPerSquare(totals.tax)) }}/㎡</small></b></p>
          <p class="grand"><span>总价</span><b>{{ money(totals.grandTotal) }}<small>{{ money(totalPerSquare()) }}/㎡</small></b></p>
        </section>
        <section class="summary-param-panel">
          <h3>报价单参数显示</h3>
          <div class="param-toggles compact">
            <label v-for="item in quoteParamOptions" :key="item.key" class="check-label">
              <input v-model="quoteParamVisible[item.key]" type="checkbox">
              {{ item.label }}
            </label>
          </div>
        </section>
        <section class="export-actions">
          <button class="primary" @click="printPdf">打印/PDF</button>
          <button class="primary" @click="exportWord">导出Word</button>
        </section>
      </aside>
    </section>

    <section v-else-if="view === 'settings'" class="settings band">
      <header>
        <h2>数据维护</h2>
        <div class="settings-actions">
          <button @click="settingsTab = 'products'">产品</button>
          <button @click="settingsTab = 'materials'">辅料</button>
          <button @click="quote.savePricing()">保存</button>
          <button @click="quote.exportPricingJson()">导出数据</button>
        </div>
      </header>
      <input v-model="settingsKeyword" class="search" placeholder="搜索">
      <template v-if="settingsTab === 'products'">
        <button class="primary" @click="quote.addProductRecord()">新增产品</button>
        <article v-for="product in filteredProductsForSettings" :key="product.id" class="edit-row product-edit">
          <input v-model="product.category" placeholder="大类">
          <input v-model="product.itemNo" placeholder="货号">
          <input v-model="product.model" placeholder="名称/型号">
          <input v-model="product.height" placeholder="草高">
          <input v-model="product.needleRow" placeholder="针排">
          <input v-model="product.density" placeholder="密度">
          <input v-model="product.poundWeight" placeholder="磅重">
          <input v-model="product.backing" placeholder="基布与背胶">
          <input v-model="product.warranty" placeholder="抗老化">
          <label class="file-chip product-image-chip" :class="{ filled: product.imageDataUrl }">产品图<input type="file" accept="image/*" @change="uploadOne($event, url => product.imageDataUrl = url)"></label>
          <textarea v-model="product.priceText" placeholder="出厂价格/阶梯价格"></textarea>
          <button @click="quote.removeProduct(product.id)">删除</button>
        </article>
      </template>
      <template v-else>
        <button class="primary" @click="quote.addMaterialRecord()">新增辅料</button>
        <article v-for="material in filteredMaterialsForSettings" :key="material.id" class="edit-row material-edit">
          <input v-model="material.category" placeholder="大类">
          <input v-model="material.name" placeholder="名称">
          <input v-model="material.spec" placeholder="规格">
          <input v-model="material.unit" placeholder="单位">
          <input v-model.number="material.unitPrice" type="number" step="0.01" placeholder="单价">
          <input v-model="material.note" placeholder="备注">
          <button @click="quote.removeMaterial(material.id)">删除</button>
        </article>
      </template>
    </section>

    <section v-else class="sheet">
      <h1>{{ meta.title }}</h1>
      <p class="subtitle">以最终场地规划价格为准</p>
      <table class="quote-sheet-table">
        <colgroup>
          <col style="width: 26%;">
          <col style="width: 25%;">
          <col style="width: 25%;">
          <col style="width: 24%;">
        </colgroup>
        <tbody>
          <tr class="area-row">
            <td colspan="2">场地面积（平方米）：</td>
            <td colspan="2">{{ selectedArea }}</td>
          </tr>
          <tr class="head-row">
            <th>产品类型</th>
            <th>产品图</th>
            <th>产品参数</th>
            <th>价格/平方</th>
          </tr>
          <template v-for="row in quoteSheetRows()" :key="row.key">
            <template v-if="row.packageItems.length">
              <tr v-for="(item, index) in row.packageItems" :key="`${row.key}-${item.title}`" class="package-sub-row">
                <td>{{ item.title }}</td>
                <td>
                  <template v-if="item.images.length">
                    <img v-for="image in item.images" :key="image" class="sheet-img" :src="image">
                  </template>
                  <template v-else>-</template>
                </td>
                <td class="sheet-param">{{ item.param }}</td>
                <td v-if="index === 0" :rowspan="row.packageItems.length">{{ row.price.toFixed(2) }}</td>
              </tr>
            </template>
            <tr v-else class="item-row">
              <td>{{ row.type }}</td>
              <td>
                <template v-if="row.images.length">
                  <img v-for="image in row.images" :key="image" class="sheet-img" :src="image">
                </template>
                <template v-else>-</template>
              </td>
              <td class="sheet-param">{{ row.params }}</td>
              <td>{{ row.price.toFixed(2) }}</td>
            </tr>
          </template>
          <tr class="total-row">
            <td colspan="2" class="note">不含税合计单价：<br>以最终场地规划价格为准</td>
            <td colspan="2">{{ untaxedPerSquare().toFixed(2) }}</td>
          </tr>
          <tr v-if="hasTax()" class="total-row">
            <td colspan="2" class="note">含税（专票）合计单价：<br>以最终场地规划价格为准</td>
            <td colspan="2">{{ totalPerSquare().toFixed(2) }}</td>
          </tr>
          <tr v-if="hasTax()" class="total-row">
            <td colspan="2" class="note">合计含税含运场地金额：</td>
            <td colspan="2">{{ totals.grandTotal.toFixed(2) }}</td>
          </tr>
          <tr v-else class="total-row">
            <td colspan="2" class="note">总价<br>以最终场地规划价格为准</td>
            <td colspan="2">{{ totals.untaxedTotal.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <aside v-if="view === 'print'" class="print-price-dock no-print">
      <span>报价总价</span>
      <b>{{ money(totals.grandTotal) }}</b>
      <small>{{ money(totalPerSquare()) }}/㎡</small>
      <button @click="view = 'quote'">返回价格</button>
      <button v-if="linkedCustomerId" class="primary" @click="returnToCustomer">返回当前客户</button>
    </aside>

    <div v-if="newMaterialModal.open" class="modal-mask no-print">
      <section class="modal-card">
        <header>
          <h2>{{ newMaterialModal.title }}</h2>
          <button type="button" @click="closeNewMaterialModal">×</button>
        </header>
        <div class="modal-fields">
          <label>产品名称<input v-model="newMaterialModal.name" placeholder="例如：EPDM颗粒"></label>
          <label>规格<input v-model="newMaterialModal.spec" placeholder="例如：绿色环保 / 密度30"></label>
          <label>单价/{{ newMaterialModal.unit }}<input v-model.number="newMaterialModal.unitPrice" type="number" step="0.01" placeholder="请输入价格"></label>
        </div>
        <footer>
          <button type="button" @click="closeNewMaterialModal">取消</button>
          <button class="primary" type="button" @click="saveNewMaterial">确认新增</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.quote-page{
  min-height:100vh;
  max-width:1680px;
  margin:0 auto;
  padding:30px;
  color:#1c1a17;
  background:#f4f1ec;
}
.toolbar,.workspace,header,.chips,.fields,.segmented,.option-line,.settings-actions{display:flex;gap:14px}
.toolbar{
  align-items:center;
  justify-content:space-between;
  margin-bottom:18px;
  padding:18px 20px;
  border:1px solid #e2ddd4;
  border-radius:6px;
  background:#fffefa;
  box-shadow:0 18px 42px rgba(48,39,29,.08);
}
.toolbar nav,.settings-actions{display:flex;flex-wrap:wrap;gap:8px}
.eyebrow{margin:0 0 5px;color:#8a8177;font-size:13px;font-weight:700}
h1,h2,h3,p{margin:0}
h1{font-size:34px;letter-spacing:0;color:#1c1a17}
h2{font-size:20px;color:#1c1a17}
h3{font-size:14px;margin-bottom:10px;color:#5f564b}
button,input,select,textarea{font:inherit}
button{
  min-height:40px;
  border:1px solid #d8d1c6;
  border-radius:6px;
  background:#fffefa;
  color:#2f2a24;
  padding:9px 15px;
  cursor:pointer;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;
}
button:hover{border-color:#b28a46;color:#8c672c;box-shadow:0 3px 10px rgba(22,127,146,.12)}
button.active{border-color:#b28a46;background:#f5ead8;color:#8c672c;font-weight:700}
.admin-link{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border:1px solid #d8d1c6;border-radius:6px;background:#fbfaf7;color:#2f2a24;padding:9px 14px;text-decoration:none;font-weight:700}
.admin-link:hover{border-color:#b28a46;color:#8c672c;box-shadow:0 3px 10px rgba(22,127,146,.12)}
.primary{background:#1f1d1a;border-color:#1f1d1a;color:#fff;font-weight:700}
.primary:hover{background:#000000;border-color:#000000;color:#fff}
.workspace{align-items:flex-start;gap:22px}
.left{flex:1;display:grid;gap:18px;min-width:0}
.overview-panel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.overview-panel article{
  min-height:98px;
  border:1px solid #e2ddd4;
  border-radius:6px;
  background:#fffefa;
  padding:20px;
  box-shadow:0 14px 34px rgba(48,39,29,.055);
}
.overview-panel span{display:block;margin-bottom:8px;color:#8a8177;font-size:13px;font-weight:700}
.overview-panel b{display:block;color:#1c1a17;font-size:26px;line-height:1.1;word-break:break-word}
.overview-panel .accent{background:#1f1d1a;border-color:#1f1d1a;color:#fff}
.overview-panel .accent span,.overview-panel .accent b{color:#fff}
.summary{
  position:sticky;
  top:18px;
  width:540px;
  max-height:calc(100vh - 36px);
  overflow:auto;
  border:1px solid #e2ddd4;
  border-radius:6px;
  background:#fffefa;
  padding:22px;
  box-shadow:0 20px 48px rgba(48,39,29,.1);
}
.print-price-dock{
  position:fixed;
  right:28px;
  bottom:24px;
  z-index:20;
  width:240px;
  display:grid;
  gap:8px;
  border:1px solid #d9e1ea;
  border-radius:8px;
  background:#fff;
  padding:16px;
  box-shadow:0 16px 42px rgba(29,45,61,.16);
}
.print-price-dock span{color:#6b7785;font-size:13px;font-weight:800}
.print-price-dock b{color:#1f5f8b;font-size:24px}
.print-price-dock small{color:#6b7785;font-weight:800}
.print-price-dock button{width:100%}
.band{
  border:1px solid #e2ddd4;
  border-radius:6px;
  background:#fffefa;
  padding:22px;
  box-shadow:0 14px 34px rgba(48,39,29,.055);
}
.band header,.summary header{align-items:center;justify-content:space-between;margin-bottom:14px}
.area-pill{border:1px solid #dfc89f;border-radius:6px;background:#f5ead8;color:#8c672c;padding:8px 11px;white-space:nowrap}
.meta-band{display:grid;grid-template-columns:1fr 1fr 1fr 180px;gap:14px}
.meta-band .wide{grid-column:1/-1}
label{display:grid;gap:7px;color:#7b7167;font-size:13px;font-weight:700}
.check-label{display:flex;align-items:center;gap:8px;min-width:108px;color:#2f2a24;font-weight:800;white-space:nowrap}
.check-label input{width:16px;height:16px;padding:0;flex:0 0 auto;accent-color:#b28a46}
input,select,textarea{
  min-width:0;
  min-height:40px;
  border:1px solid #d8d1c6;
  border-radius:6px;
  background:#fbfaf7;
  color:#1c1a17;
  padding:9px 11px;
  outline:none;
}
input:focus,select:focus,textarea:focus{border-color:#b28a46;background:#fffefa;box-shadow:0 0 0 3px rgba(22,127,146,.12)}
textarea{min-height:64px;resize:vertical}
.fields{align-items:end;flex-wrap:wrap;margin-top:12px}
.fields label{min-width:180px}
.area-result{border:1px solid #dfc89f;border-radius:6px;background:#f5ead8;color:#8c672c;padding:11px 16px;font-size:18px}
.segmented{flex-wrap:wrap;margin-bottom:14px}
.segmented button{background:#f8fafb}
.chips{flex-wrap:wrap;margin-bottom:12px}
.chips button{min-height:34px;padding:7px 12px;background:#f8fafb}
.product-filters{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin-bottom:12px}
.param-toggles{display:flex;flex-wrap:wrap;gap:12px}
.param-toggles .check-label{min-width:92px}
.param-toggles.compact{gap:8px}
.param-toggles.compact .check-label{min-width:76px;font-size:12px}
.summary-param-panel h3{margin-bottom:8px}
.search{width:100%;margin-bottom:14px;background:#fff}
.products{display:grid;gap:12px;max-height:660px;overflow:auto;padding-right:4px}
.product-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) 185px;
  gap:14px;
  border:1px solid #e5dfd6;
  border-radius:6px;
  background:#fffefa;
  padding:18px;
}
.product-row:hover{border-color:#dfc89f;background:#fff}
.title-line{display:flex;align-items:center;gap:10px;min-width:0}
.title-line b{font-size:16px;color:#1c1a17;word-break:break-word}
.fill-badge{display:inline-grid;place-items:center;min-width:58px;height:28px;border-radius:6px;color:#fff;font-size:12px;font-weight:800;padding:0 8px;flex:0 0 auto}
.fill-badge.free{background:#16875c}
.fill-badge.paid{background:#b44b31}
.product-main p{color:#8a8177;margin:7px 0 12px}
dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
dl div{border:1px solid #ebe6dd;border-radius:6px;background:#fffefa;padding:8px}
dt{color:#8a8177;font-size:12px}
dd{margin:3px 0 0;font-weight:800;color:#2f2a24}
.price-cell{display:grid;align-content:center;gap:9px;text-align:right;border-left:1px solid #e7edf1;padding-left:14px}
.price-cell b{font-size:20px;color:#8c672c}
.price-cell small{color:#8a8177;word-break:break-all;line-height:1.35}
.accessory-grid{display:grid;grid-template-columns:1fr;gap:10px}
.accessory,.option-line{
  align-items:center;
  border:1px solid #e5dfd6;
  border-radius:6px;
  background:#fffefa;
  padding:12px;
}
.option-line{flex-wrap:wrap}
.accessory{display:grid;grid-template-columns:132px minmax(240px,1fr) 92px 52px 118px 104px auto;gap:10px}
.price-input{width:118px}
.accessory button{white-space:nowrap}
.file-chip{display:inline-flex;align-items:center;justify-content:center;border:1px dashed #93a8b5;border-radius:6px;padding:8px 10px;color:#5f564b;background:#fffefa;white-space:nowrap;cursor:pointer}
.file-chip:hover{border-color:#b28a46;color:#8c672c;background:#f0fafb}
.file-chip input{display:none}
.product-image-chip.filled{border-style:solid;border-color:#1f8a70;color:#1f8a70;background:#eefaf6}
.quote-line{
  display:grid;
  grid-template-columns:minmax(0,1fr) 74px 88px 98px 104px 64px;
  gap:8px;
  align-items:center;
  border:1px solid #ebe6dd;
  border-radius:6px;
  background:#fffefa;
  padding:9px;
  margin-bottom:8px;
}
.quote-line p{color:#8a8177;font-size:12px;margin-top:3px;line-height:1.35}
.quote-line input{padding:7px;min-height:34px;background:#fff}
.quote-line-main label{font-size:12px}
.quote-line-main input{width:100%;margin-top:5px;font-weight:800}
.line-needle-controls{display:grid;grid-template-columns:90px minmax(100px,1fr);gap:8px;margin-top:8px}
.line-needle-controls label{color:#5f564b;font-weight:800}
.line-needle-controls input{min-height:32px}
.quote-line.readonly span{text-align:right;color:#5f564b}
.line-actions{display:flex;justify-content:flex-end;gap:6px}
.image-dot{display:inline-grid;place-items:center;width:30px;height:30px;border:1px dashed #93a8b5;border-radius:8px;background:#fff;color:#314352;font-size:12px;font-weight:800;cursor:pointer}
.image-dot.filled{border-style:solid;border-color:#1f8a70;color:#1f8a70;background:#eefaf6}
.image-dot input{display:none}
.empty{border:1px dashed #bdcbd4;border-radius:6px;color:#8a8177;background:#fbfaf7;padding:15px;text-align:center}
.charges{display:grid;gap:10px;margin-top:14px;border-top:1px solid #e7edf1;padding-top:14px}
.slim button{flex:1}
.totals{border-radius:6px;background:#f7f3ed;margin-top:14px;padding:18px;border:1px solid #e0e9ee}
.totals p{display:flex;justify-content:space-between;gap:12px;padding:7px 0;color:#5f564b}
.totals b{color:#1c1a17}
.grand{border-top:1px solid #cbd7df;margin-top:8px;padding-top:12px!important;color:#a72d2d;font-size:20px}
.grand b{color:#a72d2d}
.settings{max-width:1400px;margin:16px auto}
.edit-row{display:grid;gap:8px;align-items:center;border:1px solid #ebe6dd;border-radius:6px;background:#fffefa;padding:10px;margin-bottom:8px}
.product-edit{grid-template-columns:100px 145px 1fr 90px 120px 100px 100px 140px 100px 104px minmax(180px,1fr) 64px}
.material-edit{grid-template-columns:120px 140px 1fr 100px 110px minmax(160px,1fr) 64px}
.sheet{box-sizing:border-box;width:210mm;min-height:297mm;margin:18px auto;background:#fffefa;color:#000;padding:16mm 15mm 18mm;border:1px solid #111}
.sheet h1{text-align:center;font-size:26px;font-family:SimSun,serif}
.subtitle{text-align:center;margin-bottom:10px}
.sheet-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:12px;font-size:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
th,td{border:1px solid #111;padding:6px;text-align:center;word-break:break-word}
th{background:#f5f5f5}
.sheet-total{display:flex;justify-content:flex-end;gap:18px;margin-top:12px;font-size:14px}
.remark{margin-top:12px;font-size:12px}
.sheet{border:1px solid #000;font-family:SimSun,Microsoft YaHei,Arial;font-size:13px;font-weight:700}
.sheet h1{font-size:28px;font-weight:400;margin:0 0 2px}
.subtitle{font-size:12px;margin:0 0 14px}
.quote-sheet-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
.quote-sheet-table th,.quote-sheet-table td{border:1px solid #000;padding:6px;text-align:center;vertical-align:middle;word-break:break-word}
.quote-sheet-table th{background:#fff}
.area-row td{height:56px}
.head-row th{height:48px}
.item-row td{height:82px}
.package-sub-row td{height:28px}
.sheet-img{max-width:120px;max-height:86px;object-fit:cover;margin:2px}
.sheet-param{white-space:pre-line;line-height:1.4}
.total-row td{height:42px}
.note{line-height:1.35}
.toolbar,
.band,
.summary,
.overview-panel article{
  border-color:#e6dfd5;
}
.toolbar{
  position:relative;
}
.toolbar::before{
  content:"";
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  width:4px;
  background:#b28a46;
}
.toolbar nav button{
  min-width:86px;
}
.toolbar nav .primary{
  min-width:104px;
}
.overview-panel article{
  display:grid;
  align-content:center;
}
.overview-panel article:not(.accent) b{
  font-weight:800;
}
.overview-panel .accent{
  background:#1f1d1a;
}
.band header h2,
.summary header h2{
  font-weight:800;
}
.summary header{
  padding-bottom:14px;
  border-bottom:1px solid #ebe6dd;
}
.summary header button{
  color:#8c672c;
  border-color:#dfc89f;
  background:#fff8eb;
}
.product-row,
.accessory,
.option-line,
.quote-line,
.edit-row{
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7);
}
.product-row:hover,
.accessory:hover,
.quote-line:hover{
  border-color:#d9c394;
  box-shadow:0 10px 24px rgba(48,39,29,.06);
}
.price-cell button{
  background:#1f1d1a;
  border-color:#1f1d1a;
  color:#fff;
  font-weight:800;
}
.price-cell button:hover{
  background:#000;
  border-color:#000;
  color:#fff;
}
.totals{
  background:#1f1d1a;
  border-color:#1f1d1a;
}
.totals p{
  color:#d9d2c7;
}
.totals b{
  color:#fff;
}
.grand{
  border-top-color:rgba(255,255,255,.18);
  color:#f0d197;
}
.grand b{
  color:#f0d197;
}
.sheet,
.sheet *,
.quote-sheet-table th,
.quote-sheet-table td{
  background:#fff;
}
@media(max-width:1320px){
  .workspace{flex-direction:column}
  .summary{position:static;width:auto;max-height:none}
  .overview-panel{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:1000px){
  .toolbar{align-items:flex-start;flex-direction:column}
  .meta-band,.product-edit,.material-edit{grid-template-columns:1fr}
  .accessory{grid-template-columns:132px minmax(180px,1fr) 88px 52px 118px 104px auto}
  .product-row{grid-template-columns:1fr}
  .price-cell{text-align:left;border-left:0;border-top:1px solid #e7edf1;padding-left:0;padding-top:12px}
  dl{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:820px){
  .quote-page{padding:14px}
  .overview-panel,.product-filters{grid-template-columns:1fr}
  .accessory{grid-template-columns:1fr 1fr}
  .price-input{width:100%}
}
@media(max-width:620px){
  .accessory{grid-template-columns:1fr}
  .check-label{min-width:0}
  .option-line{align-items:stretch;flex-direction:column}
  .quote-line{grid-template-columns:1fr 1fr}
  .quote-line button{width:40px}
  dl{grid-template-columns:1fr}
}
@media(max-width:720px){
  .quote-page{padding:10px 10px 92px!important}
  .toolbar{position:sticky;top:0;z-index:12;margin-bottom:10px;padding:14px;border-radius:12px}
  .toolbar h1{font-size:22px;line-height:1.25}
  .toolbar nav{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .toolbar nav button,.toolbar nav .admin-link{width:100%;min-width:0;justify-content:center;min-height:42px;padding:8px 10px}
  .workspace{display:grid;grid-template-columns:1fr;gap:12px}
  .left{gap:12px}
  .band{padding:14px;border-radius:12px}
  .band header,.summary header{align-items:flex-start;flex-direction:column;gap:9px}
  .overview-panel{grid-template-columns:1fr 1fr}
  .overview-panel article{min-height:78px;padding:13px}
  .overview-panel b{font-size:20px}
  .meta-band,.product-filters{grid-template-columns:1fr}
  .fields{display:grid;grid-template-columns:1fr;gap:10px}
  .fields label{min-width:0;width:100%}
  .segmented,.chips,.param-toggles{flex-wrap:nowrap;overflow:auto;padding-bottom:3px}
  .segmented button,.chips button,.param-toggles .check-label{white-space:nowrap;flex:0 0 auto}
  .products{max-height:none;overflow:visible;padding-right:0}
  .product-row{grid-template-columns:1fr;gap:12px;padding:14px;border-radius:12px}
  .title-line{align-items:flex-start;flex-direction:column}
  .fill-badge{height:24px}
  dl{grid-template-columns:1fr 1fr}
  .price-cell{border-left:0;border-top:1px solid #e7edf1;padding:12px 0 0;text-align:left}
  .price-cell button{width:100%}
  .accessory{grid-template-columns:1fr!important;border-radius:12px}
  .accessory select,.accessory input,.accessory button,.file-chip{width:100%}
  .option-line{display:grid;grid-template-columns:1fr;gap:10px}
  .summary{position:static;width:auto;max-height:none;padding:14px;border-radius:12px}
  .quote-line{grid-template-columns:1fr;gap:9px;border-radius:12px}
  .quote-line > input,.quote-line > button{width:100%}
  .line-actions{justify-content:stretch}
  .line-actions button{width:100%}
  .line-needle-controls{grid-template-columns:1fr}
  .charges label{width:100%}
  .slim{display:grid;grid-template-columns:1fr 1fr}
  .settings{margin:10px 0}
  .edit-row,.product-edit,.material-edit{grid-template-columns:1fr!important}
  .sheet{width:100%;min-height:auto;margin:10px 0;padding:10px;border-radius:0;overflow:auto}
  .quote-sheet-table{font-size:10px}
  .quote-sheet-table th,.quote-sheet-table td{padding:3px}
  .print-price-dock{left:10px;right:10px;bottom:10px;width:auto;grid-template-columns:1fr 1fr;align-items:center;padding:12px;border-radius:12px}
  .print-price-dock span,.print-price-dock small{grid-column:1}
  .print-price-dock b{grid-column:1;font-size:20px}
  .print-price-dock button{grid-column:2;width:100%;min-height:38px}
  .modal-card{width:100%;max-height:88vh;overflow:auto}
  .modal-fields{grid-template-columns:1fr}
}
@media print{
  @page{size:A4;margin:0}
  .no-print,.toolbar,.left,.summary:not(.printable){display:none!important}
  .quote-page{padding:0;background:#fff}
  .sheet{
    width:210mm;
    min-height:297mm;
    border:0;
    margin:0 auto;
    padding:10mm 14mm 10mm;
    box-sizing:border-box;
  }
  .sheet h1{margin-top:0}
  .quote-sheet-table{width:100%}
  .sheet h1{font-size:24px}
  .subtitle{margin-bottom:8px;font-size:11px}
  .area-row td{height:42px}
  .head-row th{height:38px}
  .item-row td{height:66px}
  .package-sub-row td{height:50px}
  .total-row td{height:32px}
  .quote-sheet-table{font-size:12px}
  .quote-sheet-table th,
  .quote-sheet-table td{padding:4px}
  .sheet-img{max-width:104px;max-height:72px}
  .app-shell,.app-main{background:#fff!important}
}

@media screen{
  .quote-page{
    max-width:1680px;
    padding:22px 28px 32px;
    background:#f3f6f9;
    color:#17202a;
  }
  .toolbar,
  .band,
  .summary,
  .overview-panel article{
    border:1px solid #d9e1ea;
    background:#fff;
    box-shadow:0 8px 24px rgba(29,45,61,.05);
  }
  .toolbar{
    align-items:center;
    padding:18px 20px;
    overflow:hidden;
  }
  .toolbar::before{
    background:#1f5f8b;
  }
  .eyebrow,
  label,
  .overview-panel span,
  .product-main p,
  dt,
  .quote-line p{
    color:#6b7785;
  }
  h1,h2,h3,
  .title-line b,
  dd,
  .overview-panel b{
    color:#17202a;
  }
  h1{font-size:30px}
  h2{font-size:18px}
  h3{font-size:14px}
  button{
    min-height:38px;
    border-color:#cfd8e3;
    border-radius:4px;
    background:#fff;
    color:#344255;
  }
  button:hover{
    border-color:#1f5f8b;
    color:#1f5f8b;
    box-shadow:none;
  }
  button.active{
    border-color:#1f5f8b;
    background:#eef6fb;
    color:#1f5f8b;
  }
  .primary,
  .price-cell button{
    border-color:#1f5f8b;
    background:#1f5f8b;
    color:#fff;
    box-shadow:none;
  }
  .primary:hover,
  .price-cell button:hover{
    border-color:#174d72;
    background:#174d72;
    color:#fff;
  }
  .overview-panel .accent,
  .totals{
    border-color:#243447;
    background:#243447;
    box-shadow:none;
  }
  .overview-panel .accent span,
  .overview-panel .accent b,
  .totals p,
  .totals b,
  .grand,
  .grand b{
    color:#fff;
  }
  .grand{
    border-top-color:rgba(255,255,255,.22);
  }
  .area-pill,
  .area-result{
    border-color:#c8dceb;
    background:#eef6fb;
    color:#1f5f8b;
  }
  input,
  select,
  textarea{
    border-color:#cfd8e3;
    border-radius:4px;
    background:#fbfcfe;
    color:#17202a;
  }
  input:focus,
  select:focus,
  textarea:focus{
    border-color:#1f5f8b;
    background:#fff;
    box-shadow:0 0 0 3px rgba(31,95,139,.12);
  }
  .product-row,
  .accessory,
  .option-line,
  .quote-line,
  .edit-row,
  dl div{
    border-color:#dfe6ee;
    border-radius:4px;
    background:#fff;
  }
  .product-row:hover,
  .accessory:hover,
  .quote-line:hover{
    border-color:#9eb9cc;
    box-shadow:0 8px 18px rgba(29,45,61,.06);
  }
  .fill-badge.free{
    background:#2f7d73;
  }
  .fill-badge.paid{
    background:#1f5f8b;
  }
  .price-cell{
    border-left-color:#dfe6ee;
  }
  .price-cell b{
    color:#1f5f8b;
  }
  .summary header{
    border-bottom-color:#dfe6ee;
  }
  .summary header button{
    border-color:#cfd8e3;
    background:#fff;
    color:#344255;
  }
  .file-chip{
    border-color:#b8c6d3;
    border-radius:4px;
    background:#fff;
    color:#344255;
  }
  .file-chip:hover{
    border-color:#1f5f8b;
    background:#eef6fb;
    color:#1f5f8b;
  }
  .empty{
    border-color:#cfd8e3;
    background:#fbfcfe;
    color:#6b7785;
  }
  .overview-panel{
    gap:12px;
  }
  .overview-panel article{
    min-height:86px;
    padding:16px 18px;
  }
  .overview-panel b{
    font-size:24px;
  }
  .band,
  .summary{
    border-radius:4px;
    padding:18px;
  }
  .toolbar{
    border-radius:4px;
  }
  .product-row{
    padding:14px;
  }
  .summary{
    width:520px;
  }
  .totals{
    border-radius:4px;
  }
  .sheet,
  .sheet *,
  .quote-sheet-table th,
  .quote-sheet-table td{
    background:#fff;
    color:#000;
  }
}

@media screen{
  .quote-page{
    max-width:none;
    padding:28px;
    background:
      radial-gradient(circle at 14% 8%,rgba(51,115,220,.12),transparent 30%),
      linear-gradient(180deg,#edf3fb 0,#f6f8fb 360px,#f6f8fb 100%);
  }
  .toolbar{
    position:relative;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    align-items:start;
    max-width:1640px;
    min-height:238px;
    margin:0 auto;
    padding:38px 40px 92px;
    overflow:hidden;
    border:0;
    border-radius:18px;
    background:
      linear-gradient(135deg,rgba(68,132,255,.22),transparent 45%),
      linear-gradient(135deg,#10243f,#183f68 58%,#1f5f8b);
    color:#fff;
    box-shadow:0 22px 56px rgba(18,45,77,.22);
  }
  .toolbar::before{
    display:none;
  }
  .toolbar::after{
    content:"";
    position:absolute;
    right:-120px;
    top:-130px;
    width:360px;
    height:360px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:50%;
    box-shadow:0 0 0 44px rgba(255,255,255,.035);
  }
  .toolbar > div{
    position:relative;
    z-index:1;
  }
  .toolbar .eyebrow{
    display:inline-flex;
    margin-bottom:14px;
    padding:6px 12px;
    border:1px solid rgba(255,255,255,.22);
    border-radius:999px;
    background:rgba(255,255,255,.1);
    color:#cfe7ff;
    font-size:13px;
  }
  .toolbar h1{
    max-width:720px;
    color:#fff;
    font-size:46px;
    font-weight:800;
    line-height:1.1;
  }
  .toolbar nav{
    position:relative;
    z-index:1;
    justify-content:flex-end;
    gap:10px;
  }
  .toolbar nav button{
    min-width:92px;
    border-color:rgba(255,255,255,.3);
    background:rgba(255,255,255,.1);
    color:#fff;
    backdrop-filter:blur(10px);
  }
  .toolbar nav button.active{
    border-color:#fff;
    background:#fff;
    color:#183f68;
  }
  .toolbar nav .primary{
    border-color:#65b7ff;
    background:#2f8cff;
    color:#fff;
    box-shadow:0 12px 28px rgba(47,140,255,.28);
  }
  .workspace{
    max-width:1640px;
    margin:22px auto 0;
    gap:22px;
  }
  .overview-panel{
    position:relative;
    z-index:2;
    max-width:1640px;
    margin:-62px auto 22px;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:16px;
  }
  .overview-panel article{
    min-height:122px;
    border:1px solid rgba(205,219,235,.9);
    border-radius:16px;
    background:rgba(255,255,255,.92);
    padding:22px 24px;
    box-shadow:0 18px 42px rgba(36,58,84,.12);
    backdrop-filter:blur(12px);
  }
  .overview-panel span{
    color:#64748b;
    font-size:13px;
    letter-spacing:0;
  }
  .overview-panel b{
    color:#10243f;
    font-size:30px;
    letter-spacing:0;
  }
  .overview-panel .accent{
    border-color:#2f8cff;
    background:linear-gradient(135deg,#246ed8,#174d9c);
    box-shadow:0 20px 46px rgba(36,110,216,.24);
  }
  .left{
    gap:20px;
  }
  .band,
  .summary{
    border:1px solid #d9e3ee;
    border-radius:16px;
    background:#fff;
    box-shadow:0 12px 34px rgba(38,59,84,.075);
  }
  .band{
    position:relative;
    overflow:hidden;
    padding:26px;
    background:
      linear-gradient(180deg,#f8fbff 0,#fff 120px),
      #fff;
  }
  .band::after{
    content:"";
    position:absolute;
    inset:0;
    pointer-events:none;
    border-radius:16px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
  }
  .meta-band{
    position:relative;
    grid-template-columns:repeat(4,minmax(0,1fr));
    padding-top:70px;
    gap:16px;
  }
  .meta-band::before{
    content:"基础信息";
    position:absolute;
    top:24px;
    left:26px;
    color:#10243f;
    font-size:20px;
    font-weight:800;
  }
  .meta-band::after{
    content:"";
    position:absolute;
    top:32px;
    left:112px;
    width:38px;
    height:3px;
    border-radius:999px;
    background:#2f8cff;
  }
  .meta-band label{
    padding:14px;
    border:1px solid #e2eaf3;
    border-radius:14px;
    background:#fff;
  }
  .meta-band .wide{
    grid-column:1/-1;
  }
  .band header{
    position:relative;
    z-index:1;
    margin:-2px 0 18px;
    padding:0 0 16px 16px;
    border-bottom:1px solid #edf1f5;
  }
  .band header::before{
    content:"";
    position:absolute;
    left:0;
    top:2px;
    width:4px;
    height:24px;
    border-radius:999px;
    background:#2f8cff;
  }
  .band header h2,
  .summary header h2{
    color:#10243f;
    font-size:19px;
  }
  label{
    color:#5c6c7d;
  }
  input,
  select,
  textarea{
    min-height:42px;
    border-color:#d5dee9;
    border-radius:10px;
    background:#f8fafc;
  }
  .fields{
    padding:18px;
    border:1px solid #e2eaf3;
    border-radius:14px;
    background:#fff;
  }
  .segmented{
    padding:6px;
    border:1px solid #e2eaf3;
    border-radius:14px;
    background:#fff;
  }
  input:focus,
  select:focus,
  textarea:focus{
    border-color:#2f8cff;
    box-shadow:0 0 0 4px rgba(47,140,255,.12);
  }
  button{
    border-radius:10px;
  }
  .chips button,
  .segmented button{
    background:#f8fafc;
  }
  .chips{
    padding:12px;
    border:1px solid #e2eaf3;
    border-radius:14px;
    background:#fff;
  }
  .product-filters{
    padding:14px;
    border:1px solid #e2eaf3;
    border-radius:14px;
    background:#fff;
  }
  .search{
    height:46px;
    margin-bottom:16px;
    border-radius:14px;
    background:#fff;
  }
  .area-pill,
  .area-result{
    border-color:#c6dcf7;
    border-radius:12px;
    background:#eff6ff;
    color:#246ed8;
  }
  .product-row{
    grid-template-columns:minmax(0,1fr) 190px;
    border-color:#e1e9f2;
    border-radius:14px;
    background:linear-gradient(180deg,#fff,#fbfdff);
    padding:18px;
  }
  .product-row:hover{
    border-color:#8fc0ff;
    box-shadow:0 16px 34px rgba(47,140,255,.12);
  }
  dl div{
    border:0;
    border-radius:12px;
    background:#f6f8fb;
  }
  .fill-badge{
    border-radius:999px;
  }
  .fill-badge.free{
    background:#1f8a70;
  }
  .fill-badge.paid{
    background:#246ed8;
  }
  .price-cell{
    border-left-color:#e6edf5;
  }
  .price-cell b{
    color:#246ed8;
  }
  .price-cell button,
  .primary{
    border-color:#246ed8;
    background:#246ed8;
  }
  .accessory,
  .option-line,
  .quote-line,
  .edit-row{
    border-color:#e1e9f2;
    border-radius:14px;
    background:linear-gradient(180deg,#fff,#fbfdff);
  }
  .accessory:has(.custom-spec){
    grid-template-columns:132px minmax(180px,1fr) minmax(150px,210px) 76px 52px 104px 92px auto;
  }
  .custom-spec{
    min-width:0;
    width:100%;
  }
  .accessory-grid{
    padding:14px;
    border:1px solid #e2eaf3;
    border-radius:16px;
    background:#fff;
  }
  .accessory:hover,
  .quote-line:hover{
    border-color:#a8c9f3;
    box-shadow:0 12px 26px rgba(38,59,84,.08);
  }
  .summary{
    width:500px;
    margin-top:104px;
    top:88px;
    padding:0;
    max-height:calc(100vh - 108px);
    overflow:auto;
    border:1px solid #d4e1ef;
    background:#fff;
  }
  .summary header{
    margin:0;
    padding:14px 18px;
    border-bottom:0;
    background:linear-gradient(135deg,#10243f,#1f5f8b);
    color:#fff;
  }
  .summary header h2{
    color:#fff;
  }
  .summary header button{
    border-color:rgba(255,255,255,.32);
    border-radius:10px;
    background:rgba(255,255,255,.12);
    color:#fff;
  }
  .summary > section:not(.totals){
    margin:10px 16px 0;
    padding:10px 12px;
    border:1px solid #e2eaf3;
    border-radius:12px;
    background:#fff;
  }
  .summary .charges{
    margin:10px 16px 0;
    padding:10px 12px;
    border:1px solid #e2eaf3;
    border-radius:12px;
    background:#f8fbff;
  }
  .quote-line{
    grid-template-columns:1fr;
    gap:10px;
    padding:12px;
    background:#f8fbff;
  }
  .quote-line > div:first-child{
    min-width:0;
  }
  .quote-line > div:first-child b{
    display:block;
    color:#10243f;
    font-size:14px;
    line-height:1.35;
    word-break:break-word;
  }
  .quote-line > div:first-child p{
    margin-top:6px;
    line-height:1.45;
    word-break:normal;
    overflow-wrap:anywhere;
  }
  .quote-line input,
  .quote-line > span,
  .quote-line > b{
    min-width:0;
    width:100%;
  }
  .quote-line > span,
  .quote-line > b{
    text-align:left;
  }
  .quote-line > b{
    color:#10243f;
  }
  .quote-line .line-actions{
    position:absolute;
    top:10px;
    right:10px;
  }
  .quote-line{
    position:relative;
    padding-right:82px;
  }
  .quote-line:not(.readonly){
    grid-template-columns:1fr 82px 82px;
  }
  .quote-line:not(.readonly) > div:first-child{
    grid-column:1 / -1;
    padding-right:70px;
  }
  .quote-line:not(.readonly) > span,
  .quote-line:not(.readonly) > b{
    align-self:center;
  }
  .quote-line.readonly{
    grid-template-columns:1fr 82px 82px;
  }
  .quote-line.readonly > div:first-child{
    grid-column:1 / -1;
  }
  .quote-line.readonly span{
    text-align:left;
  }
  .totals{
    margin:12px 16px 16px;
    border:0;
    border-radius:14px;
    background:linear-gradient(135deg,#10243f,#183f68);
    padding:12px 14px;
  }
  .export-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
    margin:0 16px 16px;
    padding:0;
  }
  .export-actions .primary{
    min-height:44px;
    border-radius:12px;
    background:#2f8cff;
    border-color:#2f8cff;
    color:#fff;
    font-weight:800;
  }
  .export-actions .primary:hover{
    background:#246ed8;
    border-color:#246ed8;
  }
  .totals p{
    color:#d8e6f5;
    padding:3px 0;
    font-size:13px;
  }
  .totals b{
    display:grid;
    justify-items:end;
    gap:1px;
    font-size:13px;
  }
  .totals small{
    color:#a9c3dd;
    font-size:10px;
    font-weight:700;
  }
  .totals b,
  .grand,
  .grand b{
    color:#fff;
  }
  .grand small{
    color:#d8e6f5;
    font-size:12px;
  }
  .grand{
    border-top-color:rgba(255,255,255,.18);
    margin-top:6px;
    padding-top:8px!important;
    font-size:17px;
  }
  .file-chip{
    border-radius:10px;
  }
  .modal-mask{
    position:fixed;
    inset:0;
    z-index:50;
    display:grid;
    place-items:center;
    padding:24px;
    background:rgba(15,36,63,.42);
    backdrop-filter:blur(6px);
  }
  .modal-card{
    width:min(520px,100%);
    border:1px solid #d4e1ef;
    border-radius:18px;
    background:#fff;
    box-shadow:0 28px 70px rgba(16,36,63,.28);
    overflow:hidden;
  }
  .modal-card header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:18px 22px;
    background:linear-gradient(135deg,#10243f,#1f5f8b);
    color:#fff;
  }
  .modal-card h2{
    color:#fff;
    font-size:18px;
  }
  .modal-card header button{
    width:34px;
    min-height:34px;
    border-color:rgba(255,255,255,.3);
    background:rgba(255,255,255,.12);
    color:#fff;
    padding:0;
  }
  .modal-fields{
    display:grid;
    gap:14px;
    padding:22px;
  }
  .modal-card footer{
    display:flex;
    justify-content:flex-end;
    gap:10px;
    padding:16px 22px 22px;
  }
  @media(max-width:1320px){
    .toolbar,
    .workspace,
    .overview-panel{
      max-width:none;
    }
    .overview-panel{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
    .summary{
      margin-top:0;
    }
  }
  @media(max-width:820px){
    .quote-page{
      padding:14px;
    }
    .toolbar{
      grid-template-columns:1fr;
      min-height:auto;
      padding:26px 22px 78px;
    }
    .toolbar h1{
      font-size:34px;
    }
    .toolbar nav{
      justify-content:flex-start;
    }
    .overview-panel{
      grid-template-columns:1fr;
      margin-top:-54px;
    }
  }
}
</style>

