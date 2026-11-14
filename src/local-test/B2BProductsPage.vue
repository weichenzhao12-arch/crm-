<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useQuoteStore } from '~/stores/quote'
import { useCrmStore } from '~/stores/crm'
import { useAdminStore } from '~/stores/admin'
import { useRoute } from 'vue-router'
import { quoteCustomers } from '~/features/crm/quote-customers'
import type { ProductRecord } from '~/features/quote/types'

const quote = useQuoteStore()
const crm = useCrmStore()
const admin = useAdminStore()
const route = useRoute()
const customerId = ref(String(route.query.customerId || ''))
const customers = computed(() => crm.cloudLoadState === 'ready' ? quoteCustomers(crm.customers, admin.currentUser) : [])
const customer = computed(() => customers.value.find(row => row.id === customerId.value))
const saveMessage = ref('')
const saving = ref(false)
const saved = ref(false)
const fields = [
  ['category', '分类'], ['height', '草高'], ['needleCount', '针数'], ['needleRow', '针排'],
  ['backing', '背胶'], ['density', '密度'], ['poundWeight', '磅重'],
] as const
type Field = typeof fields[number][0]
const filters = ref<Partial<Record<Field, string>>>({})
const search = ref('')
const selected = ref<string[]>([])
const unitPrices = ref<Record<string, number | string>>({})
const onlySelected = ref(false)
const preview = ref(false)
const loading = ref(true)
const value = (row: ProductRecord, field: Field) => String(row[field] ?? '').trim()
const options = computed(() => fields.map(([field, label]) => ({
  field, label,
  values: [...new Set(quote.pricing.products.map(row => value(row, field)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })),
})))
const selectedRows = computed(() => quote.pricing.products.filter(row => selected.value.includes(row.id)))
const selectedCount = computed(() => selectedRows.value.length)
function validPrice(id: string) {
  const price = unitPrices.value[id]
  return typeof price === 'number' && Number.isFinite(price) && price > 0
    && Math.abs(price * 100 - Math.round(price * 100)) < 1e-7
}
const canPreview = computed(() => selectedRows.value.length > 0 && selectedRows.value.every(row => validPrice(row.id)))
function exportPdf() {
  if (preview.value && canPreview.value)
    window.print()
}
async function saveQuote() {
  if (!preview.value || !canPreview.value || !customer.value || saving.value || saved.value) return
  saving.value = true
  saveMessage.value = ''
  try {
    crm.saveQuoteRecord(customer.value.id, {
      title: '普通报价', status: '已保存报价', snapshot: {
        kind: 'standard',
        rows: selectedRows.value.map(row => ({
          name: row.model || row.itemNo,
          specs: [...fields.map(([field, label]) => `${label}：${value(row, field) || '—'}`), `货号：${row.itemNo || '—'}`, `抗老化：${row.warranty || '—'}`].join(' · '),
          unitPrice: Number(unitPrices.value[row.id]), unit: '㎡',
        })),
      },
    }, false)
    saved.value = await crm.save()
    saveMessage.value = saved.value ? '已保存到客户记录' : '保存失败，请重新加载客户后重试'
  }
  finally { saving.value = false }
}
const rows = computed(() => {
  const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return quote.pricing.products.filter(row =>
    (!onlySelected.value || selected.value.includes(row.id))
    && (onlySelected.value || (fields.every(([field]) => !filters.value[field] || value(row, field) === filters.value[field])
      && terms.every(term => [row.model, row.itemNo, ...fields.map(([field]) => value(row, field))].join(' ').toLowerCase().includes(term)))))
})

onMounted(async () => {
  void crm.loadCloudCustomers()
  try { await quote.loadCloudPricing() }
  finally { loading.value = false }
})
</script>

