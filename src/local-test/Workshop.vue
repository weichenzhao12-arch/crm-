<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { getSharedSamples, postSharedSample } from './shared-samples'
import type { SharedSamples } from './shared-samples'
import SampleLedger from './SampleLedger.vue'
import SampleStockTable from './SampleStockTable.vue'
import SamplePicker from './SamplePicker.vue'
import SamplePrint from './SamplePrint.vue'
import SampleOrderPreview from './SampleOrderPreview.vue'
import { matchesSpecifications, sampleFilterOptions } from './sample-specifications'
import type { SpecificationFilters } from './sample-specifications'
import { balances, filterSamples, post, sampleCategories, shipmentStatus } from './inventory'
import { readSampleData, writeSampleData } from './sample-storage'
import type { Movement, MovementKind, Sample, SampleCategory } from './inventory'

const props = withDefaults(defineProps<{
  embedded?: boolean
  shared?: boolean
  operatorName?: string
  canIssue?: boolean
  canMaintain?: boolean
  customerId?: string
  customerName?: string
  customerOptions?: { id: string, name: string }[]
  showDocuments?: boolean
  documentId?: string
}>(), { canIssue: true, canMaintain: true })

const data = ref(props.shared ? { samples: [] as Sample[], entries: [] as Movement[] } : readSampleData())
const shared = ref<SharedSamples>()
const busy = ref(false)
const view = ref(props.showDocuments ? 'ledger' : props.customerName && props.canIssue ? 'documents' : 'samples')
const orderModal = ref(false)
const orderDialog = ref<HTMLDialogElement>()
const orderId = ref('')
const tabs = computed<[string, string][]>(() => [['samples', '样品库存'], ...(props.canMaintain ? [['management', '样品管理'] as [string, string]] : []), ['documents', '开单台'], ['ledger', '单据查询']])
const message = ref('')
const blankSample = () => ({ category: '其他' as SampleCategory, product: '', spec: '', location: '', minimum: 5, height: '', needleCount: '', needleRow: '', backing: '', poundWeight: '', density: '' })
const sample = ref(blankSample())
const initialQuantity = ref<number>()
const adjustmentRow = ref<Sample>()
const adjustmentKind = ref<'receipt' | 'adjustDown'>('receipt')
const receiptQuantity = ref<number>()
const adjustmentReason = ref('')
const adjustmentDialog = ref<HTMLDialogElement>()
const newSampleDialog = ref<HTMLDialogElement>()
type DocumentKind = 'receipt' | 'issue' | 'return' | 'reverse'
const kind = ref<DocumentKind>(props.canIssue && (props.customerName || !props.canMaintain) ? 'issue' : 'receipt')
const customer = ref(props.customerName || '')
const customerChoices = computed(() => {
  const rows = props.customerOptions ?? []
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1)
  return rows.map(row => ({ ...row, label: counts.get(row.name) === 1 ? row.name : `${row.name}（${row.id}）` }))
})
const reason = ref('')
const quantities = ref<Record<string, number>>({})
const source = ref('')
const selected = computed(() => data.value.entries.find(item => item.id === source.value))
const labels: Record<MovementKind, string> = { receipt: '入库', reserve: '备样', issue: '寄样出库', release: '取消备样', pickup: '确认领样', return: '实物退回', reverse: '冲销入库', adjustDown: '库存调减', cancel: '撤销出库', dispatch: '登记寄出' }
const allowed = (action: MovementKind) => ['receipt', 'return', 'reverse', 'adjustDown'].includes(action) ? props.canMaintain : props.canIssue
const documentKinds: DocumentKind[] = ['issue', 'receipt', 'return', 'reverse']
const actionOptions = computed(() => documentKinds.filter(allowed))
const originalOptions = computed(() => data.value.entries.filter(entry =>
  (!props.customerId || entry.customerId === props.customerId)
  && (kind.value === 'reverse' ? entry.kind === 'receipt' : entry.kind === 'pickup' || (entry.kind === 'issue'
    && shipmentStatus(data.value.entries, entry.id) !== 'cancelled'
    && (!entry.requiresDispatch || shipmentStatus(data.value.entries, entry.id) === 'sent')))))
