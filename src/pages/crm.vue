<route lang="json">
{
  "meta": {
    "title": "CRM",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import * as XLSX from 'xlsx'
import { storeToRefs } from 'pinia'
import { useAuth } from '~/composables/useAuth'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import type { CrmCustomer, IntentLevel } from '~/stores/crm'

const router = useRouter()
const crm = useCrmStore()
const admin = useAdminStore()
const { logout } = useAuth()
const { customers } = storeToRefs(crm)
const { users } = storeToRefs(admin)

const keyword = ref('')
const stageFilter = ref('全部')
const selectedUserId = ref(admin.currentUser?.id || 'owner')
const reminderVisible = ref(false)
const reminderDismissed = ref('')
const leadForm = ref({
  name: '',
  contact: '',
  phone: '',
  wechat: '',
  scenario: '',
  sourceAccount: '',
  dealAttribute: '',
  customerAttribute: '',
  region: '',
  area: 0,
  usageTime: '',
  communication: '',
  intentLevel: 'C' as IntentLevel,
  assignedToUserId: 'owner',
})

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

const intentLabels: Record<IntentLevel, string> = {
  A: 'A 高意向',
  B: 'B 较高',
  C: 'C 普通',
  D: 'D 待培养',
  E: 'E 低意向',
  F: 'F 无效/暂缓',
}

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
const activeUser = computed(() => canManageLeads.value ? users.value.find(user => user.id === selectedUserId.value) || loginUser.value : loginUser.value)
const canDeleteCustomers = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canViewAll = computed(() => canManageLeads.value)
const salesUsers = computed(() => users.value.filter(user => user.enabled && user.role !== 'owner' && user.role !== 'viewer'))

const scopedCustomers = computed(() => canViewAll.value
  ? customers.value
  : customers.value.filter(customer => customer.assignedToUserId === activeUser.value?.id))

const filteredCustomers = computed(() => scopedCustomers.value.filter((customer) => {
  const text = [customer.name, customer.contact, customer.phone, customer.wechat, customer.region, customer.scenario, customer.projectType, customer.owner].join(' ').toLowerCase()
  const stageMatched = stageFilter.value === '全部'
    || (stageFilter.value === 'active' && !['won', 'lost'].includes(customer.stage))
    || customer.stage === stageFilter.value
  return stageMatched
    && (!keyword.value || text.includes(keyword.value.toLowerCase()))
}))

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
    ? users.value.find(user => user.id === leadForm.value.assignedToUserId) || salesUsers.value[0] || activeUser.value
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

function startOfMonth() {
  const date = new Date()
  date.setDate(1)
  return dateOnly(date)
}

function dealAmountSince(start: string, end?: string, source = scopedCustomers.value) {
  return source.reduce((sum, customer) => {
    return sum + customer.quotes
      .filter(quote => quote.isWon && (quote.dealDate || quote.date) >= start && (!end || (quote.dealDate || quote.date) <= end))
      .reduce((inner, quote) => inner + (quote.dealAmount || quote.amount), 0)
  }, 0)
}

function dealCountSince(start: string, end?: string, source = scopedCustomers.value) {
  return source.reduce((sum, customer) => {
    return sum + customer.quotes
      .filter(quote => quote.isWon && (quote.dealDate || quote.date) >= start && (!end || (quote.dealDate || quote.date) <= end))
      .length
  }, 0)
}

const yesterday = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return dateOnly(date)
})

const salesStats = computed(() => ({
  yesterday: dealAmountSince(yesterday.value, yesterday.value),
  month: dealAmountSince(startOfMonth()),
  wonCustomers: scopedCustomers.value.filter(customer => customer.stage === 'won' || customer.quotes.some(quote => quote.isWon)).length,
}))

const salesRanking = computed(() => {
  const start = startOfMonth()
  return salesUsers.value
    .map((user) => {
      const userCustomers = customers.value.filter(customer => customer.assignedToUserId === user.id)
      return {
        id: user.id,
        name: user.displayName || user.account,
        amount: dealAmountSince(start, undefined, userCustomers),
        dealCount: dealCountSince(start, undefined, userCustomers),
      }
    })
    .sort((a, b) => b.amount - a.amount)
})

const rankingMax = computed(() => Math.max(...salesRanking.value.map(item => item.amount), 1))

