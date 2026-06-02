<route lang="json">
{
  "meta": {
    "title": "客户列表",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import * as XLSX from 'xlsx'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import type { CrmCustomer, IntentLevel } from '~/stores/crm'

const router = useRouter()
const crm = useCrmStore()
const admin = useAdminStore()
const { customers } = storeToRefs(crm)
const { users } = storeToRefs(admin)

const keyword = ref('')
const stageFilter = ref('全部')
const selectedUserId = ref(admin.currentUser?.id || 'owner')
const sampleDialogCustomerId = ref('')
const sampleForm = ref({
  sampleSent: false,
  sampleSpec: '',
  sampleTrackingNo: '',
})
const selectedCustomerIds = ref<string[]>([])

onMounted(() => {
  crm.loadCloudCustomers()
  admin.loadCloudUsers()
})

const stageLabels: Record<string, string> = {
  new: '新客资',
  quoted: '已报价',
  follow: '跟进中',
  won: '已成交',
  lost: '无效',
}

const customerFilters = [
  { label: '全部', value: '全部' },
  { label: '未成交', value: 'active' },
  { label: '已成交', value: 'won' },
  { label: '无效', value: 'lost' },
]

const leadTableColumns = [
  '序号',
  '日期',
  '客户名称',
  '客户联系方式',
  '抖音账号来源',
  '成交属性高中低无效',
  '客户属性BC端',
  '地址',
  '客户情况沟通内容',
  '数量(平方)',
  '使用时间',
  '是否寄样品',
  '样品规格',
  '样品单号',
]

const loginUser = computed(() => admin.currentUser)
const canManageLeads = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager' || Boolean(loginUser.value?.permissions.manageUsers))
const canDeleteCustomers = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canViewAll = computed(() => canManageLeads.value)
const activeUser = computed(() => canManageLeads.value ? users.value.find(user => user.id === selectedUserId.value) || loginUser.value : loginUser.value)
const salesUsers = computed(() => users.value.filter(user => user.enabled && user.role !== 'owner' && user.role !== 'viewer'))

const scopedCustomers = computed(() => canViewAll.value
  ? customers.value
  : customers.value.filter(customer => customer.assignedToUserId === activeUser.value?.id))

const filteredCustomers = computed(() => scopedCustomers.value.filter((customer) => {
  const text = [
    customer.name,
    customer.contact,
    customer.phone,
    customer.wechat,
    customer.sourceAccount,
    customer.dealAttribute,
    customer.customerAttribute,
    customer.region,
    customer.communication,
    customer.owner,
  ].join(' ').toLowerCase()
  const stageMatched = stageFilter.value === '全部'
    || (stageFilter.value === 'active' && !['won', 'lost'].includes(customer.stage))
    || customer.stage === stageFilter.value
  return stageMatched && (!keyword.value || text.includes(keyword.value.toLowerCase()))
}))

const filteredCustomerIds = computed(() => filteredCustomers.value.map(customer => customer.id))
const selectedCount = computed(() => selectedCustomerIds.value.length)
const allFilteredSelected = computed(() =>
  filteredCustomerIds.value.length > 0
  && filteredCustomerIds.value.every(id => selectedCustomerIds.value.includes(id)),
)

watch(filteredCustomerIds, (ids) => {
  selectedCustomerIds.value = selectedCustomerIds.value.filter(id => ids.includes(id))
})

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function firstText(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || ''
}

function normalizeStage(value: string) {
  if (value.includes('成交'))
    return 'won'
  if (value.includes('无效'))
    return 'lost'
  if (value.includes('跟进'))
    return 'follow'
  if (value.includes('报价'))
    return 'quoted'
  return 'new'
}

function normalizeIntent(value: string): IntentLevel {
  const text = value.toUpperCase()
  if (['A', 'B', 'C', 'D', 'E', 'F'].includes(text))
    return text as IntentLevel
  if (value.includes('高'))
    return 'A'
  if (value.includes('低'))
    return 'E'
  if (value.includes('无效'))
    return 'F'
  return 'C'
}

function customerContact(customer: CrmCustomer) {
  return firstText(customer.phone, customer.wechat, customer.contact)
}

const sampleCustomer = computed(() => customers.value.find(customer => customer.id === sampleDialogCustomerId.value))

function trackingUrl(trackingNo: string) {
  return `https://www.kuaidi100.com/chaxun?nu=${encodeURIComponent(trackingNo)}`
}

function openSampleDialog(customer: CrmCustomer) {
  sampleDialogCustomerId.value = customer.id
  sampleForm.value = {
    sampleSent: customer.sampleSent,
    sampleSpec: customer.sampleSpec,
    sampleTrackingNo: customer.sampleTrackingNo,
  }
}

function closeSampleDialog() {
  sampleDialogCustomerId.value = ''
}

function saveSampleInfo() {
  const customer = sampleCustomer.value
  if (!customer)
    return
  customer.sampleSent = sampleForm.value.sampleSent
  customer.sampleSpec = sampleForm.value.sampleSpec.trim()
  customer.sampleTrackingNo = sampleForm.value.sampleTrackingNo.trim()
  crm.save()
  closeSampleDialog()
}

function customerToLeadRow(customer: CrmCustomer, index: number) {
  return {
    序号: index + 1,
    日期: customer.date,
    客户名称: customer.name,
    客户联系方式: customerContact(customer),
    抖音账号来源: customer.sourceAccount,
    成交属性高中低无效: customer.dealAttribute,
    客户属性BC端: customer.customerAttribute,
    地址: customer.region,
    客户情况沟通内容: customer.communication || customer.remark,
    '数量(平方)': customer.area || '',
    使用时间: customer.usageTime,
    是否寄样品: customer.sampleSent ? '是' : '否',
    样品规格: customer.sampleSpec,
    样品单号: customer.sampleTrackingNo,
  }
}

function rowToCustomer(row: Record<string, any>, index: number) {
  const contactText = firstText(row.客户联系方式, row.联系方式, row.phone, row.contact)
  const assignedUser = canManageLeads.value
    ? users.value.find(user => user.id === selectedUserId.value) || salesUsers.value[0] || activeUser.value
    : activeUser.value

  return {
    id: `import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    date: firstText(row.日期, row.date) || dateOnly(new Date()),
    name: firstText(row.客户名称, row.name, contactText) || '未命名客户',
    contact: firstText(row.联系人, row.contact),
    phone: contactText,
    wechat: firstText(row.微信, row.wechat),
    sourceAccount: firstText(row.抖音账号来源, row.来源, row.sourceAccount),
    dealAttribute: firstText(row.成交属性高中低无效, row.成交属性, row.dealAttribute),
    customerAttribute: firstText(row.客户属性BC端, row.客户属性, row.customerAttribute),
    region: firstText(row.地址, row.region),
    projectType: firstText(row.意向使用场景, row.使用场景, row.projectType, row.scenario) || '待确认',
    scenario: firstText(row.意向使用场景, row.使用场景, row.scenario, row.projectType) || '待确认',
    intentLevel: normalizeIntent(firstText(row.意向等级, row.intentLevel, row.成交属性高中低无效)),
    area: Number(firstText(row['数量(平方)'], row.数量, row.面积, row.area)) || 0,
    usageTime: firstText(row.使用时间, row.usageTime),
    communication: firstText(row.客户情况沟通内容, row.沟通内容, row.communication),
    sampleSent: ['是', '已寄', 'true', '1'].includes(firstText(row.是否寄样品, row.sampleSent).toLowerCase()),
    sampleSpec: firstText(row.样品规格, row.sampleSpec),
    sampleTrackingNo: firstText(row.样品单号, row.sampleTrackingNo),
    stage: normalizeStage(firstText(row.客户状态, row.stage)),
    owner: assignedUser?.displayName || '',
    assignedToUserId: assignedUser?.id || 'owner',
    createdByUserId: activeUser.value?.id || 'owner',
    remark: firstText(row.备注, row.remark),
    followUps: [],
    quotes: [],
  }
}

function exportLeadTable() {
  const rows = filteredCustomers.value.map(customerToLeadRow)
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(leadTableColumns.map(column => [column, '']))], { header: leadTableColumns })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '客资记录')
  XLSX.writeFile(workbook, `客资记录-${dateOnly(new Date())}.xlsx`)
}

function importLeadTable(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = () => {
    const workbook = XLSX.read(reader.result, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)
    const imported = rows.map(rowToCustomer).filter(customer => customer.name || customer.phone || customer.wechat)
    if (imported.length) {
      customers.value = [...imported, ...customers.value]
      crm.save()
    }
    input.value = ''
  }
  reader.readAsArrayBuffer(file)
}

function addCustomer() {
  const id = crm.addCustomer({
    assignedToUserId: activeUser.value?.id || 'owner',
    owner: activeUser.value?.displayName || '',
  })
  router.push(`/crm/customer/${id}`)
}

function deleteCustomer(customerId: string) {
  if (!canDeleteCustomers.value)
    return
  if (!window.confirm('确定删除这条客资吗？删除后无法恢复。'))
    return
  crm.removeCustomer(customerId)
}

function toggleAllFilteredCustomers(event: Event) {
  selectedCustomerIds.value = (event.target as HTMLInputElement).checked ? [...filteredCustomerIds.value] : []
}

function batchDeleteCustomers() {
  if (!canDeleteCustomers.value || !selectedCustomerIds.value.length)
    return
  if (!window.confirm(`确定删除已选中的 ${selectedCustomerIds.value.length} 条客资吗？删除后无法恢复。`))
    return
  const selectedIds = new Set(selectedCustomerIds.value)
  customers.value = customers.value.filter(customer => !selectedIds.has(customer.id))
  selectedCustomerIds.value = []
  crm.save()
}
</script>

<template>
  <main class="customers-page">
    <section class="customers-hero">
      <div>
        <p>CRM 客资系统</p>
        <h1>客户列表</h1>
        <span>完整客资记录，支持横向查看、导入导出、寄样和物流跟踪。</span>
      </div>
      <nav>
        <RouterLink to="/crm">返回首页</RouterLink>
        <button @click="addCustomer">新增客户</button>
        <button @click="exportLeadTable">导出客资</button>
        <label v-if="canManageLeads">导入客资<input type="file" accept=".xlsx,.xls" @change="importLeadTable"></label>
      </nav>
    </section>

    <section v-if="sampleCustomer" class="modal-mask">
      <div class="sample-dialog">
        <header>
          <h2>寄样信息</h2>
          <button @click="closeSampleDialog">关闭</button>
        </header>
        <label class="sample-check">
          <input v-model="sampleForm.sampleSent" type="checkbox">
          已寄样
        </label>
        <label>样品规格
          <textarea v-model="sampleForm.sampleSpec" placeholder="填写样品规格"></textarea>
        </label>
        <label>样品单号
          <input v-model="sampleForm.sampleTrackingNo" placeholder="填写物流单号">
        </label>
        <a v-if="sampleForm.sampleTrackingNo" :href="trackingUrl(sampleForm.sampleTrackingNo)" target="_blank" rel="noopener">查看物流跟踪</a>
        <footer>
          <button @click="closeSampleDialog">取消</button>
          <button class="primary" @click="saveSampleInfo">保存</button>
        </footer>
      </div>
    </section>

    <section class="customers-panel">
      <header>
        <div>
          <h2>完整客资记录表</h2>
          <small>当前显示 {{ filteredCustomers.length }} 条</small>
        </div>
        <div class="customers-tools">
          <input v-model="keyword" placeholder="搜索客户、联系方式、来源、地址、沟通内容">
        </div>
      </header>

      <div class="filter-bar">
        <label v-if="canManageLeads">当前视角
          <select v-model="selectedUserId">
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select>
        </label>
        <div v-if="canDeleteCustomers" class="batch-tools">
          <label class="select-all">
            <input :checked="allFilteredSelected" type="checkbox" @change="toggleAllFilteredCustomers">
            全选
          </label>
          <button :disabled="!selectedCount" @click="batchDeleteCustomers">批量删除 {{ selectedCount ? `(${selectedCount})` : '' }}</button>
        </div>
        <div class="customer-tabs">
          <button
            v-for="filter in customerFilters"
            :key="filter.value"
            :class="{ active: stageFilter === filter.value }"
            @click="stageFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <div class="lead-record-table" :class="{ 'with-select': canDeleteCustomers }">
        <div class="lead-record-head">
          <span v-if="canDeleteCustomers">选择</span>
          <span>序号</span><span>日期</span><span>客户名称</span><span>客户联系方式</span><span>抖音账号来源</span><span>成交属性高中低无效</span><span>客户属性BC端</span><span>地址</span><span>客户情况沟通内容</span><span>数量(平方)</span><span>使用时间</span><span>负责人</span><span>状态</span><span>寄样</span><span>操作</span>
        </div>
        <article v-for="(customer, index) in filteredCustomers" :key="customer.id" @click="router.push(`/crm/customer/${customer.id}`)">
          <span v-if="canDeleteCustomers" class="select-cell">
            <input v-model="selectedCustomerIds" :value="customer.id" type="checkbox" @click.stop>
          </span>
          <span>{{ index + 1 }}</span>
          <span>{{ customer.date }}</span>
          <strong>{{ customer.name }}</strong>
          <span>{{ customerContact(customer) || '未填' }}</span>
          <span>{{ customer.sourceAccount || '-' }}</span>
          <span>{{ customer.dealAttribute || '-' }}</span>
          <span>{{ customer.customerAttribute || '-' }}</span>
          <span>{{ customer.region || '-' }}</span>
          <span class="wrap-cell">{{ customer.communication || customer.remark || '-' }}</span>
          <span>{{ customer.area || '-' }}</span>
          <span>{{ customer.usageTime || '-' }}</span>
          <span>{{ customer.owner || '未分配' }}</span>
          <strong class="stage-badge">{{ stageLabels[customer.stage] }}</strong>
          <span class="sample-cell">
            <button @click.stop="openSampleDialog(customer)">{{ customer.sampleSent ? '已寄样' : '寄样' }}</button>
            <a v-if="customer.sampleTrackingNo" :href="trackingUrl(customer.sampleTrackingNo)" target="_blank" rel="noopener" @click.stop>物流跟踪</a>
          </span>
          <button v-if="canDeleteCustomers" class="delete-customer" @click.stop="deleteCustomer(customer.id)">删除</button>
          <span v-else>-</span>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.customers-page{min-height:100vh;background:#eef3f8;padding:24px;color:#142235}
.customers-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1920px;margin:0 auto 18px;padding:26px;border-radius:18px;background:linear-gradient(135deg,#10243f,#1f5f8b);color:#fff}
.customers-hero p{margin:0 0 8px;color:#cce5ff;font-weight:800}
.customers-hero h1{margin:0;font-size:34px}
.customers-hero span{display:block;margin-top:8px;color:#d9edff}
.customers-hero nav,.customers-tools,.filter-bar,.customer-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.customers-hero a,.customers-hero button,.customers-hero label{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:rgba(255,255,255,.12);color:#fff;padding:9px 14px;text-decoration:none;font-weight:800;cursor:pointer}
.customers-hero button,.customers-hero label{background:#2f8cff;border-color:#65b7ff}
.customers-hero label input{display:none}
.customers-panel{max-width:1920px;margin:0 auto;border:1px solid #d7e2ee;border-radius:16px;background:#fff;padding:20px;box-shadow:0 12px 34px rgba(38,59,84,.075)}
.customers-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
h2{margin:0;font-size:22px}
.customers-panel small{display:block;margin-top:5px;color:#64748b;font-weight:800}
.customers-tools{min-width:420px}
.customers-tools input,.filter-bar select{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.customers-tools input{flex:1;min-width:340px}
.filter-bar{justify-content:space-between;margin-bottom:12px;padding:12px;border:1px solid #dbe6f2;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#f1f7ff)}
.filter-bar label{display:flex;align-items:center;gap:8px;color:#183f68;font-weight:900}
.batch-tools{display:flex;align-items:center;gap:8px}
.batch-tools .select-all{display:flex;align-items:center;gap:6px;color:#183f68;font-weight:900}
.batch-tools .select-all input,.select-cell input{width:16px;height:16px;min-height:0}
.batch-tools button{min-height:34px;border:1px solid #ffd3d3;border-radius:10px;background:#fff5f5;color:#d92929;padding:7px 12px;font-weight:900;cursor:pointer}
.batch-tools button:disabled{opacity:.45;cursor:not-allowed}
.customer-tabs{border:1px solid #dbe6f2;border-radius:12px;background:#f8fafc;padding:4px}
.customer-tabs button{min-height:32px;border:0;border-radius:9px;background:transparent;color:#50627a;padding:6px 12px;font-weight:900;cursor:pointer;white-space:nowrap}
.customer-tabs button.active{background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.2)}
.lead-record-table{overflow:auto;border:1px solid #dbe6f2;border-radius:12px;background:#fff}
.lead-record-head,.lead-record-table article{display:grid;grid-template-columns:52px 96px 128px 130px 120px 120px 110px 130px 220px 92px 110px 110px 92px 140px 76px;min-width:1720px;align-items:stretch}
.lead-record-table.with-select .lead-record-head,.lead-record-table.with-select article{grid-template-columns:42px 52px 96px 128px 130px 120px 120px 110px 130px 220px 92px 110px 110px 92px 140px 76px;min-width:1762px}
.lead-record-head{position:sticky;top:0;z-index:1;background:#9fe5df;color:#10243f;font-size:13px;font-weight:900}
.lead-record-head span,.lead-record-table article span,.lead-record-table article strong{display:flex;align-items:center;min-height:46px;border-right:1px solid #7fc7c1;border-bottom:1px solid #dbe6f2;padding:8px;line-height:1.35}
.lead-record-table article{background:#fbfdff;cursor:pointer}
.lead-record-table article:hover{background:#f0f8ff}
.lead-record-table article strong{color:#10243f}
.lead-record-table .wrap-cell{white-space:normal}
.stage-badge{justify-content:center;color:#246ed8!important;background:#eff6ff;font-weight:900}
.select-cell{justify-content:center}
.sample-cell{display:flex!important;align-items:center;gap:6px}
.sample-cell button,.sample-cell a{min-height:30px;border:1px solid #bdd5f2;border-radius:8px;background:#eff6ff;color:#246ed8;padding:5px 8px;text-decoration:none;font-weight:900;cursor:pointer}
.sample-cell a{background:#fff;color:#183f68}
.delete-customer{min-height:34px;border:1px solid #ffd3d3;border-radius:10px;background:#fff5f5;color:#d92929;padding:7px 12px;font-weight:900;cursor:pointer}
.delete-customer:hover{background:#ffe8e8;border-color:#ffb9b9}
.modal-mask{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(15,34,55,.38);padding:20px}
.sample-dialog{width:min(460px,100%);display:grid;gap:12px;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.sample-dialog header,.sample-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sample-dialog label{display:grid;gap:6px;color:#50627a;font-weight:900}
.sample-dialog input,.sample-dialog textarea{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.sample-dialog textarea{min-height:96px;resize:vertical}
.sample-dialog .sample-check{display:flex;align-items:center;gap:8px}
.sample-dialog .sample-check input{width:18px;height:18px;min-height:0}
.sample-dialog button,.sample-dialog a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 12px;text-decoration:none;font-weight:900;cursor:pointer}
.sample-dialog .primary{background:#246ed8;border-color:#246ed8;color:#fff}
@media(max-width:1000px){
  .customers-hero,.customers-panel header,.filter-bar{align-items:flex-start;flex-direction:column}
  .customers-tools{min-width:0;width:100%}
  .customers-tools input{width:100%;min-width:0}
  .customer-tabs{width:100%;overflow:auto}
}
</style>
