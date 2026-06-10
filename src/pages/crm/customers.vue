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
const selectedUserId = ref('all')
const yearFilter = ref('all')
const monthFilter = ref('all')
const transferTargetUserId = ref('')
const sampleDialogCustomerId = ref('')
const sampleForm = ref({
  sampleSent: false,
  sampleSpec: '',
  sampleTrackingNo: '',
})
const selectedCustomerIds = ref<string[]>([])
const newCustomerDialogOpen = ref(false)
const newCustomerInitialSnapshot = ref('')
const newCustomerForm = ref({
  date: '',
  name: '',
  phone: '',
  sourceAccount: '',
  dealAttribute: '',
  customerAttribute: '',
  region: '',
  area: 0,
  usageTime: '',
  intentLevel: 'C' as IntentLevel,
  assignedToUserId: '',
  communication: '',
  remark: '',
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
  { label: '重点关注', value: 'important' },
  { label: '今日跟进', value: 'todayFollow' },
  { label: '今日新增', value: 'todayNew' },
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
  '成交属性\n高中低无效',
  '客户属性\nBC端',
  '地址',
  '客户情况\n沟通内容',
  '数量\n（平方）',
  '使用时间',
  '销售第一次跟踪反馈\n（时间、沟通情况）',
  '销售第二次跟踪反馈\n（时间、沟通情况）',
  '销售第三次跟踪反馈\n（时间、沟通情况）',
  '销售第四次跟踪反馈\n（时间、沟通情况）',
  '销售第五次跟踪反馈\n（时间、沟通情况）',
  '是否寄样品',
  '样品规格',
  '样品单号',
]

const followUpColumns = leadTableColumns.filter(column => column.includes('跟踪反馈'))

const loginUser = computed(() => admin.currentUser)
const canManageLeads = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager' || Boolean(loginUser.value?.permissions.manageUsers))
const canDeleteCustomers = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canExportCustomers = computed(() => loginUser.value?.role === 'owner' || loginUser.value?.role === 'manager')
const canViewAll = computed(() => canManageLeads.value)
const activeUser = computed(() => canManageLeads.value && selectedUserId.value !== 'all' ? users.value.find(user => user.id === selectedUserId.value) || loginUser.value : loginUser.value)
const salesUsers = computed(() => users.value.filter(user => user.enabled && user.role !== 'owner' && user.role !== 'viewer'))

function customerBelongsToUser(customer: CrmCustomer, userId?: string) {
  if (!userId)
    return false
  const user = users.value.find(item => item.id === userId)
  const names = [user?.displayName, user?.account, user?.id].map(value => String(value || '').trim()).filter(Boolean)
  return customer.assignedToUserId === userId || names.includes(String(customer.owner || '').trim())
}

const scopedCustomers = computed(() => {
  if (!canViewAll.value)
    return customers.value.filter(customer => customerBelongsToUser(customer, activeUser.value?.id))
  if (selectedUserId.value !== 'all')
    return customers.value.filter(customer => customerBelongsToUser(customer, selectedUserId.value))
  return customers.value
})

const yearOptions = computed(() => {
  const years = new Set<string>()
  scopedCustomers.value.forEach((customer) => {
    const key = customerDateKey(customer.date)
    if (key)
      years.add(key.slice(0, 4))
  })
  return Array.from(years).sort((a, b) => Number(b) - Number(a))
})

const monthOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))

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
  const dateKey = customerDateKey(customer.date)
  const yearMatched = yearFilter.value === 'all' || dateKey.startsWith(`${yearFilter.value}-`)
  const monthMatched = monthFilter.value === 'all' || dateKey.slice(5, 7) === monthFilter.value
  const todayMatched = stageFilter.value === 'todayFollow'
    ? hasTodayFollowOrReminder(customer)
    : stageFilter.value === 'todayNew'
      ? isTodayNewCustomer(customer)
      : stageFilter.value === 'important'
        ? customer.important
      : true
  const statusMatched = stageMatched || stageFilter.value === 'todayFollow' || stageFilter.value === 'todayNew' || stageFilter.value === 'important'
  return statusMatched && yearMatched && monthMatched && todayMatched && (!keyword.value || text.includes(keyword.value.toLowerCase()))
}))