<template>
  <main class="sample-workspace" :class="{ 'standard-quote-print': preview }">
    <h1 v-if="preview" class="standard-quote-title">报价单</h1>
    <h1 v-else>普通报价</h1>
    <label v-if="!preview">绑定客户
      <select v-model="customerId"><option value="">不绑定客户</option><option v-for="row in customers" :key="row.id" :value="row.id">{{ row.name }}{{ row.phone ? ' · ' + row.phone : '' }}</option></select>
    </label>
    <p v-else-if="customer">客户：{{ customer.name }}</p>
    <div v-if="!preview" class="sample-filters" role="search" aria-label="产品筛选">
      <label>搜索产品<input v-model="search" type="search" placeholder="型号、货号或规格" :disabled="onlySelected"></label>
      <label v-for="{ field, label, values } in options" :key="field">{{ label }}
        <select v-model="filters[field]" :disabled="onlySelected">
          <option :value="undefined">全部</option>
          <option v-for="option in values" :key="option">{{ option }}</option>
        </select>
      </label>
      <button type="button" @click="search = ''; filters = {}; onlySelected = false">清除筛选</button>
    </div>
    <div v-if="!preview" class="selection-bar">
      <label><input v-model="onlySelected" type="checkbox"> 仅看已选</label>
      <span aria-live="polite">已选 {{ selectedCount }} 款</span>
    </div>
    <div v-else class="selection-bar preview-controls">
      <button type="button" :disabled="saving" @click="preview = false; saved = false; saveMessage = ''">返回修改</button>
      <button class="primary" type="button" :disabled="!canPreview" @click="exportPdf">导出 PDF</button>
      <button v-if="customer" type="button" :disabled="saving || saved || !canPreview" @click="saveQuote">保存报价</button>
      <span v-if="saveMessage" role="status">{{ saveMessage }}</span>
    </div>
    <div class="quote-workspace" :class="{ 'quote-workspace-preview': preview }">
    <div class="sample-table-wrap">
      <table class="product-quote-table">
        <thead><tr><th v-if="!preview">选择</th><th>分类</th><th v-if="preview">货号</th><th>型号</th><th v-for="[field, label] in fields.slice(1)" :key="field">{{ label }}</th><th v-if="preview">抗老化</th><th v-if="preview">报价（元/㎡）</th></tr></thead>
        <tbody>
          <tr v-for="row in (preview ? selectedRows : rows)" :key="row.id">
            <td v-if="!preview"><input v-model="selected" type="checkbox" :value="row.id" :disabled="loading" :aria-label="`选择 ${row.model || row.itemNo}`"></td>
            <td>{{ row.category || '—' }}</td><td v-if="preview">{{ row.itemNo || '—' }}</td><td>{{ row.model || row.itemNo || '—' }}</td>
            <td v-for="[field] in fields.slice(1)" :key="field">{{ value(row, field) || '—' }}</td>
            <td v-if="preview">{{ row.warranty || '—' }}</td>
            <td v-if="preview">{{ Number(unitPrices[row.id]).toFixed(2) }}</td>
          </tr>
          <tr v-if="!preview && !rows.length"><td colspan="9">{{ loading ? '正在加载产品资料' : '没有符合条件的产品' }}</td></tr>
        </tbody>
      </table>
    </div>
    <aside v-if="!preview" class="selected-panel" aria-labelledby="selected-products-title">
      <div class="selected-header selected-banner">
        <h2 id="selected-products-title">实时报价</h2>
        <button v-if="selectedCount" type="button" @click="selected = []; onlySelected = false">清空</button>
      </div>
      <div class="selected-body">
      <h3>产品明细</h3>
      <p v-if="!selectedCount" class="selected-empty">暂无已选产品</p>
      <ul v-else class="selected-list">
        <li v-for="row in selectedRows" :key="row.id">
          <div class="selected-header">
            <strong>{{ row.model || row.itemNo || '—' }}</strong>
            <button type="button" :aria-label="`移除 ${row.model || row.itemNo}`" @click="selected = selected.filter(id => id !== row.id)">移除</button>
          </div>
          <dl class="selected-specs">
            <div v-for="[field, label] in fields" :key="field"><dt>{{ label }}</dt><dd>{{ value(row, field) || '—' }}</dd></div>
          </dl>
          <label class="price-field">单价（元/㎡）
            <input v-model.number="unitPrices[row.id]" class="unit-price" type="number" min="0.01" step="0.01" :aria-label="`${row.model || row.itemNo} 每平方米报价`" :aria-invalid="unitPrices[row.id] !== undefined && unitPrices[row.id] !== '' && !validPrice(row.id)" placeholder="0.00">
          </label>
        </li>
      </ul>
      </div>
      <div class="selected-footer">
        <span>已选 {{ selectedCount }} 款</span>
        <button class="primary" type="button" :disabled="!canPreview" @click="preview = true">预览报价</button>
      </div>
    </aside>
    </div>
  </main>
</template>