const stockRows = computed(() => props.shared
  ? (shared.value?.samples ?? []).map(row => ({ ...row, quantity: row.stock }))
  : data.value.samples.map(row => ({ ...row, quantity: balances(data.value.entries, row.id).stock })))
const blankFilters = () => ({ category: '', stock: '', keyword: '' })
const filters = ref(blankFilters())
const specifications = ref<SpecificationFilters>({})
const filterOptions = sampleFilterOptions(() => stockRows.value)
const filteredRows = computed(() => filterSamples(stockRows.value, filters.value).filter(row => matchesSpecifications(row, specifications.value)))
const documentRows = computed(() => ['return', 'reverse'].includes(kind.value)
  ? selected.value?.lines.map(line => line.sample) ?? [] : stockRows.value)
const printed = ref<Movement>()
const preview = ref<Movement>()
const picked = ref<string[]>([])
const pickerOpen = ref(false)
const draftRows = computed(() => stockRows.value.filter(row => picked.value.includes(row.id)))
const selectingSamples = computed(() => kind.value === 'issue' || kind.value === 'receipt')
const shipmentDialog = ref<HTMLDialogElement>()
const shipmentEntry = ref<Movement>()
const shipmentAction = ref<'cancel' | 'dispatch'>('dispatch')
const shipmentValue = ref('')
const internalPrint = ref(false)
function save(next: typeof data.value) {
  writeSampleData(next)
  data.value = next
}

async function refreshShared() {
  shared.value = await getSharedSamples()
  data.value = shared.value
}

onMounted(() => { if (props.shared) void run(refreshShared) })

async function commitShared(sample?: Sample, entry?: Movement) {
  if (!shared.value) throw new Error('共享库存尚未加载')
  try {
    await postSharedSample(shared.value.revision, sample, entry)
  }
  catch (error) {
    await refreshShared().catch(() => {})
    throw error
  }
  await refreshShared()
}

async function run(action: () => void | Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}

function addSample() {
  run(async () => {
    if (!props.canMaintain)
      throw new Error('没有库存维护权限')
    const { product, spec, location, minimum } = sample.value
    if (![product, spec, location].every(value => value.trim()) || !Number.isSafeInteger(minimum) || minimum < 0)
      throw new Error('请填写型号、规格、库位和有效补样线')
    if (data.value.samples.some(row => row.product === product.trim() && row.spec === spec.trim() && row.location === location.trim()))
      throw new Error('该规格和库位已存在')
    const row = { ...sample.value, id: crypto.randomUUID(), product: product.trim(), spec: spec.trim(), location: location.trim(), minimum }
    const inDraft = view.value === 'documents' && kind.value === 'receipt'
    const entry = inDraft ? undefined : receiptEntry(row, initialQuantity.value)
    if (props.shared) await commitShared(row, entry)
    else save({ samples: [...data.value.samples, row], entries: entry ? post(data.value.entries, entry) : data.value.entries })
    if (inDraft) pick(row.id, true)
    sample.value = blankSample()
    initialQuantity.value = undefined
    newSampleDialog.value?.close()
    message.value = inDraft ? '样品已建档并加入本单' : '样品已新增并入库'
  })
}

