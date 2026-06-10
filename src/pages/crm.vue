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
import { dailyLeadCreationSeries, type LeadCreationMode } from '~/features/crm/stats'
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
const leadCreationMode = ref<LeadCreationMode>('all')
const reminderVisible = ref(false)
const reminderDismissed = ref('')
const sampleDialogCustomerId = ref('')
const sampleForm = ref({
  sampleSent: false,
  sampleSpec: '',
  sampleTrackingNo: '',
})
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
const passwordDialogOpen = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const passwordMessage = ref('')

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
const isOwner = computed(() => loginUser.value?.role === 'owner')
const canManageLeads = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager' || Boolean(loginUser.value?.permissions.manageUsers))
const activeUser = computed(() => canManageLeads.value ? users.value.find(user => user.id === selectedUserId.value) || loginUser.value : loginUser.value)
const canDeleteCustomers = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canViewAll = computed(() => canManageLeads.value)
const salesUsers = computed(() => users.value.filter(user => user.enabled && user.role !== 'owner' && user.role !== 'viewer'))

function customerBelongsToUser(customer: CrmCustomer, userId?: string) {
  if (!userId)
    return false

  const user = users.value.find(item => item.id === userId)
  const names = [user?.displayName, user?.account].map(value => String(value || '').trim()).filter(Boolean)
  return customer.assignedToUserId === userId || names.includes(String(customer.owner || '').trim())
}

const scopedCustomers = computed(() => {
  if (!canViewAll.value)
    return customers.value.filter(customer => customerBelongsToUser(customer, activeUser.value?.id))

  const selectedUser = users.value.find(user => user.id === selectedUserId.value)
  if (selectedUser && selectedUser.role !== 'owner')
    return customers.value.filter(customer => customerBelongsToUser(customer, selectedUser.id))

  return customers.value
})

const filteredCustomers = computed(() => scopedCustomers.value.filter((customer) => {
  const text = [customer.name, customer.contact, customer.phone, customer.wechat, customer.region, customer.scenario, customer.projectType, customer.owner].join(' ').toLowerCase()
  const stageMatched = stageFilter.value === '全部'
    || (stageFilter.value === 'active' && !['won', 'lost'].includes(customer.stage))
    || customer.stage === stageFilter.value
  return stageMatched
    && (!keyword.value || text.includes(keyword.value.toLowerCase()))
}))

const previewCustomers = computed(() => filteredCustomers.value.slice(0, 5))

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function firstText(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || ''
}

function hasImportableLeadRow(row: Record<string, any>) {
  return Boolean(firstText(
    row.客户名称,
    row.name,
    row.客户联系方式,
    row.联系方式,
    row.联系人,
    row.contact,
    row.电话,
    row.phone,
    row.微信,
    row.微信号,
    row.wechat,
  ))
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
    important: false,
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
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: false, defval: '' })
    const imported = rows
      .filter(hasImportableLeadRow)
      .map(rowToCustomer)
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

const leadCreationModes: { label: string, value: LeadCreationMode }[] = [
  { label: '全部', value: 'all' },
  { label: '统一新增', value: 'assigned' },
  { label: '自来新增', value: 'self' },
]

const leadCreationStart = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() - 13)
  return dateOnly(date)
})

const leadCreationDays = computed(() => dailyLeadCreationSeries(scopedCustomers.value, leadCreationMode.value, leadCreationStart.value, 14))

const leadCreationPoints = computed(() => {
  const max = Math.max(...leadCreationDays.value.map(day => day.count), 1)
  return leadCreationDays.value.map((day, index) => {
    const x = 34 + index * 38
    const y = 210 - (day.count / max) * 150
    return { ...day, x, y }
  })
})

const leadCreationPolyline = computed(() => leadCreationPoints.value.map(point => `${point.x},${point.y}`).join(' '))

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
    createdByUserId: loginUser.value?.id || activeUser.value?.id || 'owner',
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

function openPasswordDialog() {
  passwordDialogOpen.value = true
  passwordMessage.value = ''
  passwordForm.value = {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  }
}