const trendMonths = computed(() => {
  const months: { label: string, amount: number }[] = []
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - index)
    const start = dateOnly(date)
    const endDate = new Date(date)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)
    months.push({
      label: `${date.getFullYear().toString().slice(2)}/${date.getMonth() + 1}`,
      amount: dealAmountSince(start, dateOnly(endDate)),
    })
  }
  return months
})

const trendPoints = computed(() => {
  const max = Math.max(...trendMonths.value.map(month => month.amount), 1)
  return trendMonths.value.map((month, index) => {
    const x = 34 + index * 45
    const y = 210 - (month.amount / max) * 150
    return { ...month, x, y }
  })
})

const trendPolyline = computed(() => trendPoints.value.map(point => `${point.x},${point.y}`).join(' '))

const intentCounts = computed(() => (['A', 'B', 'C', 'D', 'E', 'F'] as IntentLevel[]).map(level => ({
  level,
  count: scopedCustomers.value.filter(customer => customer.intentLevel === level).length,
})))

const dueReminders = computed(() => {
  const todayKey = dateOnly(new Date())
  return scopedCustomers.value.flatMap(customer =>
    customer.followUps
      .filter(follow => follow.reminderDate && follow.reminderDate <= todayKey && !follow.reminderDone)
      .map(follow => ({
        customerId: customer.id,
        customerName: customer.name,
        owner: customer.owner,
        contact: customer.phone || customer.wechat || customer.contact,
        reminderDate: follow.reminderDate || '',
        reminderTime: follow.reminderTime || '',
        content: follow.content,
        nextAction: follow.nextAction,
        followId: follow.id,
      })),
  ).sort((a, b) => a.reminderDate.localeCompare(b.reminderDate))
})

watch([dueReminders, selectedUserId], () => {
  const key = `${selectedUserId.value}-${dateOnly(new Date())}-${dueReminders.value.length}`
  reminderVisible.value = dueReminders.value.length > 0 && reminderDismissed.value !== key
}, { immediate: true })

watch(salesUsers, (nextUsers) => {
  if (!canManageLeads.value)
    return
  if (!nextUsers.some(user => user.id === leadForm.value.assignedToUserId))
    leadForm.value.assignedToUserId = nextUsers[0]?.id || ''
}, { immediate: true })

function closeReminder() {
  reminderDismissed.value = `${selectedUserId.value}-${dateOnly(new Date())}-${dueReminders.value.length}`
  reminderVisible.value = false
}

