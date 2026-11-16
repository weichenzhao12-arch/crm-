<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { apiFetch } from '~/api/cloud-storage'
import { useAuthStore } from '~/stores/auth'
import { useRoute } from 'vue-router'
import CustomerPicker from './CustomerPicker.vue'
import type { CustomerOption } from './CustomerPicker.vue'
import type { Line, Order, StockView } from './model'
import { orderResponsible, planLines, orderArea, warehouseAccess, warehouseFields } from './model'
import StockTable from './StockTable.vue'
import DeliveryPrint from './DeliveryPrint.vue'
import './warehouse.css'
import { pendingMutation } from './mutation'
const props = withDefaults(defineProps<{ management?: boolean }>(), { management: false })
watch(() => props.management, () => { dialog.value?.close(); notice.value = ''; void load() })

type Access = ReturnType<typeof warehouseAccess>
type History = { event: string, actor: string, target: string, time: string }
interface View { access: Access, stocks: StockView[], orders: Order[], customers: CustomerOption[], history: History[] }
const endpoint = '/api/local-warehouse'
const auth = useAuthStore()
const route = useRoute()
const customerSearch = ref('')
const state = ref<View | null>(null)
const tab = ref<'stock' | 'orders' | 'history'>('stock')
const error = ref('')
const formError = ref('')
const notice = ref('')
const busy = ref(false)
let mutationKeys: Record<string, string> = {}
const dialog = ref<HTMLDialogElement>()
const mode = ref<'stock' | 'order' | 'detail' | 'print' | 'cancel'>('stock')
const preview = ref<Order | null>(null)
const priced = ref(false)
const selected = ref<Order | null>(null)
const reason = ref('')
const orderSearch = ref('')
const status = ref('')
const statusLabels = { pending: '待出库（已锁定）', rejected: '已退回', shipped: '已出库', returned: '已退货', cancelled: '已撤销' } as const
const kinds = { roll: '整卷', meter: '按米（自动配货）', remnant: '现有零货', cut: '裁切' } as const
const visibleOrders = computed(() => state.value?.orders.filter(order => (!status.value || order.status === status.value)
  && `${order.id} ${order.receiver} ${order.openedBy}`.toLowerCase().includes(orderSearch.value.trim().toLowerCase())) || [])

const stock = ref(freshStock())
const stockUnit = ref('roll')
const order = ref(freshOrder())
const logistics = ref({ driver: '', driverPhone: '', plate: '', packaging: [] as string[] })
function freshStock() {
  return { id: '', category: '', code: '', name: '', height: '', stitches: '', gauge: '', backing: '', density: '', dtex: '', uv: '', color: '', width: 2, length: 25, rolls: 0, visible: false, direction: 'in', reason: '', autoMeters: true, remnants: [] as { meters: number, count: number }[] }
}
function freshLine(): Line {
  return { stockId: '', kind: 'roll', meters: 0, count: 1, packaging: '', price: null }
}
function freshOrder() {
  return { id: '', date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()), customerId: '', receiver: '', address: '', phone: '', driver: '', driverPhone: '', plate: '', lines: [freshLine()] }
}
function getStock(id: string) { return state.value?.stocks.find(stock => stock.id === id) }
function options(id: string) { const item = getStock(id); return Object.keys(item?.availableRemnants ?? item?.remnants ?? {}) }
const orderPlan = computed(() => {
  if (!state.value) return { error: '', lines: [] }
  try {
    const stocks = state.value.stocks.map(item => ({ ...toRaw(item), visible: Boolean(item.visible), rolls: item.availableRolls ?? item.rolls, remnants: toRaw(item.availableRemnants ?? item.remnants) }))
    return { error: '', lines: planLines(stocks, order.value.lines.filter(line => line.stockId).map(line => ({ ...line }))) }
  }
  catch (cause) { return { error: message(cause), lines: [] } }
})
const orderWarning = computed(() => orderPlan.value.error)
const stockWarning = computed(() => {
  if (stock.value.direction !== 'out' || !state.value) return ''
  try {
    const available = state.value.stocks.map(item => ({ ...toRaw(item), visible: Boolean(item.visible), rolls: item.availableRolls ?? item.rolls, remnants: toRaw(item.availableRemnants ?? item.remnants) }))
    const requests: Line[] = stockUnit.value === 'roll'
      ? [{ stockId: stock.value.id, kind: 'roll', meters: stock.value.length, count: stock.value.rolls, packaging: '', price: null }]
      : stock.value.remnants.map(item => ({ stockId: stock.value.id, kind: 'meter', meters: item.meters, count: item.count, packaging: '', price: null }))
    if (!requests.length) return '请填写出库米数'
    planLines(available, requests)
    return ''
  }
  catch (cause) { return message(cause) }
})
function resetLength(line: Line) {
  line.meters = line.kind === 'roll' ? getStock(line.stockId)?.length ?? 0 : line.kind === 'remnant' ? Number(options(line.stockId)[0] || 0) : 0
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败' }
async function load() {
  error.value = ''
  try { state.value = await apiFetch<View>(`${endpoint}/`) }
  catch (cause) { error.value = message(cause) }
}
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await load()
  if (!props.management && state.value?.access.sales && !state.value.access.only && route.query.customerId) {
    const customer = state.value.customers.find(item => item.id === route.query.customerId)
    if (customer) { editOrder(); chooseCustomer(customer) }
  }
  refreshTimer = setInterval(() => { if (!busy.value && document.visibilityState === 'visible') void load() }, 15000)
})
onUnmounted(() => clearInterval(refreshTimer))