<style scoped src="./workshop.css"></style>
<style scoped>
.sample-workspace{--ink:var(--crm-text);--muted:#50627a;--line:var(--crm-line);--action:var(--crm-blue-dark);--paper:var(--crm-surface);--soft:#edf4fc}
.sample-workspace .sample-table-wrap{border-color:var(--crm-line-strong)}
.sample-workspace th{background:#eaf3fd;color:var(--crm-text)}
.sample-workspace :is(th,td){border-color:var(--crm-line)}
.sample-workspace .product-quote-table{table-layout:fixed;min-width:650px}
.sample-workspace .product-quote-table :is(th,td){padding:5px 8px;line-height:1.35;white-space:normal;overflow-wrap:anywhere}
.product-quote-table th:first-child{width:46px}
.product-quote-table th:nth-child(2){width:74px}
.product-quote-table th:nth-child(3){width:19%}
.product-quote-table th:nth-child(4),.product-quote-table th:nth-child(5){width:68px}
.quote-workspace-preview .product-quote-table th:first-child{width:74px}
.quote-workspace-preview .product-quote-table th:nth-child(2){width:19%}
.quote-workspace-preview .product-quote-table th:nth-child(3){width:68px}
.sample-workspace tbody tr:nth-child(even){background:var(--crm-surface-soft)}
.sample-workspace tbody tr:hover,.sample-workspace tbody tr:has(input:checked){background:#e7f2ff}
.sample-workspace .primary{background:var(--crm-blue-dark);border-color:var(--crm-blue-dark);color:#fff}
.sample-workspace .primary:disabled{background:#eaf0f7;border-color:var(--crm-line-strong);color:#50627a;opacity:1}
.sample-workspace > a{color:var(--crm-blue-dark)}
.selection-bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin-top:8px}
.selection-bar label{display:flex;align-items:center;gap:6px}
.quote-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,300px);align-items:start;gap:12px;margin-top:8px}
.quote-workspace-preview{grid-template-columns:minmax(0,1fr)}
.sample-workspace .standard-quote-title{text-align:center}
.quote-workspace .sample-table-wrap{min-width:0;margin-top:0}
.selected-panel{position:sticky;top:76px;min-width:0;overflow:hidden;border:1px solid var(--crm-line-strong);border-radius:8px;background:var(--crm-surface);box-shadow:var(--crm-shadow)}
.selected-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.selected-header h2{margin:0}
.selected-banner,.selected-footer{padding:12px;background:#153553;color:#fff}
.selected-banner button{background:transparent;color:#fff}
.selected-body{padding:12px}
.selected-body h3{margin:0 0 8px;font-size:14px}
.selected-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}
.selected-header strong,.selected-specs dd{overflow-wrap:anywhere}
.selected-empty{margin:0;padding:14px 8px;border:1px dashed var(--crm-line-strong);border-radius:6px;background:var(--crm-surface-soft);color:var(--muted);text-align:center}
.selected-list{display:grid;gap:12px;max-height:min(55vh,520px);overflow:auto;margin:12px 0;padding:0;list-style:none}
.selected-list li{min-width:0;padding:10px 0;border-bottom:1px solid var(--crm-line)}
.selected-specs{display:flex;flex-wrap:wrap;gap:5px 12px;margin:8px 0}
.selected-specs div{display:flex;gap:4px;font-size:12px}
.selected-specs dt{color:var(--muted)}
.selected-specs dd{margin:0}
.price-field{display:flex;align-items:center;justify-content:space-between;gap:8px}
.unit-price{width:110px}
.unit-price[aria-invalid=true]{border-color:#b42318}
@media(max-width:820px){.quote-workspace{grid-template-columns:minmax(0,1fr)}.selected-panel{position:static}.quote-workspace:not(.quote-workspace-preview) .sample-table-wrap{max-height:45vh}}
@page standard-quote{size:A4 portrait;margin:10mm}
@media print{
  main.standard-quote-print{display:block!important;page:standard-quote;min-height:0!important;padding:0!important;background:white!important;color:#152538!important}
  .standard-quote-print h1{margin:0 0 12px;font-size:18pt;text-align:center}
  .preview-controls{display:none!important}
  .quote-workspace-preview{display:block}
  .standard-quote-print .quote-workspace-preview .sample-table-wrap{overflow:visible;max-height:none;border:0;border-radius:0}
  .standard-quote-print .product-quote-table{width:100%;min-width:0;table-layout:fixed;font-size:9pt;border:1px solid #aebccc}
  .standard-quote-print .product-quote-table :is(th,td){width:auto;border:1px solid #aebccc;padding:3px;overflow-wrap:anywhere}
  .standard-quote-print .product-quote-table th:nth-child(2){width:12%}
  .standard-quote-print .product-quote-table th:nth-child(3){width:15%}
  .standard-quote-print .product-quote-table th:nth-child(7){width:12%}
  .standard-quote-print .product-quote-table tbody tr:last-child td{border-bottom:1px solid #aebccc}
  .standard-quote-print thead{display:table-header-group}
  .standard-quote-print tr{break-inside:avoid}
}
</style>