function finishReminder(item: { customerId: string, followId: string }) {
  const target = customers.value.find(customer => customer.id === item.customerId)
  const follow = target?.followUps.find(record => record.id === item.followId)
  if (follow)
    follow.reminderDone = true
  crm.save()
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

function assignLead() {
  if (!canManageLeads.value)
    return
  crm.addLead({
    ...leadForm.value,
    owner: users.value.find(user => user.id === leadForm.value.assignedToUserId)?.displayName || '',
    createdByUserId: activeUser.value?.id || 'owner',
  })
  leadForm.value = {
    name: '',
    contact: '',
    phone: '',
    wechat: '',
    scenario: '',
    sourceAccount: '',
    dealAttribute: '',
    customerAttribute: '',
    region: '',
    area: 0,
    usageTime: '',
    communication: '',
    intentLevel: 'C',
    assignedToUserId: leadForm.value.assignedToUserId,
  }
}

async function handleLogout() {
  await logout()
  await router.push('/login')
}
</script>

<template>
  <main class="crm-page">
    <section class="crm-hero">
      <div>
        <p>CRM 客资系统</p>
        <h1>客户、客资分配、跟进、报价一体管理</h1>
      </div>
      <nav>
        <label v-if="canManageLeads" class="user-view">当前视角
          <select v-model="selectedUserId">
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select>
        </label>
        <RouterLink class="primary-link" to="/quote">进入报价</RouterLink>
        <RouterLink v-if="canManageLeads" to="/admin">管理后台</RouterLink>
        <button @click="addCustomer">新增客户</button>
        <button class="logout-btn" @click="handleLogout">退出登录</button>
      </nav>
    </section>

    <section v-if="reminderVisible" class="reminder-mask">
      <div class="reminder-dialog">
        <header>
          <h2>客户跟进提醒</h2>
          <button @click="closeReminder">关闭</button>
        </header>
        <article v-for="item in dueReminders" :key="`${item.customerId}-${item.followId}`" class="reminder-row">
          <div>
            <b>{{ item.customerName }}</b>
            <p>{{ item.reminderDate }} {{ item.reminderTime || '' }} · {{ item.contact || '未填联系方式' }}</p>
            <span>{{ item.nextAction || item.content || '需要跟进' }}</span>
          </div>
          <div class="reminder-actions">
            <button @click="router.push(`/crm/customer/${item.customerId}`)">查看客户</button>
            <button @click="finishReminder(item)">标记完成</button>
          </div>
        </article>
      </div>
    </section>

    <section class="crm-metrics">
      <article><span>可见客户</span><b>{{ scopedCustomers.length }}</b><small>{{ canViewAll ? '全部客户信息' : '仅自己的客户信息' }}</small></article>
      <article><span>昨日成交</span><b>¥{{ salesStats.yesterday.toFixed(2) }}</b><small>昨日已成交金额</small></article>
      <article><span>本月成交</span><b>¥{{ salesStats.month.toFixed(2) }}</b><small>本月已成交金额</small></article>
      <article><span>成交客户</span><b>{{ salesStats.wonCustomers }}</b><small>按已成交客户统计</small></article>
    </section>

    <section class="crm-grid">
      <article class="chart-panel">
        <header>
          <h2>每月成交额曲线</h2>
          <span>{{ canViewAll ? '全部客户成交额' : '个人客户成交额' }}</span>
        </header>
        <svg viewBox="0 0 560 250" role="img" aria-label="每月成交额曲线">
          <line x1="30" y1="210" x2="535" y2="210" />
          <polyline :points="trendPolyline" />
          <g v-for="point in trendPoints" :key="point.label">
            <circle :cx="point.x" :cy="point.y" r="5" />
            <text :x="point.x" y="235">{{ point.label }}</text>
            <text :x="point.x" :y="point.y - 10">¥{{ Math.round(point.amount) }}</text>
          </g>
        </svg>
      </article>

      <article class="ranking-panel">
        <header>
          <h2>本月成交排名</h2>
          <span>所有销售可见</span>
        </header>
        <div class="rank-list">
          <article v-for="(item, index) in salesRanking" :key="item.id" class="rank-row">
            <strong>{{ index + 1 }}</strong>
            <div>
              <b>{{ item.name }}</b>
              <span>{{ item.dealCount }} 单</span>
              <i :style="{ width: `${Math.max(8, (item.amount / rankingMax) * 100)}%` }"></i>
            </div>
            <em>¥{{ item.amount.toFixed(2) }}</em>
          </article>
        </div>
      </article>

      <article v-if="canManageLeads" class="lead-panel">
        <header><h2>客资分配</h2><span>只填电话或微信也可以先分配</span></header>
        <div class="lead-form">
          <input v-model="leadForm.name" placeholder="客户名称，可不填">
          <input v-model="leadForm.contact" placeholder="联系人，可不填">
          <input v-model="leadForm.phone" placeholder="电话">
          <input v-model="leadForm.wechat" placeholder="微信号">
          <input v-model="leadForm.sourceAccount" placeholder="抖音账号来源">
          <input v-model="leadForm.dealAttribute" placeholder="成交属性：高/中/低/无效">
          <input v-model="leadForm.customerAttribute" placeholder="客户属性：B端/C端">
          <input v-model="leadForm.region" placeholder="地址">
          <select v-model="leadForm.intentLevel">
            <option v-for="(label, level) in intentLabels" :key="level" :value="level">{{ label }}</option>
          </select>
          <input v-model="leadForm.scenario" placeholder="意向使用场景">
          <input v-model.number="leadForm.area" type="number" min="0" placeholder="数量(平方)">
          <input v-model="leadForm.usageTime" placeholder="使用时间">
          <input v-model="leadForm.communication" placeholder="客户情况沟通内容">
          <select v-model="leadForm.assignedToUserId">
            <option v-for="user in salesUsers" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select>
          <button @click="assignLead">分配客资</button>
        </div>
      </article>
    </section>

    <section class="crm-panel">
      <header>
        <h2>客户列表</h2>
        <div class="crm-tools">
          <input v-model="keyword" placeholder="搜索客户、联系人、电话、微信、场景">
          <button @click="exportLeadTable">导出客资</button>
          <label v-if="canManageLeads" class="import-leads">导入客资<input type="file" accept=".xlsx,.xls" @change="importLeadTable"></label>
        </div>
      </header>

      <div class="customer-filter-bar">
        <b>客户分类</b>
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

      <div class="intent-strip">
        <span v-for="item in intentCounts" :key="item.level">{{ item.level }}：{{ item.count }}</span>
      </div>

      <div class="lead-record-table">
        <div class="lead-record-head">
          <span>序号</span><span>日期</span><span>客户名称</span><span>客户联系方式</span><span>抖音账号来源</span><span>成交属性高中低无效</span><span>客户属性BC端</span><span>地址</span><span>客户情况沟通内容</span><span>数量(平方)</span><span>使用时间</span><span>负责人</span><span>状态</span><span>是否寄样品</span><span>样品规格</span><span>样品单号</span><span>操作</span>
        </div>
        <article v-for="(customer, index) in filteredCustomers" :key="customer.id" @click="router.push(`/crm/customer/${customer.id}`)">
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
          <span>{{ customer.sampleSent ? '是' : '否' }}</span>
          <span>{{ customer.sampleSpec || '-' }}</span>
          <span>{{ customer.sampleTrackingNo || '-' }}</span>
          <button v-if="canDeleteCustomers" class="delete-customer" @click.stop="deleteCustomer(customer.id)">删除</button>
          <span v-else>-</span>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.crm-page{min-height:100vh;background:#eef3f8;padding:24px;color:#142235}
.crm-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1500px;margin:0 auto 18px;padding:26px;border-radius:18px;background:linear-gradient(135deg,#10243f,#1f5f8b);color:#fff}
.crm-hero p{margin:0 0 8px;color:#cce5ff;font-weight:800}
.crm-hero h1{margin:0;font-size:34px}
.crm-hero nav{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.crm-hero a,.crm-hero button{min-height:40px;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:rgba(255,255,255,.12);color:#fff;padding:9px 14px;text-decoration:none;font-weight:800;cursor:pointer}
.crm-hero a.primary-link{border-color:#65b7ff;background:#2f8cff}
.crm-hero button.logout-btn{border-color:rgba(255,255,255,.72);background:#fff;color:#183f68}
.user-view{display:flex;align-items:center;gap:8px;color:#d9edff;font-size:13px;font-weight:800}
.user-view select{min-height:38px;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:#fff;color:#183f68;padding:7px 10px}
.reminder-mask{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(15,34,55,.38);padding:20px}
.reminder-dialog{width:min(760px,100%);max-height:80vh;overflow:auto;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.reminder-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.reminder-dialog header button,.reminder-actions button{min-height:36px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 12px;font-weight:900;cursor:pointer}
.reminder-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:14px;margin-bottom:10px}
.reminder-row p{margin:4px 0;color:#64748b}
.reminder-row span{color:#263b53}
.reminder-actions{display:flex;gap:8px}
.reminder-actions button:last-child{background:#246ed8;border-color:#246ed8;color:#fff}
.crm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;max-width:1500px;margin:0 auto 18px}
.crm-metrics article,.crm-panel,.chart-panel,.lead-panel,.ranking-panel{border:1px solid #d7e2ee;border-radius:16px;background:#fff;box-shadow:0 12px 34px rgba(38,59,84,.075)}
.crm-metrics article{padding:18px}
.crm-metrics span{display:block;color:#64748b;font-size:13px;font-weight:800}
.crm-metrics b{display:block;margin-top:8px;color:#10243f;font-size:26px}
.crm-metrics small{display:block;margin-top:5px;color:#738196}
.crm-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);grid-template-areas:"chart ranking" "chart lead";gap:18px;max-width:1500px;margin:0 auto 18px;align-items:stretch}
.chart-panel,.lead-panel,.ranking-panel,.crm-panel{padding:20px}
.chart-panel{grid-area:chart;display:flex;flex-direction:column}
.ranking-panel{grid-area:ranking}
.lead-panel{grid-area:lead}
.ranking-panel{min-height:240px;display:flex;flex-direction:column}
.chart-panel header,.lead-panel header,.ranking-panel header,.crm-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
h2{margin:0;font-size:22px}
.chart-panel header span,.lead-panel header span{color:#64748b;font-weight:800}
.rank-switch{display:flex;gap:6px;border:1px solid #dbe6f2;border-radius:999px;background:#f8fafc;padding:4px}
.rank-switch button{border:0;border-radius:999px;background:transparent;color:#50627a;padding:7px 12px;font-weight:900;cursor:pointer}
.rank-switch button.active{background:#246ed8;color:#fff}
.rank-list{display:grid;gap:12px;max-height:none;min-height:156px;overflow:auto;padding-right:4px}
.rank-list::-webkit-scrollbar{width:6px}
.rank-list::-webkit-scrollbar-thumb{border-radius:999px;background:#c8d7e8}
.rank-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:14px}
.rank-row strong{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#eaf3ff;color:#246ed8}
.rank-row b{display:block;color:#10243f}
.rank-row span{display:block;margin:3px 0 7px;color:#64748b;font-size:12px;font-weight:800}
.rank-row i{display:block;height:6px;border-radius:999px;background:linear-gradient(90deg,#246ed8,#3fb6ff)}
.rank-row em{color:#10243f;font-style:normal;font-weight:900}
.chart-panel svg{width:100%;min-height:430px;flex:1}
.chart-panel svg line{stroke:#dbe5f0;stroke-width:2}
.chart-panel svg polyline{fill:none;stroke:#2f8cff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.chart-panel svg circle{fill:#fff;stroke:#2f8cff;stroke-width:3}
.chart-panel svg text{fill:#50627a;font-size:12px;text-anchor:middle}
.lead-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lead-form input,.lead-form select,.lead-form button,.crm-tools select,.crm-tools input,.crm-tools button,.crm-tools label{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.lead-form button{grid-column:1/-1;background:#246ed8;color:#fff;border-color:#246ed8;font-weight:900;cursor:pointer}
.crm-panel{max-width:1500px;margin:0 auto}
.crm-tools{display:flex;align-items:center;gap:10px;min-width:360px}
.crm-tools input{flex:1}
.crm-tools button,.crm-tools label{display:inline-flex;align-items:center;justify-content:center;background:#246ed8;border-color:#246ed8;color:#fff;font-weight:900;white-space:nowrap;cursor:pointer}
.crm-tools label input{display:none}
.customer-filter-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 12px;padding:12px;border:1px solid #dbe6f2;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#f1f7ff)}
.customer-filter-bar b{color:#183f68;font-size:15px;white-space:nowrap}
.customer-tabs{display:flex;gap:6px;border:1px solid #dbe6f2;border-radius:12px;background:#f8fafc;padding:4px}
.customer-tabs button{min-height:32px;border:0;border-radius:9px;background:transparent;color:#50627a;padding:6px 12px;font-weight:900;cursor:pointer;white-space:nowrap}
.customer-tabs button.active{background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.2)}
.intent-strip{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.intent-strip span{border-radius:999px;background:#eff6ff;color:#246ed8;padding:7px 11px;font-weight:900}
.lead-record-table{overflow:auto;border:1px solid #dbe6f2;border-radius:12px;background:#fff}
.lead-record-head,.lead-record-table article{display:grid;grid-template-columns:52px 96px 128px 130px 120px 120px 110px 130px 220px 92px 110px 110px 92px 92px 110px 120px 76px;min-width:1900px;align-items:stretch}
.lead-record-head{position:sticky;top:0;z-index:1;background:#9fe5df;color:#10243f;font-size:13px;font-weight:900}
.lead-record-head span,.lead-record-table article span,.lead-record-table article strong{display:flex;align-items:center;min-height:46px;border-right:1px solid #7fc7c1;border-bottom:1px solid #dbe6f2;padding:8px;line-height:1.35}
.lead-record-table article{background:#fbfdff;cursor:pointer}
.lead-record-table article:hover{background:#f0f8ff}
.lead-record-table article strong{color:#10243f}
.lead-record-table .wrap-cell{white-space:normal}
.stage-badge{justify-content:center;color:#246ed8!important;background:#eff6ff;font-weight:900}
.delete-customer{min-height:34px;border:1px solid #ffd3d3;border-radius:10px;background:#fff5f5;color:#d92929;padding:7px 12px;font-weight:900;cursor:pointer}
.delete-customer:hover{background:#ffe8e8;border-color:#ffb9b9}
@media(max-width:1000px){
  .crm-hero,.crm-panel header,.chart-panel header,.lead-panel header,.ranking-panel header{align-items:flex-start;flex-direction:column}
  .crm-metrics,.crm-grid{grid-template-columns:1fr 1fr}
  .crm-grid{grid-template-columns:1fr;grid-template-areas:"chart" "ranking" "lead"}
  .chart-panel svg{min-height:280px}
  .rank-list{max-height:260px}
  .crm-tools{min-width:0;width:100%;flex-direction:column}
  .customer-filter-bar{align-items:flex-start;flex-direction:column}
  .customer-tabs{width:100%;overflow:auto}
}
</style>