function show(next: typeof mode.value) {
  mode.value = next
  formError.value = ''
  if (!dialog.value?.open) dialog.value?.showModal()
}
function editStock(row?: StockView) {
  mutationKeys = {}
  stockUnit.value = 'roll'
  stock.value = row ? { ...freshStock(), ...row, visible: Boolean(row.visible), rolls: 0, remnants: [] } : freshStock()
  stock.value.direction = !state.value?.access.receive && state.value?.access.issue ? 'out' : 'in'
  show('stock')
}
function editOrder(row?: Order) {
  mutationKeys = {}
  void load()
  order.value = row ? { ...row, lines: row.lines.map(({ stockId, kind, meters, count, packaging, price }) => ({ stockId, kind: kind === 'roll' ? kind : 'meter', meters, count, packaging, price })) } : freshOrder()
  customerSearch.value = row?.customerId ? state.value?.customers.find(item => item.id === row.customerId)?.name || row.receiver : row?.receiver || ''
  show('order')
}
function chooseCustomer(customer: CustomerOption) {
  customerSearch.value = customer.name
  order.value.customerId = customer.id
  order.value.receiver = customer.name
  order.value.phone = customer.phone || ''
}
function typeCustomer(value: string) {
  if (order.value.customerId) order.value.phone = ''
  customerSearch.value = value
  order.value.customerId = ''
  order.value.receiver = value
}
function openOrder(row: Order) {
  mutationKeys = {}
  selected.value = row
  reason.value = ''
  logistics.value = { driver: row.driver, driverPhone: row.driverPhone, plate: row.plate, packaging: row.lines.map(line => line.packaging) }
  show('detail')
}
function canCancel(row: Order) {
  return ['pending', 'rejected'].includes(row.status) && Boolean(state.value?.access.cancelAny || (state.value?.access.sales && orderResponsible(row) === auth.user?.id))
}
function requestCancel(row: Order) {
  mutationKeys = {}
  selected.value = row
  reason.value = ''
  show('cancel')
}
async function submit(path: string, value: unknown, label: string, keepOpen = false) {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  notice.value = ''
  try {
    const slot = path === 'dispatch' ? `${path}:${(value as { action: string }).action}` : path
    mutationKeys[slot] ||= crypto.randomUUID()
    const attempt = await pendingMutation(auth.user?.id || '', path, value, mutationKeys[slot])
    const result = await apiFetch<Order>(`${endpoint}/${path}`, { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: JSON.stringify(value) })
    attempt.resolved()
    if (!keepOpen) dialog.value?.close()
    await load()
    if (keepOpen) openOrder(result)
    notice.value = label
    if (path === 'orders') tab.value = 'orders'
  }
  catch (cause) { formError.value = message(cause); await load() }
  finally { busy.value = false }
}
function dispatch(action: 'ship' | 'reject' | 'return' | 'logistics' | 'cancel') {
  if (!selected.value) return
  if ((action === 'ship' || action === 'return') && !window.confirm(action === 'ship' ? '确认实际发货并扣减库存？' : '确认货物已全部退回并入库？')) return
  return submit('dispatch', { id: selected.value.id, action, reason: reason.value, ...logistics.value }, { ship: '已确认出库', reject: '已退回并释放库存', cancel: '已撤销并释放库存', return: '已退货入库', logistics: '已保存发货信息' }[action], true)
}
async function openPrint(row: Order, includePrices: boolean) {
  try {
    preview.value = await apiFetch<Order>(`${endpoint}/print?id=${encodeURIComponent(row.id)}&priced=${includePrices ? '1' : '0'}`)
    priced.value = includePrices
    show('print')
  }
  catch (cause) { formError.value = message(cause) }
}
async function print(copies: number) {
  document.body.classList.add('wh-printing')
  document.body.classList.toggle('wh-two-copies', copies === 2)
  try { await nextTick(); window.print() }
  finally { document.body.classList.remove('wh-printing', 'wh-two-copies') }
}
</script>

