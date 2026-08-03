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
import { leadImportMessage, summarizeLeadImport } from '~/features/crm/lead-import'
import { sortCustomersByRecentActivity } from '~/features/crm/recent-customers'
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
const isPrivileged = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canViewAll = computed(() => isPrivileged.value || Boolean(loginUser.value?.permissions.viewAllCustomers))
const canManageLeads = computed(() => canViewAll.value || Boolean(loginUser.value?.permissions.manageUsers))
const activeUser = computed(() => canManageLeads.value ? users.value.find(user => user.id === selectedUserId.value) || loginUser.value : loginUser.value)
const canDeleteCustomers = computed(() => isPrivileged.value || Boolean(loginUser.value?.permissions.deleteCustomers))
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

const previewCustomers = computed(() => sortCustomersByRecentActivity(filteredCustomers.value).slice(0, 5))

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

function confirmDuplicateCustomer(payload: Partial<CrmCustomer>) {
  const duplicates = crm.duplicateCustomers(payload)
  if (!duplicates.length)
    return true
  const names = duplicates.slice(0, 5).map(customer => `${customer.name || '未命名'}（${customerContact(customer) || '无联系方式'}）`).join('\n')
  return window.confirm(`系统发现可能重复的客户：\n${names}\n\n仍然继续新增吗？`)
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
    const skippedBlank = rows.length - imported.length
    if (imported.length) {
      customers.value = [...imported, ...customers.value]
      crm.save()
      window.alert(leadImportMessage(summarizeLeadImport(rows.length, imported.length)))
    }
    else if (skippedBlank) {
      window.alert(`未导入客资：表格中 ${skippedBlank} 行没有客户名称或联系方式。`)
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

const dashboardCounts = computed(() => ({
  newCustomers: scopedCustomers.value.filter(customer => customer.stage === 'new').length,
  following: scopedCustomers.value.filter(customer => customer.stage === 'follow').length,
  quoted: scopedCustomers.value.filter(customer => customer.stage === 'quoted').length,
  pending: dueReminders.value.length,
}))

const stageDistribution = computed(() => [
  { label: '新客资', value: dashboardCounts.value.newCustomers, color: '#2487ec' },
  { label: '跟进中', value: dashboardCounts.value.following, color: '#22b7a8' },
  { label: '已报价', value: dashboardCounts.value.quoted, color: '#7d68e8' },
  { label: '已成交', value: salesStats.value.wonCustomers, color: '#f4a22c' },
])

const stageTotal = computed(() => Math.max(stageDistribution.value.reduce((sum, item) => sum + item.value, 0), 1))
const customerConversionRate = computed(() => scopedCustomers.value.length
  ? Math.round((salesStats.value.wonCustomers / scopedCustomers.value.length) * 100)
  : 0)
const stageDonut = computed(() => {
  let offset = 0
  const stops = stageDistribution.value.map((item) => {
    const start = offset
    offset += (item.value / stageTotal.value) * 100
    return `${item.color} ${start}% ${offset}%`
  })
  return { background: `conic-gradient(${stops.join(',')})` }
})

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
  if (!confirmDuplicateCustomer(leadForm.value))
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
        <p>客资 CRM · 销售数据中心</p>
        <h1>上午好，{{ loginUser?.displayName || loginUser?.account || '销售同事' }}</h1>
        <small>今天有 {{ dashboardCounts.pending }} 项跟进待处理，建议优先联系高意向客户</small>
      </div>
      <nav>
        <label v-if="canManageLeads" class="user-view">当前视角
          <select v-model="selectedUserId">
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select>
        </label>
        <button @click="openPasswordDialog">修改密码</button>
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
      <article class="metric-blue"><i>客</i><div><span>客户总览</span><b>{{ scopedCustomers.length }}</b><small>新客 {{ dashboardCounts.newCustomers }} · 跟进中 {{ dashboardCounts.following }}</small></div></article>
      <article class="metric-cyan"><i>日</i><div><span>昨日成交</span><b>¥{{ salesStats.yesterday.toFixed(2) }}</b><small>实时汇总成交金额</small></div></article>
      <article class="metric-violet"><i>月</i><div><span>本月成交</span><b>¥{{ salesStats.month.toFixed(2) }}</b><small>已报价 {{ dashboardCounts.quoted }} 个客户</small></div></article>
      <article class="metric-orange"><i>成</i><div><span>成交客户</span><b>{{ salesStats.wonCustomers }}</b><small>本月完成客户统计</small></div></article>
    </section>

    <section class="executive-grid">
      <article class="executive-card trend-card">
        <header><div><b>销售成交趋势</b><span>近12个月成交金额</span></div><RouterLink to="/crm/statistics">查看数据</RouterLink></header>
        <svg viewBox="0 0 560 250" role="img" aria-label="每月成交额曲线">
          <defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2387ed" stop-opacity=".28"/><stop offset="1" stop-color="#2387ed" stop-opacity="0"/></linearGradient></defs>
          <line x1="30" y1="210" x2="535" y2="210" />
          <polygon :points="`34,210 ${trendPolyline} 529,210`" fill="url(#trendArea)" />
          <polyline :points="trendPolyline" />
          <g v-for="point in trendPoints" :key="point.label"><circle :cx="point.x" :cy="point.y" r="4"/><text :x="point.x" y="235">{{ point.label }}</text></g>
        </svg>
      </article>

      <article class="executive-card stage-card">
        <header><div><b>客户阶段分布</b><span>当前客户转化结构</span></div></header>
        <div class="donut-wrap"><div class="stage-donut" :style="stageDonut"><strong>{{ customerConversionRate }}%<small>成交转化率</small></strong></div></div>
        <div class="stage-legend"><p v-for="item in stageDistribution" :key="item.label"><i :style="{ background: item.color }"></i><span>{{ item.label }}</span><b>{{ item.value }}</b></p></div>
      </article>

      <article class="executive-card todo-card">
        <header><div><b>今日待办</b><span>{{ dashboardCounts.pending }} 项跟进提醒</span></div><RouterLink to="/crm/follow-ups">全部待办</RouterLink></header>
        <div class="todo-list">
          <button v-for="item in dueReminders.slice(0, 5)" :key="`${item.customerId}-${item.followId}`" @click="router.push(`/crm/customer/${item.customerId}`)"><i></i><span><b>{{ item.customerName }}</b><small>{{ item.nextAction || item.content || '需要跟进' }}</small></span><em>{{ item.reminderTime || '今日' }}</em></button>
          <p v-if="!dueReminders.length" class="dashboard-empty">今天没有待跟进事项</p>
        </div>
      </article>

      <article class="executive-card rank-card">
        <header><div><b>销售排名</b><span>本月成交额</span></div></header>
        <div class="compact-ranks"><p v-for="(item,index) in salesRanking.slice(0,5)" :key="item.id"><strong>{{ index + 1 }}</strong><span><b>{{ item.name }}</b><i :style="{ width: `${Math.max(8,(item.amount/rankingMax)*100)}%` }"></i></span><em>¥{{ item.amount.toFixed(0) }}</em></p></div>
      </article>
    </section>

    <section class="recent-section executive-card">
      <header><div><b>最近客户</b><span>按最近活跃时间排序</span></div><RouterLink to="/crm/customers">查看全部</RouterLink></header>
      <div class="recent-customer-grid">
        <button v-for="customer in previewCustomers" :key="customer.id" @click="router.push(`/crm/customer/${customer.id}`)"><i>{{ customer.name.slice(0,1) }}</i><span><b>{{ customer.name }}</b><small>{{ customerContact(customer) || '未填联系方式' }}</small></span><em :data-stage="customer.stage">{{ stageLabels[customer.stage] }}</em><strong>{{ customer.owner || '未分配' }}</strong></button>
        <p v-if="!previewCustomers.length" class="dashboard-empty">暂无客户数据</p>
      </div>
    </section>

    <section v-if="false" class="dashboard-quick">
      <header><div><b>快捷入口</b><span>常用业务一步直达</span></div></header>
      <nav>
        <button @click="addCustomer"><i>＋</i><span>新增客户</span><small>建立客资档案</small></button>
        <RouterLink to="/crm/follow-ups"><i>◷</i><span>今日跟进</span><small>{{ dashboardCounts.pending }} 项待处理</small></RouterLink>
        <RouterLink to="/quote?view=quote"><i>¥</i><span>快速报价</span><small>进入报价计算</small></RouterLink>
        <RouterLink to="/crm/customers"><i>☷</i><span>客户管理</span><small>查看全部客户</small></RouterLink>
        <RouterLink to="/crm/statistics"><i>◔</i><span>数据统计</span><small>分析销售趋势</small></RouterLink>
      </nav>
    </section>

    <section v-if="false" class="crm-grid" :class="{ 'owner-grid': isOwner }">
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

    <section v-if="false" class="crm-panel">
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
          <span :class="{ 'mobile-empty': !customer.sourceAccount }">{{ customer.sourceAccount || '-' }}</span>
          <span :class="{ 'mobile-empty': !customer.dealAttribute }">{{ customer.dealAttribute || '-' }}</span>
          <span :class="{ 'mobile-empty': !customer.customerAttribute }">{{ customer.customerAttribute || '-' }}</span>
          <span :class="{ 'mobile-empty': !customer.region }">{{ customer.region || '-' }}</span>
          <span class="wrap-cell" :class="{ 'mobile-empty': !(customer.communication || customer.remark) }">{{ customer.communication || customer.remark || '-' }}</span>
          <span :class="{ 'mobile-empty': !customer.area }">{{ customer.area || '-' }}</span>
          <span :class="{ 'mobile-empty': !customer.usageTime }">{{ customer.usageTime || '-' }}</span>
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
@media(max-width:720px){
  .crm-page{padding:10px 10px 78px}
  .crm-hero{padding:16px;border-radius:14px}
  .crm-hero h1{font-size:21px;line-height:1.25}
  .crm-hero nav{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .crm-hero nav .user-view{grid-column:1/-1;width:100%;display:grid;grid-template-columns:auto 1fr}
  .user-view select{width:100%}
  .crm-hero a,.crm-hero button{width:100%;justify-content:center;min-height:42px}
  .crm-hero .mobile-admin-link{display:none}
  .crm-metrics{grid-template-columns:1fr 1fr}
  .crm-metrics article{padding:12px}
  .crm-metrics b{font-size:20px}
  .chart-panel,.lead-creation-panel,.lead-panel,.ranking-panel,.crm-panel{padding:12px;border-radius:14px}
  .chart-panel svg,.lead-creation-panel svg{min-height:210px}
  .lead-form{grid-template-columns:1fr}
  .batch-assign{grid-template-columns:1fr}
  .crm-tools input{width:100%}
  .crm-tools button,.crm-tools label,.crm-tools .view-all-link{width:100%}
  .intent-strip{overflow:auto;flex-wrap:nowrap;padding-bottom:3px}
  .intent-strip span{white-space:nowrap}
  .lead-record-table{border:0;background:transparent;display:grid;gap:10px;overflow:visible}
  .lead-record-head{display:none}
  .lead-record-table article{display:grid;grid-template-columns:1fr;gap:0;border:1px solid #dbe6f2;border-radius:14px;background:#fff;overflow:hidden}
  .lead-record-table article span,.lead-record-table article strong{display:grid;grid-template-columns:96px minmax(0,1fr);min-height:0;border-right:0;border-bottom:1px solid #edf2f7;padding:9px 11px;overflow:visible}
  .lead-record-table article span.mobile-empty{display:none}
  .lead-record-table article span:nth-child(1){display:none}
  .lead-record-table article strong{
    grid-template-columns:1fr;
    padding:12px 13px 6px;
    border-bottom:0;
    color:#10243f;
    font-size:17px;
  }
  .lead-record-table article strong::before{display:none}
  .lead-record-table article span:nth-child(2),
  .lead-record-table article span:nth-child(4),
  .lead-record-table article span:nth-child(12){
    grid-template-columns:74px minmax(0,1fr);
    padding-top:6px;
    padding-bottom:6px;
  }
  .lead-record-table article .stage-badge{
    grid-template-columns:74px minmax(0,1fr);
    padding:8px 13px;
    border-top:1px solid #edf2f7;
    background:#f4f8ff;
  }
  .lead-record-table article span::before,.lead-record-table article strong::before{color:#64748b;font-weight:900}
  .lead-record-table article span:nth-child(1)::before{content:"序号"}
  .lead-record-table article span:nth-child(2)::before{content:"日期"}
  .lead-record-table article strong:nth-child(3)::before{content:"客户名称"}
  .lead-record-table article span:nth-child(4)::before{content:"联系方式"}
  .lead-record-table article span:nth-child(5)::before{content:"来源"}
  .lead-record-table article span:nth-child(6)::before{content:"成交属性"}
  .lead-record-table article span:nth-child(7)::before{content:"客户属性"}
  .lead-record-table article span:nth-child(8)::before{content:"地址"}
  .lead-record-table article span:nth-child(9)::before{content:"沟通内容"}
  .lead-record-table article span:nth-child(10)::before{content:"数量"}
  .lead-record-table article span:nth-child(11)::before{content:"使用时间"}
  .lead-record-table article span:nth-child(12)::before{content:"负责人"}
  .lead-record-table article strong:nth-child(13)::before{content:"状态"}
  .stage-badge{justify-content:stretch;text-align:left}
  .lead-record-table article{
    position:relative;
    gap:6px;
    padding:14px;
  }
  .lead-record-table article > *{
    display:none!important;
  }
  .lead-record-table article strong:nth-child(3),
  .lead-record-table article span:nth-child(4),
  .lead-record-table article span:nth-child(12){
    display:grid!important;
    grid-template-columns:74px minmax(0,1fr)!important;
    align-items:center;
    width:100%;
    min-height:0;
    padding:0;
    border:0;
    color:#10243f;
    background:transparent;
    line-height:1.45;
  }
  .lead-record-table article strong:nth-child(3){
    grid-template-columns:1fr!important;
    padding-bottom:4px;
    font-size:18px;
    font-weight:900;
  }
  .lead-record-table article strong:nth-child(3)::before{
    display:none!important;
  }
  .lead-record-table article span:nth-child(4)::before{
    content:"联系方式";
    color:#64748b;
    font-weight:900;
  }
  .lead-record-table article span:nth-child(12)::before{
    content:"跟进人";
    color:#64748b;
    font-weight:900;
  }
  .reminder-dialog,.password-dialog,.sample-dialog{width:100%;max-height:86vh}
}
/* Enterprise dashboard visual system */
.command-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 12px;border:1px solid #e1ebf6;border-radius:14px;background:#fff;padding:13px 16px;box-shadow:0 8px 24px rgba(43,91,139,.045)}.command-bar>div{display:grid;gap:3px}.command-bar b{color:#183653;font-size:15px}.command-bar span{color:#91a1b4;font-size:11px}.command-bar nav{display:flex;gap:8px}.command-bar a,.command-bar button{min-height:34px;border:1px solid #d9e6f3;border-radius:9px;background:#f8fbff;color:#276da9;padding:7px 12px;text-decoration:none;font-size:12px;font-weight:900;cursor:pointer}.command-bar button{border-color:#1d80e8;background:#1d80e8;color:#fff}
.executive-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.55fr) minmax(300px,.7fr);grid-template-areas:"trend stage todo" "trend rank todo";gap:12px;margin-bottom:12px}.executive-card{border:1px solid #e1ebf6;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(43,91,139,.05)}.executive-card>header{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #edf2f7;padding:14px 16px}.executive-card>header div{display:grid;gap:3px}.executive-card>header b{color:#183653;font-size:14px}.executive-card>header span{color:#91a1b4;font-size:10px}.executive-card>header a{color:#2382dc;text-decoration:none;font-size:11px;font-weight:900}.trend-card{grid-area:trend;display:flex;min-height:410px;flex-direction:column}.trend-card svg{width:100%;min-height:300px;flex:1;padding:8px 12px 2px}.trend-card svg line{stroke:#dce8f3;stroke-width:2}.trend-card svg polyline{fill:none;stroke:#2387ed;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.trend-card svg circle{fill:#fff;stroke:#2387ed;stroke-width:3}.trend-card svg text{fill:#7890a7;font-size:11px;text-anchor:middle}.stage-card{grid-area:stage}.donut-wrap{display:grid;place-items:center;padding:18px 12px 10px}.stage-donut{position:relative;display:grid;width:126px;height:126px;place-items:center;border-radius:50%}.stage-donut::after{content:"";position:absolute;width:78px;height:78px;border-radius:50%;background:#fff}.stage-donut strong{position:relative;z-index:1;display:grid;color:#173a5b;font-size:22px;text-align:center}.stage-donut small{color:#91a1b4;font-size:10px}.stage-legend{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 15px}.stage-legend p{display:grid;grid-template-columns:8px 1fr auto;align-items:center;gap:6px;margin:0;color:#657c92;font-size:10px}.stage-legend i{width:8px;height:8px;border-radius:50%}.stage-legend b{color:#294967}.todo-card{grid-area:todo}.todo-list{display:grid;padding:6px 14px}.todo-list button{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:9px;align-items:center;border:0;border-bottom:1px solid #edf2f7;background:#fff;padding:13px 2px;text-align:left;cursor:pointer}.todo-list button>i{width:8px;height:8px;border-radius:50%;background:#22b6a7;box-shadow:0 0 0 4px #e5faf7}.todo-list span{display:grid;gap:3px}.todo-list span b{color:#23415d;font-size:12px}.todo-list span small{overflow:hidden;color:#8294a6;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.todo-list em{color:#2390db;font-size:10px;font-style:normal;font-weight:900}.rank-card{grid-area:rank}.compact-ranks{display:grid;padding:7px 14px}.compact-ranks p{display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:9px;align-items:center;margin:0;padding:8px 0}.compact-ranks>p>strong{display:grid;width:22px;height:22px;place-items:center;border-radius:7px;background:#eaf4ff;color:#247ddd;font-size:10px}.compact-ranks span{display:grid;gap:4px}.compact-ranks span b{color:#294967;font-size:11px}.compact-ranks span i{display:block;height:4px;border-radius:99px;background:linear-gradient(90deg,#2485e9,#24b8bc)}.compact-ranks em{color:#294967;font-size:10px;font-style:normal;font-weight:900}.recent-section{margin-bottom:14px}.recent-customer-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;padding:14px}.recent-customer-grid button{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #e6eef6;border-radius:11px;background:#fbfdff;padding:11px;text-align:left;cursor:pointer}.recent-customer-grid button>i{display:grid;width:38px;height:38px;place-items:center;border-radius:11px;background:linear-gradient(135deg,#e7f3ff,#dff8f6);color:#1c7fd7;font-style:normal;font-weight:900}.recent-customer-grid button>span{display:grid;gap:3px;min-width:0}.recent-customer-grid span b{overflow:hidden;color:#213e59;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.recent-customer-grid span small{overflow:hidden;color:#8a9aab;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.recent-customer-grid em{border-radius:99px;background:#eaf4ff;color:#217adc;padding:4px 6px;font-size:9px;font-style:normal;font-weight:900}.recent-customer-grid button>strong{grid-column:2/4;color:#8a9aab;font-size:9px}.dashboard-empty{grid-column:1/-1;margin:0;padding:30px;color:#91a1b4;text-align:center;font-size:12px}
.crm-page{background:linear-gradient(180deg,#f2f8ff 0,#f7faff 260px,#f4f7fb 100%);padding:18px 22px 32px}
.crm-hero{position:relative;min-height:116px;margin-bottom:14px;overflow:hidden;border:1px solid rgba(116,175,240,.34);border-radius:16px;background:linear-gradient(112deg,#0868d8 0%,#159de1 56%,#19b9c2 100%);padding:22px 26px;color:#fff;box-shadow:0 14px 32px rgba(24,113,202,.17)}
.crm-hero::after{content:"";position:absolute;right:-52px;top:-105px;width:320px;height:320px;border:1px solid rgba(255,255,255,.22);border-radius:50%;box-shadow:0 0 0 48px rgba(255,255,255,.055)}
.crm-hero>div,.crm-hero nav{position:relative;z-index:1}.crm-hero p{margin-bottom:7px;color:#dff7ff;font-size:12px;letter-spacing:.08em}.crm-hero h1{font-size:25px;line-height:1.2}.crm-hero small{display:block;margin-top:8px;color:#e9f8ff;font-size:12px}.crm-hero nav>a,.crm-hero nav>button,.crm-hero .user-view{border-color:rgba(255,255,255,.36);background:rgba(255,255,255,.13);color:#fff;backdrop-filter:blur(8px)}.crm-hero .primary-workbench-action{border-color:#fff;background:#fff;color:#096dcc;box-shadow:0 9px 22px rgba(0,66,137,.2)}.crm-hero .user-view select{color:#0d5a9d}
.crm-metrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.crm-metrics article{display:flex;align-items:center;gap:13px;min-height:96px;border-color:#e1ebf6;border-radius:14px;padding:15px 16px;box-shadow:0 8px 24px rgba(43,91,139,.055)}.crm-metrics article i{display:grid;flex:0 0 42px;width:42px;height:42px;place-items:center;border-radius:13px;font-style:normal;font-weight:900}.crm-metrics article div{min-width:0}.crm-metrics article b{margin-top:3px;font-size:21px;white-space:nowrap}.metric-blue i{background:#e8f3ff;color:#1976e8}.metric-cyan i{background:#e4fbf8;color:#18a994}.metric-violet i{background:#f1edff;color:#7457e6}.metric-orange i{background:#fff3df;color:#ef9b28}
.dashboard-quick{max-width:none;margin:0 auto 14px;border:1px solid #e1ebf6;border-radius:14px;background:#fff;padding:14px 16px;box-shadow:0 8px 24px rgba(43,91,139,.05)}.dashboard-quick header{margin-bottom:11px}.dashboard-quick header div{display:flex;align-items:baseline;gap:10px}.dashboard-quick header b{color:#183653;font-size:15px}.dashboard-quick header span{color:#91a1b4;font-size:11px}.dashboard-quick nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.dashboard-quick a,.dashboard-quick button{display:grid;grid-template-columns:40px minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;align-items:center;min-height:68px;border:1px solid #e5edf6;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fbff);padding:10px 12px;color:#1b3855;text-align:left;text-decoration:none;cursor:pointer}.dashboard-quick a:hover,.dashboard-quick button:hover{border-color:#8dc4ff;box-shadow:0 8px 20px rgba(34,123,213,.1);transform:translateY(-1px)}.dashboard-quick i{grid-row:1/3;display:grid;width:40px;height:40px;place-items:center;border-radius:11px;background:#eaf4ff;color:#1673d2;font-style:normal;font-size:19px;font-weight:900}.dashboard-quick span{font-size:13px;font-weight:900}.dashboard-quick small{color:#91a1b4;font-size:10px}
.crm-grid{grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);gap:12px}.crm-grid.owner-grid{grid-template-areas:"chart ranking" "leadCreation lead"}.chart-panel,.lead-creation-panel,.lead-panel,.ranking-panel,.crm-panel{border-color:#e1ebf6;border-radius:14px;box-shadow:0 8px 24px rgba(43,91,139,.05)}.chart-panel header,.lead-creation-panel header,.lead-panel header,.ranking-panel header,.crm-panel header{padding-bottom:10px;border-bottom:1px solid #edf2f7}.chart-panel svg polyline{stroke:#1684ea}.lead-creation-panel svg polyline{stroke:#20b5a5}.rank-row{border-color:#e9eff6;background:#fbfdff}.rank-row i{background:linear-gradient(90deg,#1578e6,#28b7d4)}.lead-record-head{background:linear-gradient(90deg,#1479df,#21a6cc);color:#fff}.lead-record-head span{border-color:rgba(255,255,255,.2)}
@media(max-width:1100px){.dashboard-quick nav{grid-template-columns:repeat(3,minmax(0,1fr))}.crm-metrics{grid-template-columns:1fr 1fr}}
@media(max-width:1250px){.executive-grid{grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);grid-template-areas:"trend stage" "trend rank" "todo todo"}.recent-customer-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){.crm-page{padding:10px 10px 78px}.crm-hero{min-height:0;padding:18px}.crm-hero::after{display:none}.crm-hero h1{font-size:21px}.crm-metrics{grid-template-columns:1fr 1fr}.crm-metrics article{min-height:88px;padding:12px}.crm-metrics article i{width:36px;height:36px;flex-basis:36px}.crm-metrics article b{font-size:17px}.dashboard-quick nav{grid-template-columns:1fr 1fr}.dashboard-quick a,.dashboard-quick button{min-height:64px}.dashboard-quick nav>*:last-child{grid-column:1/-1}}
@media(max-width:720px){.command-bar{align-items:flex-start;flex-direction:column}.command-bar nav{display:grid;width:100%;grid-template-columns:repeat(3,1fr)}.command-bar a,.command-bar button{padding:7px 6px;text-align:center}.executive-grid{grid-template-columns:1fr;grid-template-areas:"trend" "stage" "todo" "rank"}.trend-card{min-height:330px}.trend-card svg{min-height:245px}.stage-legend{grid-template-columns:1fr 1fr}.recent-customer-grid{grid-template-columns:1fr}.recent-customer-grid button>strong{grid-column:2/4}}
</style>

<style scoped>
.crm-page{min-height:calc(100vh - 64px);max-width:1600px;margin:0 auto;background:linear-gradient(180deg,#f2f8ff 0,#f7faff 260px,#f4f7fb 100%);padding:18px 22px 32px;color:#172033}
.crm-hero{position:relative;min-height:116px;max-width:none;margin:0 0 14px;overflow:hidden;border:1px solid rgba(116,175,240,.34);border-radius:16px;background:linear-gradient(112deg,#0868d8 0%,#159de1 56%,#19b9c2 100%);padding:22px 26px;color:#fff;box-shadow:0 14px 32px rgba(24,113,202,.17)}
.crm-hero p{margin:0 0 7px;color:#dff7ff;font-size:12px;font-weight:800;letter-spacing:.08em}.crm-hero h1{margin:0;color:#fff;font-size:25px;font-weight:900;line-height:1.2}.crm-hero small{display:block;margin-top:8px;color:#e9f8ff;font-size:12px}.crm-hero nav>a,.crm-hero nav>button,.crm-hero .user-view{min-height:38px;border-color:rgba(255,255,255,.36);background:rgba(255,255,255,.13);color:#fff;box-shadow:none;backdrop-filter:blur(8px)}.crm-hero .primary-workbench-action{border-color:#fff;background:#fff;color:#096dcc;box-shadow:0 9px 22px rgba(0,66,137,.2)}
.crm-metrics{max-width:none;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.crm-metrics article{display:flex;align-items:center;gap:13px;min-height:96px;border-color:#e1ebf6;border-radius:14px;padding:15px 16px;box-shadow:0 8px 24px rgba(43,91,139,.055)}.crm-metrics article b{margin-top:3px;font-size:21px}.crm-grid{max-width:none;grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);gap:12px}.crm-panel{max-width:none}
@media(max-width:1100px){.crm-metrics{grid-template-columns:1fr 1fr}.crm-grid,.crm-grid.owner-grid{grid-template-columns:1fr;grid-template-areas:"chart" "leadCreation" "ranking" "lead"}}
@media(max-width:720px){.crm-page{min-height:calc(100vh - 56px);padding:10px 10px 78px}.crm-hero{min-height:0;padding:18px}.crm-hero h1{font-size:21px}.crm-metrics{grid-template-columns:1fr 1fr}.crm-metrics article{min-height:88px;padding:12px}.crm-metrics article b{font-size:17px}}
</style>