const filteredCustomerIds = computed(() => filteredCustomers.value.map(customer => customer.id))
const selectedCount = computed(() => selectedCustomerIds.value.length)
const allFilteredSelected = computed(() =>
  filteredCustomerIds.value.length > 0
  && filteredCustomerIds.value.every(id => selectedCustomerIds.value.includes(id)),
)
const newCustomerDirty = computed(() => JSON.stringify(newCustomerForm.value) !== newCustomerInitialSnapshot.value)

watch(filteredCustomerIds, (ids) => {
  selectedCustomerIds.value = selectedCustomerIds.value.filter(id => ids.includes(id))
})

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function customerDateKey(value: unknown) {
  const text = firstText(value)
  return text ? normalizeDateText(text, '') : ''
}

function hasTodayFollowOrReminder(customer: CrmCustomer) {
  const todayKey = dateOnly(new Date())
  return customer.followUps.some(follow => customerDateKey(follow.date) === todayKey)
}

function isTodayNewCustomer(customer: CrmCustomer) {
  return customerDateKey(customer.date) === dateOnly(new Date())
}

function clearDateFilters() {
  yearFilter.value = 'all'
  monthFilter.value = 'all'
}

function firstText(...values: unknown[]) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || ''
}

function normalizeColumnName(value: string) {
  return value.replace(/[\s\n\r（）()、，,]/g, '').toLowerCase()
}

function rowText(row: Record<string, any>, ...names: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeColumnName(key), value] as const)
  for (const name of names) {
    if (row[name] !== undefined)
      return firstText(row[name])
    const normalizedName = normalizeColumnName(name)
    const matched = normalizedEntries.find(([key]) => key === normalizedName)
    if (matched)
      return firstText(matched[1])
  }
  return ''
}

function normalizeDateText(value: unknown, fallback = dateOnly(new Date())) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return dateOnly(value)
  if (typeof value === 'number' && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed)
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }

  const text = firstText(value)
  const yearMatch = text.match(/(20\d{2}|19\d{2})[年./-]\s*(\d{1,2})[月./-]\s*(\d{1,2})/)
  if (yearMatch)
    return `${yearMatch[1]}-${yearMatch[2].padStart(2, '0')}-${yearMatch[3].padStart(2, '0')}`

  const shortMatch = text.match(/(^|\D)(\d{1,2})[月./-]\s*(\d{1,2})(日)?/)
  if (shortMatch) {
    const year = fallback.slice(0, 4) || String(new Date().getFullYear())
    return `${year}-${shortMatch[2].padStart(2, '0')}-${shortMatch[3].padStart(2, '0')}`
  }

  return fallback
}

function stripDatePrefix(value: string) {
  return value
    .replace(/^\s*(20\d{2}|19\d{2})[年./-]\s*\d{1,2}[月./-]\s*\d{1,2}日?\s*[:：,，、-]?\s*/, '')
    .replace(/^\s*\d{1,2}[月./-]\s*\d{1,2}日?\s*[:：,，、-]?\s*/, '')
    .trim()
}

function formatFollowUpCell(follow?: CrmCustomer['followUps'][number]) {
  if (!follow)
    return ''
  const content = firstText(follow.content)
  if (!content)
    return ''
  return `${follow.date || dateOnly(new Date())} ${content}`
}