function receiptEntry(row: Sample, quantity?: number): Movement {
  if (!props.canMaintain || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error('请输入至少 1 份的整数入库数量')
  return {
    id: crypto.randomUUID(), kind: 'receipt', customer: '', reason: '样品入库',
    time: new Date().toLocaleString('zh-CN'), lines: [{ sample: row, quantity }],
  }
}

function openAdjustment(row: Sample, action: 'receipt' | 'adjustDown') {
  adjustmentRow.value = row
  adjustmentKind.value = action
  receiptQuantity.value = undefined
  adjustmentReason.value = ''
  message.value = ''
  adjustmentDialog.value?.showModal()
}

function adjustStock() {
  run(async () => {
    const row = data.value.samples.find(item => item.id === adjustmentRow.value?.id)
    if (!row) throw new Error('请选择已有样品')
    const quantity = receiptQuantity.value
    if (!props.canMaintain || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1)
      throw new Error('请输入有效数量')
    const entry: Movement = adjustmentKind.value === 'receipt' ? receiptEntry(row, quantity) : {
      id: crypto.randomUUID(), kind: 'adjustDown', customer: '', reason: adjustmentReason.value,
      time: new Date().toLocaleString('zh-CN'), lines: [{ sample: row, quantity }],
    }
    await writeEntry(entry)
    adjustmentDialog.value?.close()
    message.value = adjustmentKind.value === 'receipt' ? '库存已增加' : '库存已调减'
  })
}

function buildEntry(): Movement {
    if (!allowed(kind.value))
      throw new Error('没有该记账权限')
    const original = selected.value
    const linked = ['return', 'reverse'].includes(kind.value)
    const rows = linked ? original?.lines.map(line => line.sample) ?? [] : data.value.samples
    const lines = rows.filter(row => selectingSamples.value ? picked.value.includes(row.id) : quantities.value[row.id])
      .map(row => ({ sample: row, quantity: quantities.value[row.id] ?? 0 }))
    const chosen = props.customerId ? undefined : customerChoices.value.find(row => row.label === customer.value.trim())
    return {
      id: orderModal.value ? orderId.value : crypto.randomUUID(), kind: kind.value, customer: linked ? original?.customer ?? '' : kind.value === 'issue' ? (chosen?.name ?? customer.value.trim()) : '',
      reason: reason.value.trim() || (kind.value === 'issue' ? '样品出库' : kind.value === 'receipt' ? '样品入库' : ''), original: linked ? original?.id : undefined, time: new Date().toLocaleString('zh-CN'), lines,
      customerId: linked ? original?.customerId : kind.value === 'issue' ? (props.customerId ?? chosen?.id) : undefined,
      requiresDispatch: kind.value === 'issue',
      openedBy: props.operatorName?.trim() || undefined,
    }
}

function record() {
  run(async () => {
    const entry = buildEntry()
    if (orderModal.value) {
      await writeEntry(entry)
      closeOrder()
      message.value = '出库成功，库存已扣减'
      return
    }
    if (selectingSamples.value) {
      if (!props.shared) post(data.value.entries, entry)
      preview.value = entry
      return
    }
    await complete(entry)
  })
}

async function openOrder() {
  startDocument('issue', undefined, '', true)
  orderId.value = crypto.randomUUID()
  orderModal.value = true
  pickerOpen.value = true
  await nextTick()
  orderDialog.value?.showModal?.()
}

function closeOrder() {
  orderDialog.value?.close?.()
  orderModal.value = false
  message.value = ''
}

function printOrderDraft(event: MouseEvent) {
  const form = (event.currentTarget as HTMLButtonElement).form
  if (!form?.reportValidity()) return
  run(() => {
    const entry = buildEntry()
    if (!props.shared) post(readSampleData(data.value).entries, entry)
    print(entry, true, true)
  })
}

async function writeEntry(entry: Movement) {
  if (!allowed(entry.kind))
    throw new Error('没有该记账权限')
  if (props.shared) return commitShared(undefined, entry)
  const current = readSampleData(data.value)
  save({ ...current, entries: post(current.entries, entry) })
}

async function complete(entry: Movement) {
  await writeEntry(entry)
  quantities.value = {}
  picked.value = []
  pickerOpen.value = false
  preview.value = undefined
  reason.value = ''
  source.value = ''
  message.value = '已记账'
  view.value = 'ledger'
  if (entry.kind === 'issue' || entry.kind === 'receipt') print(entry, true)
}

function openShipment(entry: Movement, action: 'cancel' | 'dispatch') {
  shipmentEntry.value = entry
  shipmentAction.value = action
  shipmentValue.value = ''
  message.value = ''
  shipmentDialog.value?.showModal()
}

function updateShipment() {
  run(async () => {
    if (!shipmentEntry.value) return
    const action = shipmentAction.value
    await writeEntry({ id: crypto.randomUUID(), kind: action, customer: '', original: shipmentEntry.value.id,
      reason: action === 'cancel' ? shipmentValue.value : '实际寄出',
      tracking: action === 'dispatch' ? shipmentValue.value.trim() : undefined,
      time: new Date().toLocaleString('zh-CN'), lines: [] })
    shipmentDialog.value?.close()
    message.value = action === 'cancel' ? '已撤销，库存已恢复' : '已登记寄出'
  })
}

function startDocument(action: DocumentKind, sampleId?: string, originalId = '', modal = false) {
  kind.value = action
  source.value = originalId
  picked.value = []
  quantities.value = {}
  reason.value = ''
  preview.value = undefined
  pickerOpen.value = false
  message.value = ''
  if (sampleId) pick(sampleId, true)
  if (!modal) view.value = 'documents'
}

function pick(id: string, checked: boolean) {
  picked.value = checked ? [...picked.value, id] : picked.value.filter(item => item !== id)
  if (checked) quantities.value[id] = 1
  else delete quantities.value[id]
}

const draftPrint = ref(false)
function print(entry: Movement, internal = false, draft = false) {
  printed.value = entry
  internalPrint.value = internal
  draftPrint.value = draft
  requestAnimationFrame(() => window.print())
}
</script>

<template>
  <header v-if="!embedded"><strong>报价系统</strong><span>本地测试 · 虚构数据</span></header>
  <main class="sample-workspace">
    <nav aria-label="样品模块">
      <button v-for="[id, label] in tabs" :key="id" :aria-pressed="view === id" @click="view = id; message = ''">{{ label }}</button>
    </nav>
    <p v-if="message" role="status">{{ message }}</p>
    <button v-if="props.shared && !orderModal" type="button" :disabled="busy" @click="run(refreshShared)">刷新库存</button>
    <section v-if="view === 'samples' || view === 'management'">
      <div class="sample-heading">
        <h1>{{ view === 'management' ? '样品管理' : '样品库' }}</h1>
        <button v-if="view === 'management' && canMaintain" type="button" @click="message = ''; newSampleDialog?.showModal()">新增样品</button>
        <button v-else-if="canIssue" type="button" class="primary" @click="openOrder">开单</button>
      </div>
      <div class="sample-filters" role="search" aria-label="样品筛选">
        <label>搜索样品<input v-model="filters.keyword" type="search" placeholder="型号、规格或库位"></label>
        <label>分类<select v-model="filters.category"><option value="">全部</option><option v-for="category in sampleCategories" :key="category">{{ category }}</option></select></label>
        <label v-for="{ field, label, values } in filterOptions" :key="field">{{ label }}<select v-model="specifications[field]"><option :value="undefined">全部</option><option v-for="value in values" :key="value">{{ value }}</option></select></label>
        <label>库存状态<select v-model="filters.stock"><option value="">全部</option><option value="low">需补样</option><option value="ready">可出库</option><option value="blocked">禁止出库</option></select></label>
        <button type="button" @click="filters = blankFilters(); specifications = {}">清除筛选</button>
        <span aria-live="polite">{{ filteredRows.length }} / {{ stockRows.length }} 项</span>
      </div>
      <SampleStockTable :rows="filteredRows" :total="stockRows.length" :manage="canMaintain && view === 'management'" @receive="startDocument('receipt', $event)" @adjust="openAdjustment($event, 'adjustDown')" />
      <dialog v-if="canMaintain && view === 'management'" ref="adjustmentDialog" aria-labelledby="adjust-stock-title">
      <h2 id="adjust-stock-title">{{ adjustmentKind === 'receipt' ? '加库存' : '减库存' }}</h2>
      <p>{{ adjustmentRow?.product }} · {{ adjustmentRow?.spec }} · {{ adjustmentRow?.location }}</p>
      <p v-if="message" role="alert">{{ message }}</p>
      <form @submit.prevent="adjustStock">
        <label>数量<input v-model.number="receiptQuantity" type="number" min="1" step="1" required></label>
        <label v-if="adjustmentKind === 'adjustDown'">调减原因<input v-model.trim="adjustmentReason" required></label>
        <button type="button" @click="adjustmentDialog?.close(); message = ''">取消</button>
        <button type="submit">确认</button>
      </form>
      </dialog>
    </section>
    <component :is="orderModal ? 'dialog' : 'section'" v-if="orderModal || view === 'documents'" ref="orderDialog" :class="{ 'stock-order-dialog': orderModal }" :aria-labelledby="orderModal ? 'stock-order-title' : undefined" @cancel.prevent="closeOrder">
      <div class="sample-heading">
        <h1 id="stock-order-title">{{ orderModal ? '样品开单' : labels[kind] + '开单' }}</h1>
        <button v-if="orderModal" type="button" @click="closeOrder">关闭</button>
      </div>
      <p v-if="orderModal && message" role="alert">{{ message }}</p>
      <SampleOrderPreview v-if="preview" :preview="preview" @edit="preview = undefined; message = ''" @confirm="run(() => complete($event))" />
      <form v-show="!preview" @submit.prevent="record">
        <label v-if="!orderModal && (!customerId || kind !== 'issue')">单据类型<select v-model="kind" @change="startDocument(kind)"><option v-for="id in actionOptions" :key="id" :value="id">{{ labels[id] }}</option></select></label>
        <label v-if="kind === 'issue'">客户或领取人
          <input v-model="customer" :readonly="Boolean(customerId)" :list="!customerId && customerChoices.length ? 'sample-customer-choices' : undefined" placeholder="选择客户或输入领取人" autocomplete="off" required>
          <datalist id="sample-customer-choices"><option v-for="row in customerChoices" :key="row.id" :value="row.label" /></datalist>
        </label>
        <label v-if="['return', 'reverse'].includes(kind)">原单
          <select v-model="source" required @change="quantities = {}"><option value="">选择原单</option>
            <option v-for="entry in originalOptions" :key="entry.id" :value="entry.id">{{ labels[entry.kind] }} · {{ entry.time }} · {{ entry.customer || entry.reason }}</option>
          </select>
        </label>
        <label>{{ kind === 'issue' ? '备注（选填）' : kind === 'receipt' ? '入库备注（选填）' : '原因' }}<input v-model="reason" :required="!selectingSamples"></label>
        <template v-if="selectingSamples">
          <div class="draft-lines">
            <div class="sample-heading"><h2>本单明细（{{ picked.length }} 款）</h2><button type="button" @click="pickerOpen = !pickerOpen">{{ pickerOpen ? '完成选样' : '选样' }}</button></div>
            <p v-if="!draftRows.length">尚未选择样品</p>
            <div v-else class="sample-table-wrap"><table>
              <thead><tr><th>型号</th><th>裁样规格</th><th>库位</th><th>当前库存</th><th>数量</th><th>操作</th></tr></thead>
              <tbody><tr v-for="row in draftRows" :key="row.id">
                <td>{{ row.product }}</td><td>{{ row.spec }}</td><td>{{ row.location }}</td><td>{{ row.quantity }}</td>
                <td><input v-model.number="quantities[row.id]" class="issue-quantity" type="number" min="1" :max="kind === 'issue' ? row.quantity - 1 : undefined" step="1" required :aria-label="`${row.product} ${row.spec} 数量`"></td>
                <td><button type="button" @click="pick(row.id, false)">移除</button></td>
              </tr></tbody>
            </table></div>
          </div>
          <SamplePicker v-show="pickerOpen" :stock-rows="stockRows" :picked="picked" :kind="kind === 'issue' ? 'issue' : 'receipt'" @pick="pick" @create="message = ''; newSampleDialog?.showModal()" />
        </template>
        <div v-else class="rows">
          <label v-for="row in documentRows" :key="row.id">
            {{ row.product }} · {{ row.spec }} · {{ row.location }}
            <input v-model.number="quantities[row.id]" :aria-label="`${row.product} ${row.spec} 份数`" type="number" min="0" step="1" placeholder="0">
          </label>
        </div>
        <div v-if="orderModal" class="stock-order-actions">
          <button type="button" :disabled="!picked.length" @click="printOrderDraft">打印</button>
          <button type="submit" :disabled="!picked.length">出库</button>
        </div>
        <button v-else type="submit" :disabled="selectingSamples && !picked.length">{{ selectingSamples ? '生成预览' : '确认记账' }}</button>
      </form>
    </component>
    <SampleLedger v-show="view === 'ledger'" :entries="data.entries" :customer-id="customerId" :document-id="documentId" :can-issue="canIssue" :can-maintain="canMaintain" :labels="labels" @print="print" @shipment="openShipment" @return="startDocument('return', undefined, $event)" />
    <dialog v-if="canMaintain" ref="newSampleDialog" aria-labelledby="new-sample-title">
      <h2 id="new-sample-title">新增样品</h2>
      <p v-if="message" role="alert">{{ message }}</p>
      <form @submit.prevent="addSample">
        <label>分类<select v-model="sample.category"><option v-for="category in sampleCategories" :key="category">{{ category }}</option></select></label>
        <label>产品型号<input v-model="sample.product" required></label>
        <label>草高<input v-model="sample.height"></label>
        <label>针数<input v-model.trim="sample.needleCount" inputmode="numeric"></label>
        <label>针排<input v-model.trim="sample.needleRow"></label>
        <label>背胶<input v-model.trim="sample.backing"></label>
        <label>密度<input v-model="sample.density"></label>
        <label>磅重<input v-model="sample.poundWeight"></label>
        <label>裁样规格<input v-model="sample.spec" required></label>
        <label>库位<input v-model="sample.location" required></label>
        <label v-if="view !== 'documents'">入库数量<input v-model.number="initialQuantity" type="number" min="1" step="1" required></label>
        <button type="button" @click="newSampleDialog?.close(); message = ''">取消</button>
        <button type="submit">{{ view === 'documents' ? '建档并加入本单' : '新增并入库' }}</button>
      </form>
    </dialog>
    <dialog v-if="canIssue" ref="shipmentDialog" aria-labelledby="shipment-title">
      <h2 id="shipment-title">{{ labels[shipmentAction] }}</h2>
      <p v-if="message" role="alert">{{ message }}</p>
      <form @submit.prevent="updateShipment">
        <label>{{ shipmentAction === 'cancel' ? '撤销原因' : '快递单号' }}<input v-model.trim="shipmentValue" required></label>
        <button type="button" @click="shipmentDialog?.close()">取消</button><button type="submit">确认</button>
      </form>
    </dialog>
  </main>
  <SamplePrint :printed="printed" :internal-print="internalPrint" :labels="labels" :draft="draftPrint" />
</template>

<style scoped src="./workshop.css"></style>
<style scoped>
.sample-workspace .stock-order-dialog{width:min(1100px,calc(100% - 24px));padding:16px}
.stock-order-dialog h1{margin:0 0 12px}
.stock-order-actions{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;width:100%;padding:10px 0;background:#fff;border-top:1px solid #dbe4ec}
</style>