<template>
  <main class="wh-page">
    <header class="wh-header"><div><p class="wh-brand">仓储管理</p><h1>{{ management ? '库存管理' : '仓库' }}</h1></div><div class="wh-actions"><RouterLink v-if="management" class="wh-link" to="/warehouse">返回仓库</RouterLink><button type="button" @click="load">刷新</button><RouterLink v-if="!management && state?.access.addSpec" class="wh-link" to="/warehouse/manage">库存管理</RouterLink><button v-if="management && state?.access.addSpec" type="button" class="wh-primary" @click="editStock()">新增规格</button><button v-if="!management && state?.access.sales" type="button" class="wh-primary" @click="editOrder()">开发货单</button></div></header>
    <p v-if="error" class="wh-error" role="alert">{{ error }}</p><p v-if="notice" class="wh-notice" role="status">{{ notice }}</p>
    <template v-if="state && (!management || state.access.stock)">
      <nav v-if="!management" class="wh-tabs" aria-label="仓库视图"><button :class="{ active: tab === 'stock' }" @click="tab = 'stock'">仓库库存</button><button :class="{ active: tab === 'orders' }" @click="tab = 'orders'">发货单</button><button v-if="state.access.history" :class="{ active: tab === 'history' }" @click="tab = 'history'">出入库记录</button></nav>
      <StockTable v-if="management || tab === 'stock'" :stocks="state.stocks" :maintain="management && state.access.stock" @maintain="editStock" />
      <template v-if="!management && tab === 'orders'">
        <div class="wh-tools"><label>搜索发货单<input v-model="orderSearch" placeholder="单号、客户、开单人"></label><label>状态<select v-model="status"><option value="">全部</option><option v-for="(label, key) in statusLabels" :key="key" :value="key">{{ label }}</option></select></label></div>
        <div class="wh-scroll"><table class="wh-table"><thead><tr><th>单号</th><th>送货日</th><th>收货名称</th><th>开单人</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in visibleOrders" :key="row.id"><td>{{ row.id }}</td><td>{{ row.date }}</td><td>{{ row.receiver }}</td><td>{{ row.openedBy }}</td><td>{{ statusLabels[row.status] }}</td><td><div class="wh-actions"><button @click="openOrder(row)">查看</button><button v-if="canCancel(row)" @click="requestCancel(row)">撤销</button></div></td></tr><tr v-if="!visibleOrders.length"><td colspan="6" class="wh-empty">暂无发货单</td></tr></tbody></table></div>
      </template>
      <div v-if="!management && tab === 'history'" class="wh-scroll"><table class="wh-table"><thead><tr><th>时间</th><th>操作</th><th>对象</th><th>操作账号</th></tr></thead><tbody><tr v-for="(row, i) in state.history" :key="i"><td>{{ new Date(row.time).toLocaleString('zh-CN') }}</td><td>{{ row.event }}</td><td>{{ row.target }}</td><td>{{ row.actor }}</td></tr><tr v-if="!state.history.length"><td colspan="4" class="wh-empty">暂无出入库记录</td></tr></tbody></table></div>
    </template>

    <dialog ref="dialog" class="wh-dialog" @cancel.prevent="!busy && dialog?.close()">
      <header class="wh-header"><h2>{{ { stock: stock.id ? '规格出入库' : '新增规格入库', order: '发货开单', detail: '发货单详情', print: '打印预览', cancel: '撤销发货单' }[mode] }}</h2><button :disabled="busy" @click="dialog?.close()">关闭</button></header>
      <p v-if="formError" class="wh-error" role="alert">{{ formError }}</p>
      <form v-if="mode === 'cancel' && selected" @submit.prevent="dispatch('cancel')">
        <p>{{ selected.id }} · {{ selected.receiver }} · {{ statusLabels[selected.status] }}</p>
        <label>撤销原因<input v-model.trim="reason" required maxlength="300" autofocus></label>
        <footer class="wh-actions"><button type="button" :disabled="busy" @click="openOrder(selected)">返回发货单</button><button class="wh-primary" :disabled="busy || !reason.trim()">确认撤销并释放库存</button></footer>
      </form>
      <form v-if="mode === 'stock'" @submit.prevent="submit('stock', stock, '库存已更新')">
        <p v-if="stock.id"><b>{{ stock.code }} · {{ stock.name }}</b></p>
        <div v-else class="wh-grid"><label v-for="[key, label] in warehouseFields" :key="key">{{ label }}<input v-model.trim="stock[key]" :required="['category', 'code', 'name'].includes(key)" maxlength="150"></label><label>宽度 (m)<input v-model.number="stock.width" type="number" min="0.001" step="0.001" required></label><label>整卷长度 (m)<input v-model.number="stock.length" type="number" min="0.001" step="0.001" required></label></div>
        <div class="wh-grid"><label v-if="stock.id">操作类型<select v-model="stock.direction"><option v-if="state?.access.receive" value="in">入库</option><option v-if="state?.access.issue" value="out">出库</option></select></label><label>计量方式<select v-model="stockUnit" @change="stock.rolls = 0; stock.remnants = stockUnit === 'meter' ? [{ meters: 0, count: 1 }] : []"><option value="roll">整卷</option><option value="meter">按米</option></select></label><label v-if="stockUnit === 'roll'">{{ stock.direction === 'out' ? '出库卷数' : '入库卷数' }}<input v-model.number="stock.rolls" type="number" min="0" step="1" required></label><label class="wh-check"><input v-model="stock.visible" :disabled="!state?.access.visibility" type="checkbox"> 代理商可见</label></div>
        <label>操作原因<input v-model.trim="stock.reason" :required="stock.direction === 'out'" maxlength="300"></label>
        <div v-for="(part, i) in stock.remnants" :key="i" class="wh-tools"><label>{{ stock.direction === 'out' ? '出库长度 (m/段)' : '入库长度 (m/段)' }}<input v-model.number="part.meters" type="number" min="0.001" step="0.001" required></label><label>段数<input v-model.number="part.count" type="number" min="1" step="1" required></label><button type="button" @click="stock.remnants.splice(i, 1)">移除</button></div>
        <p v-if="stockWarning" class="wh-error" role="alert">{{ stockWarning }}</p>
        <footer class="wh-actions"><button type="button" @click="dialog?.close()">返回库存管理</button><button v-if="stockUnit === 'meter'" type="button" @click="stock.remnants.push({ meters: 0, count: 1 })">添加米数明细</button><button class="wh-primary" :disabled="busy || Boolean(stockWarning) || !(stock.direction === 'out' ? state?.access.issue : state?.access.receive) && Boolean(stock.rolls || stock.remnants.length)">{{ stock.direction === 'out' ? '确认出库' : '保存入库' }}</button></footer>
      </form>
      <form v-if="mode === 'order'" @submit.prevent="submit('orders', order, '发货单已提交')">
        <div class="wh-grid">
          <CustomerPicker v-if="state?.access.sales && !state.access.only" :model-value="customerSearch" :customer-id="order.customerId" :options="state.customers" @update:model-value="typeCustomer" @select="chooseCustomer" />
          <label>收货名称<input v-model.trim="order.receiver" required></label><label>送货日期<input v-model="order.date" type="date" required></label><label>收货电话<input v-model="order.phone" type="tel"></label><label class="wh-wide">收货地址<input v-model="order.address"></label>
        </div>
        <fieldset v-for="(line, i) in order.lines" :key="i" class="wh-line"><legend>发货明细 {{ i + 1 }}</legend>
          <div class="wh-grid"><label class="wh-wide">成品规格<select v-model="line.stockId" required @change="resetLength(line)"><option value="" disabled>请选择</option><option v-for="item in state?.stocks" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }} · {{ item.width }}×{{ item.length }}m · 可用 {{ item.availableRolls ?? item.rolls }} 卷</option></select></label>
            <label>发货类型<select v-model="line.kind" @change="resetLength(line)"><option value="roll">整卷</option><option value="meter">按米（自动配货）</option></select></label>
            <label v-if="line.kind === 'remnant'">零货长度<select v-model.number="line.meters" required><option :value="0" disabled>请选择</option><option v-for="meters in options(line.stockId)" :key="meters" :value="Number(meters)">{{ meters }}m（{{ (getStock(line.stockId)?.availableRemnants ?? getStock(line.stockId)?.remnants)?.[meters] }} 段）</option></select></label>
            <label v-if="line.kind === 'meter'">出库长度 (m/段)<input v-model.number="line.meters" type="number" min="0.001" step="0.001" required></label><label>{{ line.kind === 'roll' ? '数量（卷）' : '数量（段）' }}<input v-model.number="line.count" type="number" min="1" step="1" required></label><label>包装方式<input v-model="line.packaging"></label>
            <label v-if="state?.access.price">单价 (元/㎡)<input :value="line.price" type="number" min="0" step="0.01" @input="line.price = ($event.target as HTMLInputElement).value === '' ? null : ($event.target as HTMLInputElement).valueAsNumber"></label>
          </div>
          <p v-if="getStock(line.stockId)" class="wh-specs">{{ warehouseFields.map(([key, label]) => `${label}：${getStock(line.stockId)?.[key] || '－'}`).join(' · ') }} · 面积 {{ Number(((getStock(line.stockId)?.width || 0) * line.meters * line.count).toFixed(6)) }} ㎡</p>
          <button v-if="order.lines.length > 1" type="button" @click="order.lines.splice(i, 1)">移除此行</button>
        </fieldset>
        <p v-if="orderWarning" class="wh-error" role="alert">{{ orderWarning }}，请调整规格或数量。</p>
        <p v-for="(line, i) in orderPlan.lines.filter(item => item.kind !== 'roll')" :key="`plan-${i}`" class="wh-specs">{{ line.product.code }}：{{ line.kind === 'remnant' ? `使用 ${line.meters}m 零货` : `从 ${line.sourceMeters ? `${line.sourceMeters}m 零货` : `${getStock(line.stockId)?.length}m 整卷`} 裁出 ${line.meters}m，余 ${Number(((line.sourceMeters ?? getStock(line.stockId)?.length ?? 0) - line.meters).toFixed(3))}m 转零货` }} × {{ line.count }} 段</p>
        <footer class="wh-actions wh-order-footer"><span>已添加 {{ order.lines.length }} 种规格</span><button type="button" @click="load">刷新可用库存</button><button type="button" :disabled="order.lines.length >= 100" @click="order.lines.push(freshLine())">＋ 添加规格</button><button class="wh-primary" :disabled="busy || Boolean(orderWarning)">提交并锁定库存</button></footer>
      </form>
      <template v-if="mode === 'detail' && selected">
        <p><b>{{ selected.id }} · {{ selected.receiver }}</b>　{{ statusLabels[selected.status] }}　{{ selected.date }}</p>
        <p v-if="selected.reason">原因：{{ selected.reason }}</p><p>地址：{{ selected.address || '－' }}　电话：{{ selected.phone || '－' }}</p>
        <p v-for="(line, i) in selected.lines.filter(item => item.kind === 'cut')" :key="`cut-${i}`" class="wh-specs">配货：{{ line.product.code }}，从{{ line.sourceMeters ? `${line.sourceMeters}m 零货` : '整卷' }}裁出 {{ line.meters }}m × {{ line.count }} 段</p>
        <div class="wh-scroll"><table class="wh-table"><thead><tr><th>产品</th><th>类型</th><th>长 (m)</th><th>数量</th><th>面积 (㎡)</th><th v-if="selected.lines.some(line => line.price !== null)">单价 (元/㎡)</th></tr></thead><tbody><tr v-for="(line, i) in selected.lines" :key="i"><td>{{ line.product.code }} · {{ line.product.name }}</td><td>{{ kinds[line.kind] }}</td><td>{{ line.meters }}</td><td>{{ line.count }}</td><td>{{ orderArea(line) }}</td><td v-if="selected.lines.some(item => item.price !== null)">{{ line.price ?? '－' }}</td></tr></tbody></table></div>
        <template v-if="state?.access.pick && selected.status === 'pending'"><div class="wh-grid"><label>司机姓名<input v-model="logistics.driver"></label><label>司机电话<input v-model="logistics.driverPhone" type="tel"></label><label>车牌号<input v-model="logistics.plate"></label><label v-for="(_, i) in logistics.packaging" :key="i">明细 {{ i + 1 }} 包装<input v-model="logistics.packaging[i]"></label></div><button :disabled="busy" @click="dispatch('logistics')">保存发货信息</button></template>
        <label v-if="((state?.access.pick && selected.status === 'pending') || (state?.access.returnStock && selected.status === 'shipped'))" class="wh-reason">{{ selected.status === 'pending' ? '退回原因' : '退货原因' }}<input v-model="reason" maxlength="300"></label>
        <footer class="wh-actions">
          <button v-if="state?.access.print" @click="openPrint(selected, false)">预览无价发货单</button><button v-if="state?.access.printPrice" @click="openPrint(selected, true)">预览含价发货单</button>
          <button v-if="selected.status === 'rejected' && state?.access.sales && orderResponsible(selected) === auth.user?.id" @click="editOrder(selected)">修改并重新提交</button>
          <button v-if="canCancel(selected)" :disabled="busy" @click="requestCancel(selected)">撤销发货单</button>
          <button v-if="state?.access.pick && selected.status === 'pending'" :disabled="busy || !reason.trim()" @click="dispatch('reject')">退回修改</button><button v-if="state?.access.ship && selected.status === 'pending'" class="wh-primary" :disabled="busy" @click="dispatch('ship')">确认出库</button>
          <button v-if="state?.access.returnStock && selected.status === 'shipped'" :disabled="busy || !reason.trim()" @click="dispatch('return')">整单退货入库</button>
        </footer>
      </template>
      <template v-if="mode === 'print' && preview"><DeliveryPrint :order="preview" :priced="priced" /><footer class="wh-actions"><button v-if="selected" @click="openOrder(selected)">返回发货单</button><button @click="print(2)">打印两联</button><button class="wh-primary" @click="print(1)">打印</button></footer></template>
    </dialog>
    <Teleport to="body"><div v-if="preview" class="wh-print-target"><DeliveryPrint :order="preview" :priced="priced" /><DeliveryPrint class="wh-second-copy" :order="preview" :priced="priced" /></div></Teleport>
  </main>
</template>