function rowFollowUps(row: Record<string, any>, fallbackDate: string) {
  return followUpColumns
    .map((column, index) => {
      const text = rowText(row, column, column.replace(/\n/g, ''), `销售第${index + 1}次跟踪反馈`)
      if (!text)
        return null
      return {
        id: `follow-import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        date: normalizeDateText(text, fallbackDate),
        content: stripDatePrefix(text) || text,
        nextAction: '',
      }
    })
    .filter(Boolean) as CrmCustomer['followUps']
}

function hasImportableLeadRow(row: Record<string, any>) {
  return Boolean(
    rowText(row, '客户名称', 'name')
    || rowText(row, '客户联系方式', '联系方式', 'phone', 'contact')
    || rowText(row, '微信', 'wechat'),
  )
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

function toggleImportant(customer: CrmCustomer) {
  customer.important = !customer.important
  crm.save()
}

function customerToLeadRow(customer: CrmCustomer, index: number) {
  const normalFollowUps = customer.followUps.filter(follow => !follow.reminderDate)
  const followUpCells = Object.fromEntries(
    followUpColumns.map((column, columnIndex) => [column, formatFollowUpCell(normalFollowUps[columnIndex])]),
  )

  return {
    序号: index + 1,
    日期: customer.date,
    客户名称: customer.name,
    客户联系方式: customerContact(customer),
    抖音账号来源: customer.sourceAccount,
    '成交属性\n高中低无效': customer.dealAttribute,
    '客户属性\nBC端': customer.customerAttribute,
    地址: customer.region,
    '客户情况\n沟通内容': customer.communication || customer.remark,
    '数量\n（平方）': customer.area || '',
    使用时间: customer.usageTime,
    ...followUpCells,
    是否寄样品: customer.sampleSent ? '是' : '否',
    样品规格: customer.sampleSpec,
    样品单号: customer.sampleTrackingNo,
  }
}

function rowToCustomer(row: Record<string, any>, index: number) {
  const contactText = rowText(row, '客户联系方式', '联系方式', 'phone', 'contact')
  const assignedUser = canManageLeads.value
    ? users.value.find(user => user.id === selectedUserId.value) || salesUsers.value[0] || activeUser.value
    : activeUser.value
  const rowDate = normalizeDateText(rowText(row, '日期', 'date'))
  const followUps = rowFollowUps(row, rowDate)

  return {
    id: `import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    date: rowDate,
    name: rowText(row, '客户名称', 'name') || contactText || '未命名客户',
    contact: rowText(row, '联系人', 'contact'),
    phone: contactText,
    wechat: rowText(row, '微信', 'wechat'),
    sourceAccount: rowText(row, '抖音账号来源', '来源', 'sourceAccount'),
    dealAttribute: rowText(row, '成交属性高中低无效', '成交属性\n高中低无效', '成交属性', 'dealAttribute'),
    customerAttribute: rowText(row, '客户属性BC端', '客户属性\nBC端', '客户属性', 'customerAttribute'),
    region: rowText(row, '地址', 'region'),
    projectType: rowText(row, '意向使用场景', '使用场景', 'projectType', 'scenario') || '待确认',
    scenario: rowText(row, '意向使用场景', '使用场景', 'scenario', 'projectType') || '待确认',
    intentLevel: normalizeIntent(rowText(row, '意向等级', 'intentLevel', '成交属性高中低无效', '成交属性\n高中低无效')),
    area: Number(rowText(row, '数量\n（平方）', '数量(平方)', '数量', '面积', 'area')) || 0,
    usageTime: rowText(row, '使用时间', 'usageTime'),
    communication: rowText(row, '客户情况\n沟通内容', '客户情况沟通内容', '沟通内容', 'communication'),
    sampleSent: ['是', '已寄', 'true', '1'].includes(rowText(row, '是否寄样品', 'sampleSent').toLowerCase()),
    sampleSpec: rowText(row, '样品规格', 'sampleSpec'),
    sampleTrackingNo: rowText(row, '样品单号', 'sampleTrackingNo'),
    stage: followUps.length ? 'follow' : normalizeStage(rowText(row, '客户状态', 'stage')),
    owner: assignedUser?.displayName || '',
    assignedToUserId: assignedUser?.id || 'owner',
    createdByUserId: activeUser.value?.id || 'owner',
    remark: rowText(row, '备注', 'remark'),
    important: false,
    followUps,
    quotes: [],
  }
}

function exportLeadTable() {
  if (!canExportCustomers.value)
    return
  const rows = filteredCustomers.value.map(customerToLeadRow)
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(leadTableColumns.map(column => [column, '']))], { header: leadTableColumns })
  worksheet['!cols'] = leadTableColumns.map(column => ({ wch: column.includes('跟踪反馈') ? 32 : 14 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '客资记录')
  XLSX.writeFile(workbook, `客资记录-${dateOnly(new Date())}.xlsx`)
}

function downloadLeadTemplate() {
  const worksheet = XLSX.utils.json_to_sheet([Object.fromEntries(leadTableColumns.map(column => [column, '']))], { header: leadTableColumns })
  worksheet['!cols'] = leadTableColumns.map(column => ({ wch: column.includes('跟踪反馈') ? 32 : 14 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '客资导入模板')
  XLSX.writeFile(workbook, '客资导入模板.xlsx')
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

function defaultNewCustomerAssignee() {
  if (!canManageLeads.value)
    return activeUser.value?.id || 'owner'
  if (selectedUserId.value !== 'all')
    return selectedUserId.value
  return salesUsers.value[0]?.id || activeUser.value?.id || 'owner'
}

function resetNewCustomerForm() {
  newCustomerForm.value = {
    date: dateOnly(new Date()),
    name: '',
    phone: '',
    sourceAccount: '',
    dealAttribute: '',
    customerAttribute: '',
    region: '',
    area: 0,
    usageTime: '',
    intentLevel: 'C',
    assignedToUserId: defaultNewCustomerAssignee(),
    communication: '',
    remark: '',
  }
  newCustomerInitialSnapshot.value = JSON.stringify(newCustomerForm.value)
}

function addCustomer() {
  resetNewCustomerForm()
  newCustomerDialogOpen.value = true
}

function closeNewCustomerDialog() {
  if (newCustomerDirty.value && !window.confirm('客户资料还没有保存，确定关闭吗？关闭后这条客户不会添加成功。'))
    return
  newCustomerDialogOpen.value = false
}

function saveNewCustomer() {
  const targetUser = users.value.find(user => user.id === newCustomerForm.value.assignedToUserId) || activeUser.value
  crm.addCustomer({
    date: newCustomerForm.value.date,
    name: newCustomerForm.value.name.trim() || '新客户',
    phone: newCustomerForm.value.phone.trim(),
    sourceAccount: newCustomerForm.value.sourceAccount.trim(),
    dealAttribute: newCustomerForm.value.dealAttribute.trim(),
    customerAttribute: newCustomerForm.value.customerAttribute.trim(),
    region: newCustomerForm.value.region.trim(),
    area: Number(newCustomerForm.value.area) || 0,
    usageTime: newCustomerForm.value.usageTime.trim(),
    intentLevel: newCustomerForm.value.intentLevel,
    communication: newCustomerForm.value.communication.trim(),
    remark: newCustomerForm.value.remark.trim(),
    assignedToUserId: targetUser?.id || 'owner',
    owner: targetUser?.displayName || targetUser?.account || '',
    createdByUserId: activeUser.value?.id || 'owner',
    stage: 'new',
  })
  newCustomerInitialSnapshot.value = JSON.stringify(newCustomerForm.value)
  newCustomerDialogOpen.value = false
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

function batchTransferCustomers() {
  if (!canManageLeads.value || !selectedCustomerIds.value.length || !transferTargetUserId.value)
    return
  const targetUser = users.value.find(user => user.id === transferTargetUserId.value)
  if (!targetUser)
    return
  if (!window.confirm(`确定把已选中的 ${selectedCustomerIds.value.length} 条客资转移给 ${targetUser.displayName || targetUser.account} 吗？`))
    return
  const selectedIds = new Set(selectedCustomerIds.value)
  customers.value.forEach((customer) => {
    if (selectedIds.has(customer.id)) {
      customer.assignedToUserId = targetUser.id
      customer.owner = targetUser.displayName || targetUser.account
    }
  })
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
        <label>导入客资<input type="file" accept=".xlsx,.xls" @change="importLeadTable"></label>

        <button v-if="canExportCustomers" @click="exportLeadTable">导出客资</button>

        <button v-else @click="downloadLeadTemplate">下载模板</button>
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

    <section v-if="newCustomerDialogOpen" class="modal-mask">
      <div class="customer-create-dialog">
        <header>
          <div>
            <h2>新建客户</h2>
            <p>点击保存后才会正式添加客户</p>
          </div>
          <button @click="closeNewCustomerDialog">关闭</button>
        </header>

        <div class="create-form">
          <label>日期<input v-model="newCustomerForm.date" type="date"></label>
          <label>客户名称<input v-model="newCustomerForm.name" placeholder="新客户"></label>
          <label>客户联系方式<input v-model="newCustomerForm.phone" placeholder="电话 / 微信 / 其他联系方式"></label>
          <label>抖音账号来源<input v-model="newCustomerForm.sourceAccount"></label>
          <label>成交属性高中低无效<input v-model="newCustomerForm.dealAttribute" placeholder="高 / 中 / 低 / 无效"></label>
          <label>客户属性BC端<input v-model="newCustomerForm.customerAttribute" placeholder="B端 / C端"></label>
          <label>地址<input v-model="newCustomerForm.region"></label>
          <label>数量(平方)<input v-model.number="newCustomerForm.area" type="number" min="0"></label>
          <label>使用时间<input v-model="newCustomerForm.usageTime"></label>
          <label>意向等级
            <select v-model="newCustomerForm.intentLevel">
              <option value="A">A 高意向</option>
              <option value="B">B 较高</option>
              <option value="C">C 普通</option>
              <option value="D">D 待培养</option>
              <option value="E">E 低意向</option>
              <option value="F">F 无效/暂缓</option>
            </select>
          </label>
          <label v-if="canManageLeads">分配给
            <select v-model="newCustomerForm.assignedToUserId">
              <option v-for="user in salesUsers" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
            </select>
          </label>
          <label class="wide">客户情况沟通内容<textarea v-model="newCustomerForm.communication"></textarea></label>
          <label class="wide">备注<textarea v-model="newCustomerForm.remark"></textarea></label>
        </div>

        <footer>
          <button @click="closeNewCustomerDialog">取消</button>
          <button class="primary" @click="saveNewCustomer">保存客户</button>
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
            <option value="all">全部客户</option>
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
        <div v-if="canDeleteCustomers" class="transfer-tools">
          <select v-model="transferTargetUserId">
            <option value="">转移给</option>
            <option v-for="user in salesUsers" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select>
          <button :disabled="!selectedCount || !transferTargetUserId" @click="batchTransferCustomers">批量转移</button>
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
        <div class="date-filter-tools">
          <select v-model="yearFilter">
            <option value="all">全部年份</option>
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}年</option>
          </select>
          <select v-model="monthFilter">
            <option value="all">全部月份</option>
            <option v-for="month in monthOptions" :key="month" :value="month">{{ Number(month) }}月</option>
          </select>
          <button class="ghost" @click="clearDateFilters">清空日期</button>
        </div>
      </div>

      <div class="lead-record-table" :class="{ 'with-select': canDeleteCustomers }">
        <div class="lead-record-head">
          <span v-if="canDeleteCustomers">选择</span>
          <span>序号</span><span>日期</span><span>客户名称</span><span>客户联系方式</span><span>抖音账号来源</span><span>成交属性高中低无效</span><span>客户属性BC端</span><span>地址</span><span>客户情况沟通内容</span><span>数量(平方)</span><span>使用时间</span><span>负责人</span><span>状态</span><span>寄样</span><span>操作</span><span>重点</span>
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
          <button class="important-star" :class="{ active: customer.important }" :title="customer.important ? '取消重点关注' : '设为重点关注'" @click.stop="toggleImportant(customer)">{{ customer.important ? '★' : '☆' }}</button>
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
.customers-hero nav,.customers-tools,.filter-bar,.customer-tabs,.date-filter-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
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
.filter-bar{justify-content:flex-start;margin-bottom:12px;padding:12px;border:1px solid #dbe6f2;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#f1f7ff)}
.filter-bar label{display:flex;align-items:center;gap:8px;color:#183f68;font-weight:900}
.batch-tools,.transfer-tools{display:flex;align-items:center;gap:8px}
.batch-tools .select-all{display:flex;align-items:center;gap:6px;color:#183f68;font-weight:900}
.batch-tools .select-all input,.select-cell input{width:16px;height:16px;min-height:0}
.batch-tools button{min-height:34px;border:1px solid #ffd3d3;border-radius:10px;background:#fff5f5;color:#d92929;padding:7px 12px;font-weight:900;cursor:pointer}
.transfer-tools select{min-height:34px;border:1px solid #d5dee9;border-radius:10px;background:#fff;color:#142235;padding:6px 10px;font-weight:800}
.transfer-tools button{min-height:34px;border:1px solid #246ed8;border-radius:10px;background:#246ed8;color:#fff;padding:7px 12px;font-weight:900;cursor:pointer}
.batch-tools button:disabled,.transfer-tools button:disabled{opacity:.45;cursor:not-allowed}
.customer-tabs{border:1px solid #dbe6f2;border-radius:12px;background:#f8fafc;padding:4px}
.customer-tabs button{min-height:32px;border:0;border-radius:9px;background:transparent;color:#50627a;padding:6px 12px;font-weight:900;cursor:pointer;white-space:nowrap}
.customer-tabs button.active{background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.2)}
.date-filter-tools{margin-left:18px}
.date-filter-tools select,.date-filter-tools button{min-height:36px;border:1px solid #cfe0f2;border-radius:10px;background:#fff;color:#183f68;padding:7px 12px;font-weight:900;white-space:nowrap}
.date-filter-tools button{cursor:pointer}
.date-filter-tools button.active{background:#246ed8;border-color:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.2)}
.date-filter-tools button.ghost{background:#f8fafc;color:#50627a}
.lead-record-table{overflow:auto;border:1px solid #dbe6f2;border-radius:12px;background:#fff}
.lead-record-head,.lead-record-table article{display:grid;grid-template-columns:52px 96px 128px 130px 120px 120px 110px 130px 220px 92px 110px 110px 92px 140px 76px 66px;min-width:1786px;align-items:stretch}
.lead-record-table.with-select .lead-record-head,.lead-record-table.with-select article{grid-template-columns:42px 52px 96px 128px 130px 120px 120px 110px 130px 220px 92px 110px 110px 92px 140px 76px 66px;min-width:1828px}
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
.important-star{display:grid;place-items:center;align-self:center;justify-self:center;width:34px;height:34px;border:1px solid #cfe0f2;border-radius:10px;background:#fff;color:#9aa8ba;font-size:21px;line-height:1;cursor:pointer}
.important-star.active{border-color:#f2c94c;background:#fff8dc;color:#f2a900}
.important-star:hover{border-color:#f2c94c;color:#f2a900}
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
.customer-create-dialog{width:min(780px,100%);max-height:86vh;display:flex;flex-direction:column;gap:14px;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.customer-create-dialog header,.customer-create-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px}
.customer-create-dialog h2{margin:0}
.customer-create-dialog p{margin:5px 0 0;color:#64748b;font-weight:800}
.customer-create-dialog header button,.customer-create-dialog footer button{min-height:38px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;color:#183f68;padding:8px 14px;font-weight:900;cursor:pointer}
.customer-create-dialog footer{justify-content:flex-end;margin-top:2px}
.customer-create-dialog footer .primary{background:#246ed8;border-color:#246ed8;color:#fff}
.create-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;overflow:auto;padding-right:4px}
.create-form label{display:grid;gap:6px;color:#50627a;font-weight:900}
.create-form input,.create-form select,.create-form textarea{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
.create-form textarea{min-height:88px;resize:vertical}
.create-form .wide{grid-column:1/-1}
@media(max-width:1000px){
  .customers-hero,.customers-panel header,.filter-bar{align-items:flex-start;flex-direction:column}
  .customers-tools{min-width:0;width:100%}
  .customers-tools input{width:100%;min-width:0}
  .customer-tabs,.date-filter-tools{width:100%;overflow:auto}
  .date-filter-tools{margin-left:0}
  .create-form{grid-template-columns:1fr}
}
@media(max-width:720px){
  .customers-page{padding:10px 10px 76px}
  .customers-hero{padding:16px;border-radius:14px}
  .customers-hero h1{font-size:24px}
  .customers-hero nav{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .customers-hero a,.customers-hero button,.customers-hero label{width:100%;min-height:42px;padding:8px 10px}
  .customers-panel{padding:12px;border-radius:14px}
  .customers-panel header{gap:10px}
  .customers-tools{display:grid;grid-template-columns:1fr;gap:8px}
  .filter-bar{gap:9px;padding:10px}
  .filter-bar label,.batch-tools,.transfer-tools{width:100%;display:grid;grid-template-columns:1fr;align-items:stretch}
  .filter-bar select,.filter-bar button,.batch-tools button,.transfer-tools button,.transfer-tools select{width:100%}
  .customer-tabs,.date-filter-tools{flex-wrap:nowrap;padding-bottom:3px}
  .lead-record-table{display:grid;gap:10px;border:0;background:transparent;overflow:visible}
  .lead-record-head{display:none}
  .lead-record-table article,
  .lead-record-table.with-select article{
    display:grid;
    grid-template-columns:1fr;
    min-width:0;
    gap:0;
    border:1px solid #dbe6f2;
    border-radius:14px;
    background:#fff;
    overflow:hidden;
  }
  .lead-record-table article span,
  .lead-record-table article strong,
  .lead-record-table article button.delete-customer,
  .lead-record-table article button.important-star{
    display:grid;
    grid-template-columns:102px minmax(0,1fr);
    width:100%;
    min-height:0;
    border-right:0;
    border-bottom:1px solid #edf2f7;
    border-radius:0;
    padding:9px 11px;
    text-align:left;
    justify-items:start;
  }
  .lead-record-table article span::before,.lead-record-table article strong::before,.delete-customer::before,.important-star::before{color:#64748b;font-weight:900}
  .lead-record-table.with-select article .select-cell::before{content:"选择"}
  .lead-record-table.with-select article span:nth-child(2)::before{content:"序号"}
  .lead-record-table.with-select article span:nth-child(3)::before{content:"日期"}
  .lead-record-table.with-select article strong:nth-child(4)::before{content:"客户名称"}
  .lead-record-table.with-select article span:nth-child(5)::before{content:"联系方式"}
  .lead-record-table.with-select article span:nth-child(6)::before{content:"来源"}
  .lead-record-table.with-select article span:nth-child(7)::before{content:"成交属性"}
  .lead-record-table.with-select article span:nth-child(8)::before{content:"客户属性"}
  .lead-record-table.with-select article span:nth-child(9)::before{content:"地址"}
  .lead-record-table.with-select article span:nth-child(10)::before{content:"沟通内容"}
  .lead-record-table.with-select article span:nth-child(11)::before{content:"数量"}
  .lead-record-table.with-select article span:nth-child(12)::before{content:"使用时间"}
  .lead-record-table.with-select article span:nth-child(13)::before{content:"负责人"}
  .lead-record-table.with-select article strong:nth-child(14)::before{content:"状态"}
  .lead-record-table.with-select article .sample-cell::before{content:"寄样"}
  .lead-record-table.with-select article .delete-customer::before{content:"操作"}
  .lead-record-table.with-select article .important-star::before{content:"重点"}
  .lead-record-table:not(.with-select) article span:nth-child(1)::before{content:"序号"}
  .lead-record-table:not(.with-select) article span:nth-child(2)::before{content:"日期"}
  .lead-record-table:not(.with-select) article strong:nth-child(3)::before{content:"客户名称"}
  .lead-record-table:not(.with-select) article span:nth-child(4)::before{content:"联系方式"}
  .lead-record-table:not(.with-select) article span:nth-child(5)::before{content:"来源"}
  .lead-record-table:not(.with-select) article span:nth-child(6)::before{content:"成交属性"}
  .lead-record-table:not(.with-select) article span:nth-child(7)::before{content:"客户属性"}
  .lead-record-table:not(.with-select) article span:nth-child(8)::before{content:"地址"}
  .lead-record-table:not(.with-select) article span:nth-child(9)::before{content:"沟通内容"}
  .lead-record-table:not(.with-select) article span:nth-child(10)::before{content:"数量"}
  .lead-record-table:not(.with-select) article span:nth-child(11)::before{content:"使用时间"}
  .lead-record-table:not(.with-select) article span:nth-child(12)::before{content:"负责人"}
  .lead-record-table:not(.with-select) article strong:nth-child(13)::before{content:"状态"}
  .lead-record-table:not(.with-select) article .sample-cell::before{content:"寄样"}
  .lead-record-table:not(.with-select) article .important-star::before{content:"重点"}
  .sample-cell{align-items:start}
  .sample-cell button,.sample-cell a{width:auto}
  .delete-customer{color:#d92929!important;background:#fff5f5!important}
  .important-star{height:auto;font-size:19px;color:#f2a900}
  .customer-create-dialog{width:100%;max-height:90vh;padding:16px}
}
</style>