function closePasswordDialog() {
  passwordDialogOpen.value = false
}

function changeCurrentPassword() {
  const form = passwordForm.value
  if (!form.newPassword.trim()) {
    passwordMessage.value = '请输入新密码'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    passwordMessage.value = '两次输入的新密码不一致'
    return
  }
  if (!admin.updateOwnPassword(form.oldPassword, form.newPassword)) {
    passwordMessage.value = '原密码不正确'
    return
  }
  passwordMessage.value = '密码已修改，并同步到后台账号管理'
  passwordForm.value = {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  }
  setTimeout(() => {
    passwordDialogOpen.value = false
  }, 700)
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
        <button @click="openPasswordDialog">修改密码</button>
        <button class="logout-btn" @click="handleLogout">退出登录</button>
      </nav>
    </section>

    <section v-if="passwordDialogOpen" class="modal-mask">
      <div class="password-dialog">
        <header>
          <h2>修改当前账号密码</h2>
          <button @click="closePasswordDialog">关闭</button>
        </header>
        <label>原密码<input v-model="passwordForm.oldPassword" autocomplete="current-password" type="password" placeholder="输入当前密码"></label>
        <label>新密码<input v-model="passwordForm.newPassword" autocomplete="new-password" type="password" placeholder="输入新密码"></label>
        <label>确认新密码<input v-model="passwordForm.confirmPassword" autocomplete="new-password" type="password" placeholder="再次输入新密码"></label>
        <p v-if="passwordMessage" class="password-message">{{ passwordMessage }}</p>
        <footer>
          <button @click="closePasswordDialog">取消</button>
          <button class="primary" @click="changeCurrentPassword">保存密码</button>
        </footer>
      </div>
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

    <section class="crm-metrics">
      <article><span>可见客户</span><b>{{ scopedCustomers.length }}</b><small>{{ canViewAll ? '全部客户信息' : '仅自己的客户信息' }}</small></article>
      <article><span>昨日成交</span><b>¥{{ salesStats.yesterday.toFixed(2) }}</b><small>昨日已成交金额</small></article>
      <article><span>本月成交</span><b>¥{{ salesStats.month.toFixed(2) }}</b><small>本月已成交金额</small></article>
      <article><span>成交客户</span><b>{{ salesStats.wonCustomers }}</b><small>按已成交客户统计</small></article>
    </section>

    <section class="crm-grid" :class="{ 'owner-grid': isOwner }">
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

      <article v-if="isOwner" class="lead-creation-panel">
        <header>
          <h2>每日新增客资曲线</h2>
          <div class="rank-switch">
            <button v-for="item in leadCreationModes" :key="item.value" :class="{ active: leadCreationMode === item.value }" @click="leadCreationMode = item.value">{{ item.label }}</button>
          </div>
        </header>
        <svg viewBox="0 0 560 250" role="img" aria-label="每日新增客资曲线">
          <line x1="30" y1="210" x2="535" y2="210" />
          <polyline :points="leadCreationPolyline" />
          <g v-for="point in leadCreationPoints" :key="point.date">
            <circle :cx="point.x" :cy="point.y" r="5" />
            <text :x="point.x" y="235">{{ point.label }}</text>
            <text :x="point.x" :y="point.y - 10">{{ point.count }}</text>
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
          <div class="batch-assign">
            <span>批量分配</span>
            <select v-model="leadForm.assignedToUserId">
              <option v-for="user in salesUsers" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
            </select>
            <label>上传表格<input type="file" accept=".xlsx,.xls" @change="importLeadTable"></label>
          </div>
        </div>
      </article>
    </section>

    <section class="crm-panel">
      <header>
        <div>
          <h2>客户列表预览</h2>
          <small>首页显示前 5 条，完整表格请进入客户列表页面</small>
        </div>
        <div class="crm-tools">
          <input v-model="keyword" placeholder="搜索客户、联系人、电话、微信、场景">
          <RouterLink class="view-all-link" to="/crm/customers">客户管理</RouterLink>
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
          <span>序号</span><span>日期</span><span>客户名称</span><span>客户联系方式</span><span>抖音账号来源</span><span>成交属性高中低无效</span><span>客户属性BC端</span><span>地址</span><span>客户情况沟通内容</span><span>数量(平方)</span><span>使用时间</span><span>负责人</span><span>状态</span>
        </div>
        <article v-for="(customer, index) in previewCustomers" :key="customer.id" @click="router.push(`/crm/customer/${customer.id}`)">
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
        </article>
        <div v-if="!previewCustomers.length" class="empty-preview">暂无符合条件的客户</div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.crm-page{min-height:100vh;background:#eef3f8;padding:14px;color:#142235}
.crm-hero{display:flex;align-items:center;justify-content:space-between;gap:14px;max-width:1500px;margin:0 auto 10px;padding:16px 20px;border-radius:16px;background:linear-gradient(135deg,#10243f,#1f5f8b);color:#fff}
.crm-hero p{margin:0 0 5px;color:#cce5ff;font-size:12px;font-weight:800}
.crm-hero h1{margin:0;font-size:26px}
.crm-hero nav{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.crm-hero a,.crm-hero button{min-height:34px;border:1px solid rgba(255,255,255,.36);border-radius:9px;background:rgba(255,255,255,.12);color:#fff;padding:7px 11px;text-decoration:none;font-size:13px;font-weight:800;cursor:pointer}
.crm-hero a.primary-link{border-color:#65b7ff;background:#2f8cff}
.crm-hero button.logout-btn{border-color:rgba(255,255,255,.72);background:#fff;color:#183f68}
.user-view{display:flex;align-items:center;gap:8px;color:#d9edff;font-size:13px;font-weight:800}
.user-view select{min-height:38px;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:#fff;color:#183f68;padding:7px 10px}
.reminder-mask,.modal-mask{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(15,34,55,.38);padding:20px}
.reminder-dialog{width:min(760px,100%);max-height:80vh;overflow:auto;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.reminder-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.reminder-dialog header button,.reminder-actions button{min-height:36px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 12px;font-weight:900;cursor:pointer}
.sample-dialog{width:min(460px,100%);display:grid;gap:12px;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.sample-dialog header,.sample-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sample-dialog label{display:grid;gap:6px;color:#50627a;font-weight:900}
.sample-dialog input,.sample-dialog textarea{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.sample-dialog textarea{min-height:96px;resize:vertical}
.sample-dialog .sample-check{display:flex;align-items:center;gap:8px}
.sample-dialog .sample-check input{width:18px;height:18px;min-height:0}
.sample-dialog button,.sample-dialog a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 12px;text-decoration:none;font-weight:900;cursor:pointer}
.sample-dialog .primary{background:#246ed8;border-color:#246ed8;color:#fff}
.password-dialog{width:min(420px,100%);display:grid;gap:12px;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.password-dialog header,.password-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}
.password-dialog h2{margin:0}
.password-dialog label{display:grid;gap:6px;color:#50627a;font-weight:900}
.password-dialog input{min-height:42px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.password-dialog button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 12px;text-decoration:none;font-weight:900;cursor:pointer}
.password-dialog .primary{background:#246ed8;border-color:#246ed8;color:#fff}
.password-message{margin:0;color:#246ed8;font-weight:900}
.reminder-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:14px;margin-bottom:10px}
.reminder-row p{margin:4px 0;color:#64748b}
.reminder-row span{color:#263b53}
.reminder-actions{display:flex;gap:8px}
.reminder-actions button:last-child{background:#246ed8;border-color:#246ed8;color:#fff}
.crm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:1500px;margin:0 auto 10px}
.crm-metrics article,.crm-panel,.chart-panel,.lead-creation-panel,.lead-panel,.ranking-panel{border:1px solid #d7e2ee;border-radius:16px;background:#fff;box-shadow:0 12px 34px rgba(38,59,84,.075)}
.crm-metrics article{padding:12px 14px}
.crm-metrics span{display:block;color:#64748b;font-size:12px;font-weight:800}
.crm-metrics b{display:block;margin-top:5px;color:#10243f;font-size:22px}
.crm-metrics small{display:block;margin-top:3px;color:#738196;font-size:12px}
.crm-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);grid-template-areas:"chart ranking" "chart lead";gap:12px;max-width:1500px;margin:0 auto 10px;align-items:stretch}
.crm-grid.owner-grid{grid-template-areas:"chart ranking" "leadCreation lead"}
.chart-panel,.lead-creation-panel,.lead-panel,.ranking-panel,.crm-panel{padding:14px}
.chart-panel{grid-area:chart;display:flex;flex-direction:column}
.lead-creation-panel{grid-area:leadCreation;display:flex;flex-direction:column}
.ranking-panel{grid-area:ranking}
.lead-panel{grid-area:lead}
.ranking-panel{min-height:230px;display:flex;flex-direction:column}
.chart-panel header,.lead-creation-panel header,.lead-panel header,.ranking-panel header,.crm-panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
h2{margin:0;font-size:17px}
.crm-panel small{display:block;margin-top:5px;color:#64748b;font-weight:800}
.chart-panel header span,.lead-panel header span{color:#64748b;font-weight:800}
.rank-switch{display:flex;gap:6px;border:1px solid #dbe6f2;border-radius:999px;background:#f8fafc;padding:4px}
.rank-switch button{border:0;border-radius:999px;background:transparent;color:#50627a;padding:5px 9px;font-size:12px;font-weight:900;cursor:pointer}
.rank-switch button.active{background:#246ed8;color:#fff}
.rank-list{display:grid;gap:8px;max-height:270px;min-height:170px;overflow:auto;padding-right:4px}
.rank-list::-webkit-scrollbar{width:6px}
.rank-list::-webkit-scrollbar-thumb{border-radius:999px;background:#c8d7e8}
.rank-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:58px;border:1px solid #e1e9f2;border-radius:11px;background:#fbfdff;padding:9px 10px}
.rank-row strong{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:#eaf3ff;color:#246ed8;font-size:12px}
.rank-row b{display:block;color:#10243f}
.rank-row span{display:block;margin:2px 0 5px;color:#64748b;font-size:11px;font-weight:800}
.rank-row i{display:block;height:6px;border-radius:999px;background:linear-gradient(90deg,#246ed8,#3fb6ff)}
.rank-row em{color:#10243f;font-style:normal;font-weight:900}
.chart-panel svg,.lead-creation-panel svg{width:100%;min-height:250px;flex:1}
.lead-creation-panel svg{min-height:215px}
.chart-panel svg line,.lead-creation-panel svg line{stroke:#dbe5f0;stroke-width:2}
.chart-panel svg polyline,.lead-creation-panel svg polyline{fill:none;stroke:#2f8cff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.lead-creation-panel svg polyline{stroke:#25a18e}
.chart-panel svg circle,.lead-creation-panel svg circle{fill:#fff;stroke:#2f8cff;stroke-width:3}
.lead-creation-panel svg circle{stroke:#25a18e}
.chart-panel svg text,.lead-creation-panel svg text{fill:#50627a;font-size:12px;text-anchor:middle}
.lead-form{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.lead-form input,.lead-form select,.lead-form button,.crm-tools select,.crm-tools input,.crm-tools button,.crm-tools label{min-height:32px;border:1px solid #d5dee9;border-radius:9px;background:#f8fafc;padding:6px 10px;color:#142235;font-size:12px}
.lead-form button{grid-column:1/-1;background:#246ed8;color:#fff;border-color:#246ed8;font-weight:900;cursor:pointer}
.batch-assign{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr 108px;align-items:center;gap:8px;border:1px solid #dbe6f2;border-radius:10px;background:#f6faff;padding:7px}
.batch-assign span{color:#183f68;font-weight:900;white-space:nowrap}
.batch-assign label{display:inline-flex;align-items:center;justify-content:center;min-height:32px;border:1px solid #246ed8;border-radius:9px;background:#246ed8;color:#fff;padding:6px 10px;font-size:12px;font-weight:900;cursor:pointer}
.batch-assign label input{display:none}
.crm-panel{max-width:1500px;margin:0 auto}
.crm-tools{display:flex;align-items:center;gap:10px;min-width:360px}
.crm-tools input{flex:1}
.crm-tools button,.crm-tools label,.crm-tools .view-all-link{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:1px solid #246ed8;border-radius:10px;background:#246ed8;color:#fff;padding:8px 12px;text-decoration:none;font-weight:900;white-space:nowrap;cursor:pointer}
.crm-tools label input{display:none}
.customer-filter-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 12px;padding:12px;border:1px solid #dbe6f2;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#f1f7ff)}
.customer-filter-bar b{color:#183f68;font-size:15px;white-space:nowrap}
.customer-tabs{display:flex;gap:6px;border:1px solid #dbe6f2;border-radius:12px;background:#f8fafc;padding:4px}
.customer-tabs button{min-height:32px;border:0;border-radius:9px;background:transparent;color:#50627a;padding:6px 12px;font-weight:900;cursor:pointer;white-space:nowrap}
.customer-tabs button.active{background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.2)}
.intent-strip{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.intent-strip span{border-radius:999px;background:#eff6ff;color:#246ed8;padding:7px 11px;font-weight:900}
.lead-record-table{overflow:hidden;border:1px solid #dbe6f2;border-radius:12px;background:#fff}
.lead-record-head,.lead-record-table article{display:grid;grid-template-columns:42px 78px minmax(86px,1fr) minmax(96px,1.05fr) minmax(86px,.9fr) minmax(88px,.9fr) minmax(76px,.75fr) minmax(92px,.9fr) minmax(140px,1.45fr) 74px 82px 84px 64px;align-items:stretch}
.lead-record-head{position:sticky;top:0;z-index:1;background:#9fe5df;color:#10243f;font-size:13px;font-weight:900}
.lead-record-head span,.lead-record-table article span,.lead-record-table article strong{display:flex;align-items:center;min-width:0;min-height:46px;border-right:1px solid #7fc7c1;border-bottom:1px solid #dbe6f2;padding:7px;line-height:1.35;overflow:hidden;overflow-wrap:anywhere}
.lead-record-table article{background:#fbfdff;cursor:pointer}
.lead-record-table article:hover{background:#f0f8ff}
.lead-record-table article strong{color:#10243f}
.lead-record-table .wrap-cell{white-space:normal}
.stage-badge{justify-content:center;color:#246ed8!important;background:#eff6ff;font-weight:900}
.sample-cell{display:flex!important;align-items:center;gap:6px}
.sample-cell button,.sample-cell a{min-height:30px;border:1px solid #bdd5f2;border-radius:8px;background:#eff6ff;color:#246ed8;padding:5px 8px;text-decoration:none;font-weight:900;cursor:pointer}
.sample-cell a{background:#fff;color:#183f68}
.delete-customer{min-height:34px;border:1px solid #ffd3d3;border-radius:10px;background:#fff5f5;color:#d92929;padding:7px 12px;font-weight:900;cursor:pointer}
.delete-customer:hover{background:#ffe8e8;border-color:#ffb9b9}
.empty-preview{padding:22px;text-align:center;color:#64748b;font-weight:900}
@media(max-width:1000px){
  .crm-hero,.crm-panel header,.chart-panel header,.lead-creation-panel header,.lead-panel header,.ranking-panel header{align-items:flex-start;flex-direction:column}
  .crm-metrics,.crm-grid{grid-template-columns:1fr 1fr}
  .crm-grid{grid-template-columns:1fr;grid-template-areas:"chart" "ranking" "lead"}
  .crm-grid.owner-grid{grid-template-areas:"chart" "leadCreation" "ranking" "lead"}
  .chart-panel svg{min-height:280px}
  .rank-list{max-height:260px}
  .crm-tools{min-width:0;width:100%;flex-direction:column}
  .customer-filter-bar{align-items:flex-start;flex-direction:column}
  .customer-tabs{width:100%;overflow:auto}
}
</style>

