<route lang="json">
{
  "meta": {
    "title": "客户详情",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import type { CrmFollowUp, CrmQuoteRecord } from '~/stores/crm'

const route = useRoute()
const router = useRouter()
const crm = useCrmStore()
const admin = useAdminStore()
const { users } = storeToRefs(admin)
const customer = computed(() => crm.findCustomer(String(route.params.id)))
const reminderModal = ref({
  open: false,
  reminderDate: '',
  reminderTime: '09:00',
  content: '',
  nextAction: '联系客户',
})
const activityTab = ref<'follow' | 'quote'>(route.query.tab === 'quote' ? 'quote' : 'follow')
const reminderItems = computed(() => customer.value?.followUps.filter(follow => follow.reminderDate) || [])
const followItems = computed(() => customer.value?.followUps.filter(follow => !follow.reminderDate) || [])
const lastSavedSnapshot = ref('')
const hasUnsavedChanges = ref(false)

function customerSnapshot() {
  if (!customer.value)
    return ''
  const { updatedAt, ...rest } = customer.value
  return JSON.stringify(rest)
}

function markSaved() {
  lastSavedSnapshot.value = customerSnapshot()
  hasUnsavedChanges.value = false
}

watch(customer, () => {
  markSaved()
}, { immediate: true })

watch(customer, () => {
  const snapshot = customerSnapshot()
  if (lastSavedSnapshot.value && snapshot !== lastSavedSnapshot.value)
    hasUnsavedChanges.value = true
}, { deep: true })

function beforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value)
    return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})

onBeforeRouteLeave(() => {
  if (!hasUnsavedChanges.value)
    return true
  return window.confirm('客户资料有未保存内容，确定离开吗？')
})

watch(() => [route.query.tab, route.query.quoteSaved], async ([tab, quoteSaved]) => {
  if (tab === 'quote') {
    activityTab.value = 'quote'
    if (quoteSaved) {
      await nextTick()
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }
}, { immediate: true })

const stageLabels = {
  new: '新客资',
  quoted: '已报价',
  follow: '跟进中',
  won: '已成交',
  lost: '无效',
}

const stageOptions = [
  { value: 'new', label: stageLabels.new },
  { value: 'quoted', label: stageLabels.quoted },
  { value: 'follow', label: stageLabels.follow },
  { value: 'won', label: stageLabels.won },
  { value: 'lost', label: stageLabels.lost },
]

function save() {
  crm.save()
  markSaved()
}

function newQuote() {
  router.push(`/quote?customerId=${customer.value?.id || ''}`)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function followYear(dateText: string) {
  return (dateText || today()).slice(0, 4)
}

function followMonthDay(dateText: string) {
  const value = dateText || today()
  const [, month = '', day = ''] = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})/) || []
  return month && day ? `${Number(month)}月${Number(day)}号` : value
}

function openReminderModal() {
  reminderModal.value = {
    open: true,
    reminderDate: today(),
    reminderTime: '09:00',
    content: '',
    nextAction: '联系客户',
  }
}

function closeReminderModal() {
  reminderModal.value.open = false
}

function saveReminder() {
  const current = customer.value
  if (!current)
    return
  const form = reminderModal.value
  current.followUps.unshift({
    id: `reminder-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: today(),
    content: form.content.trim() || '客户提醒',
    nextAction: form.nextAction.trim() || '联系客户',
    reminderDate: form.reminderDate || today(),
    reminderTime: form.reminderTime || '',
    reminderDone: false,
  })
  crm.save()
  markSaved()
  closeReminderModal()
}

function deleteFollowUp(follow: CrmFollowUp) {
  const current = customer.value
  if (!current)
    return
  current.followUps = current.followUps.filter(item => item.id !== follow.id)
  crm.save()
  markSaved()
}

function setWonQuote(quote: CrmQuoteRecord) {
  const current = customer.value
  if (!current)
    return
  current.quotes.forEach((item) => {
    item.isWon = item.id === quote.id
    if (item.isWon) {
      item.status = '已成交'
      item.dealAmount = item.dealAmount || item.amount
      item.dealDate = item.dealDate || new Date().toISOString().slice(0, 10)
    }
  })
  current.stage = 'won'
  crm.save()
  markSaved()
}

function clearWonQuote(quote: CrmQuoteRecord) {
  quote.isWon = false
  quote.status = '已报价'
  if (!customer.value?.quotes.some(item => item.isWon))
    customer.value!.stage = 'follow'
  crm.save()
  markSaved()
}

function updateDealAmount(quote: CrmQuoteRecord, event: Event) {
  quote.dealAmount = Number((event.target as HTMLInputElement).value) || 0
  crm.save()
  markSaved()
}

function uploadContract(event: Event, quote: CrmQuoteRecord) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  const reader = new FileReader()
  reader.onload = () => {
    quote.contractFileName = file.name
    quote.contractFileDataUrl = String(reader.result || '')
    crm.save()
    markSaved()
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <main class="detail-page">
    <template v-if="customer">
      <section class="detail-hero">
        <div>
          <h1>{{ customer.name }}</h1>
        </div>
        <nav>
          <RouterLink to="/crm/customers">返回客户管理</RouterLink>
          <RouterLink to="/">返回 CRM</RouterLink>
          <button @click="newQuote">新建报价</button>
          <button @click="save">{{ hasUnsavedChanges ? '保存客户（未保存）' : '保存客户' }}</button>
        </nav>
      </section>

      <section class="detail-grid">
        <article class="detail-panel customer-form">
          <header><h2>客户资料</h2><span>{{ stageLabels[customer.stage] }}</span></header>
          <label>日期<input v-model="customer.date" type="date"></label>
          <label>客户名称<input v-model="customer.name"></label>
          <label>客户联系方式<input v-model="customer.phone" placeholder="电话 / 微信 / 其他联系方式"></label>
          <label>抖音账号来源<input v-model="customer.sourceAccount"></label>
          <label>成交属性高中低无效<input v-model="customer.dealAttribute" placeholder="高 / 中 / 低 / 无效"></label>
          <label>客户属性BC端<input v-model="customer.customerAttribute" placeholder="B端 / C端"></label>
          <label>地址<input v-model="customer.region"></label>
          <label>数量(平方)<input v-model.number="customer.area" type="number"></label>
          <label>使用时间<input v-model="customer.usageTime"></label>
          <label>意向等级<select v-model="customer.intentLevel">
            <option value="A">A 高意向</option>
            <option value="B">B 较高</option>
            <option value="C">C 普通</option>
            <option value="D">D 待培养</option>
            <option value="E">E 低意向</option>
            <option value="F">F 无效/暂缓</option>
          </select></label>
          <label>分配给<select v-model="customer.assignedToUserId">
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.displayName || user.account }}</option>
          </select></label>
          <label>负责人<input v-model="customer.owner"></label>
          <label>跟进阶段<select v-model="customer.stage">
            <option v-for="option in stageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select></label>
          <label class="wide">客户情况沟通内容<textarea v-model="customer.communication"></textarea></label>
          <label class="wide">备注<textarea v-model="customer.remark"></textarea></label>
        </article>

        <article class="detail-panel activity-panel">
          <header>
            <div class="activity-tabs">
              <button :class="{ active: activityTab === 'follow' }" @click="activityTab = 'follow'">跟进记录</button>
              <button :class="{ active: activityTab === 'quote' }" @click="activityTab = 'quote'">报价记录</button>
            </div>
            <div class="header-actions">
              <template v-if="activityTab === 'follow'">
                <button class="action-button" @click="openReminderModal"><span>+</span>添加提醒</button>
                <button class="action-button primary" @click="crm.addFollowUp(customer.id)"><span>+</span>新增跟进</button>
              </template>
              <button v-else @click="newQuote">新建报价</button>
            </div>
          </header>

          <section v-if="activityTab === 'follow'" class="activity-content">
            <section class="follow-section">
              <h3>跟进内容</h3>
              <div v-if="!followItems.length" class="empty compact">暂无跟进记录</div>
              <div v-for="follow in followItems" :key="follow.id" class="follow-row">
                <label class="follow-date-tile">
                  <input v-model="follow.date" type="date" @change="save">
                  <span>{{ followYear(follow.date) }}</span>
                  <b>{{ followMonthDay(follow.date) }}</b>
                </label>
                <textarea v-model="follow.content" placeholder="新增跟进记录" @blur="save"></textarea>
                <button class="danger" @click="deleteFollowUp(follow)">删除</button>
              </div>
            </section>

            <section class="reminder-section">
              <h3>提醒事项</h3>
              <div v-if="!reminderItems.length" class="empty compact">暂无提醒</div>
              <div v-for="reminder in reminderItems" :key="reminder.id" class="reminder-edit-row">
                <input v-model="reminder.reminderDate" type="date" @change="save">
                <input v-model="reminder.reminderTime" type="time" @change="save">
                <textarea v-model="reminder.content" @blur="save"></textarea>
                <input v-model="reminder.nextAction" placeholder="提醒事项" @blur="save">
                <button class="danger" @click="deleteFollowUp(reminder)">删除</button>
              </div>
            </section>
          </section>

          <section v-else class="activity-content">
            <div v-if="!customer.quotes.length" class="empty">暂无报价记录</div>
            <div v-for="quote in customer.quotes" :key="quote.id" class="record-row">
              <div class="deal-box">
                <label class="won-check">
                  <input :checked="quote.isWon" type="checkbox" @change="quote.isWon ? clearWonQuote(quote) : setWonQuote(quote)">
                  已成交
                </label>
                <label>成交价<input :value="quote.dealAmount || quote.amount" type="number" @input="updateDealAmount(quote, $event)"></label>
                <label>报价日期<input v-model="quote.date" type="date" @change="save"></label>
                <div class="contract-upload">
                  <label class="file-chip" :class="{ filled: quote.contractFileName }">
                    {{ quote.contractFileName || '上传合同' }}
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,image/*,application/pdf" @change="uploadContract($event, quote)">
                  </label>
                </div>
              </div>
              <div>
                <b>{{ quote.title }}</b>
                <p>{{ quote.date }} · {{ quote.status }}</p>
                <a v-if="quote.quoteFileDataUrl" class="quote-file-link" :href="quote.quoteFileDataUrl" :download="quote.quoteFileName || `${quote.title}.pdf`" target="_blank" rel="noopener">查看报价单</a>
              </div>
              <strong>¥{{ quote.amount.toFixed(2) }}</strong>
            </div>
          </section>
        </article>
      </section>

      <section v-if="reminderModal.open" class="modal-mask">
        <div class="modal-box">
          <header>
            <h2>添加提醒</h2>
            <button @click="closeReminderModal">关闭</button>
          </header>
          <label>提醒日期<input v-model="reminderModal.reminderDate" type="date"></label>
          <label>提醒时间<input v-model="reminderModal.reminderTime" type="time"></label>
          <label class="wide">提醒内容<textarea v-model="reminderModal.content" placeholder="比如：客户要求三天后联系"></textarea></label>
          <label class="wide">下一步动作<input v-model="reminderModal.nextAction" placeholder="联系客户"></label>
          <div class="modal-actions">
            <button @click="closeReminderModal">取消</button>
            <button class="primary" @click="saveReminder">保存提醒</button>
          </div>
        </div>
      </section>
    </template>
    <section v-else class="detail-panel not-found">
      <h1>客户不存在</h1>
      <RouterLink to="/crm/customers">返回客户管理</RouterLink>
    </section>
    <RouterLink class="floating-back" to="/crm/customers">返回客户管理</RouterLink>
  </main>
</template>

<style scoped>
.detail-page{min-height:100vh;background:#eef3f8;padding:24px;color:#142235}
.detail-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1500px;margin:0 auto 18px;padding:26px;border-radius:18px;background:linear-gradient(135deg,#10243f,#1f5f8b);color:#fff}
.detail-hero p{margin:0 0 8px;color:#cce5ff;font-weight:800}
.detail-hero h1{margin:0;font-size:34px}
.detail-hero nav{display:flex;flex-wrap:wrap;gap:10px}
.detail-hero a,.detail-hero button,.detail-panel button{min-height:40px;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:#fff;color:#183f68;padding:9px 14px;text-decoration:none;font-weight:800;cursor:pointer}
.detail-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);align-items:start;gap:18px;max-width:1500px;margin:0 auto}
.detail-panel{border:1px solid #d7e2ee;border-radius:16px;background:#fff;padding:20px;box-shadow:0 12px 34px rgba(38,59,84,.075)}
.detail-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.detail-panel h2{margin:0;font-size:22px}
.detail-panel header span{border-radius:999px;background:#eff6ff;color:#246ed8;padding:7px 10px;font-weight:800}
.header-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.header-actions .action-button{display:inline-flex;align-items:center;gap:6px;border-color:#c7daf0;background:#f4f9ff;color:#185b99;box-shadow:0 6px 14px rgba(30,86,140,.08)}
.header-actions .action-button.primary{border-color:#246ed8;background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.22)}
.header-actions .action-button span{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:rgba(36,110,216,.12);font-size:16px;line-height:1}
.header-actions .action-button.primary span{background:rgba(255,255,255,.22)}
.detail-panel button.danger{border-color:#ffd1d1;background:#fff5f5;color:#c62828}
.activity-panel{position:relative;height:calc(100vh - 140px);max-height:760px;min-height:560px;display:flex;flex-direction:column;overflow:hidden;padding-top:78px}
.activity-panel header{position:absolute;top:20px;left:20px;right:20px;z-index:10;align-items:center;min-height:48px;border-bottom:1px solid #e1e9f2;background:#fff;padding-bottom:12px}
.activity-tabs{display:flex;flex-shrink:0;gap:4px;border:1px solid #dbe6f2;border-radius:999px;background:#f4f8fc;padding:4px}
.activity-tabs button{min-height:34px;border:0;border-radius:999px;background:transparent;color:#50627a;padding:7px 16px;font-weight:900;cursor:pointer}
.activity-tabs button.active{background:#246ed8;color:#fff;box-shadow:0 8px 18px rgba(36,110,216,.22)}
.activity-content{flex:1;min-height:0;overflow:auto;overflow-x:hidden;padding:12px 6px 0 0}
.customer-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:12px}
.customer-form header,.customer-form .wide{grid-column:1/-1}
label{display:grid;gap:6px;color:#50627a;font-weight:800}
input,select,textarea{min-height:40px;border:1px solid #d5dee9;border-radius:10px;background:#f8fafc;padding:8px 12px;color:#142235}
textarea{min-height:76px;resize:vertical}
.record-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:14px;margin-bottom:10px}
.record-row p{margin:5px 0 0;color:#64748b}
.record-row strong{color:#246ed8}
.deal-box{grid-column:1/-1;display:grid;grid-template-columns:80px minmax(120px,1fr);gap:10px;align-items:center;border-top:1px solid #e1e9f2;padding-top:10px}
.won-check{display:flex;align-items:center;gap:6px}
.won-check input{min-height:auto}
.file-chip{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px dashed #9bb7d3;border-radius:10px;background:#f8fafc;color:#183f68;padding:7px 9px;cursor:pointer;font-size:13px;white-space:nowrap}
.file-chip.filled{border-style:solid;border-color:#246ed8;background:#eff6ff;color:#246ed8}
.file-chip input{display:none}
.contract-upload{grid-column:1/-1;display:flex;justify-content:flex-end}
.contract-upload .file-chip{min-width:118px}
.quote-file-link{display:inline-flex;margin-top:6px;color:#246ed8;font-weight:900;text-decoration:none}
.follow-section{border-bottom:1px solid #e1e9f2;margin-bottom:16px;padding-bottom:16px}
.reminder-section h3,.follow-section h3{margin:0 0 10px;font-size:16px;color:#183f68}
.reminder-edit-row{display:grid;grid-template-columns:1fr;gap:10px;align-items:start;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:12px;margin-bottom:10px}
.follow-row{display:grid;grid-template-columns:74px minmax(0,1fr);gap:10px;align-items:start;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:12px;margin-bottom:10px}
.follow-row textarea{min-height:88px}
.follow-row .danger{grid-column:2}
.follow-date-tile{position:relative;width:74px;height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px solid #cfe0f1;border-radius:12px;background:linear-gradient(180deg,#f8fbff,#edf5ff);color:#183f68;text-align:center;overflow:hidden}
.follow-date-tile span{font-size:13px;font-weight:900;line-height:1}
.follow-date-tile b{font-size:15px;line-height:1.2}
.follow-date-tile input{position:absolute;inset:0;width:100%;height:100%;min-height:0;opacity:0;cursor:pointer}
.empty{border:1px dashed #b8c8d8;border-radius:12px;background:#f8fbff;color:#64748b;padding:20px;text-align:center}
.empty.compact{padding:12px;margin-bottom:10px}
.modal-mask{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:rgba(15,34,55,.38);padding:20px}
.modal-box{width:min(560px,100%);display:grid;grid-template-columns:1fr 1fr;gap:12px;border-radius:16px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,34,55,.28)}
.modal-box header,.modal-box .wide,.modal-actions{grid-column:1/-1}
.modal-box header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.modal-actions{display:flex;justify-content:flex-end;gap:10px}
.modal-actions .primary{background:#246ed8;color:#fff;border-color:#246ed8}
.not-found{max-width:600px;margin:100px auto;text-align:center}
.floating-back{position:fixed;right:28px;bottom:28px;z-index:25;display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid #246ed8;border-radius:999px;background:#246ed8;color:#fff;padding:10px 18px;text-decoration:none;font-weight:900;box-shadow:0 14px 34px rgba(36,110,216,.28)}
.floating-back:hover{background:#1d5fc1;border-color:#1d5fc1}
@media(max-width:1000px){
  .detail-hero{align-items:flex-start;flex-direction:column}
  .detail-grid,.customer-form,.follow-row,.reminder-edit-row,.modal-box{grid-template-columns:1fr}
  .activity-panel{height:auto;max-height:none;padding-top:20px}
  .activity-panel header{position:relative;top:auto;left:auto;right:auto}
  .floating-back{right:16px;bottom:16px;min-height:40px;padding:8px 14px}
}
@media(max-width:720px){
  .detail-page{
    width:100%;
    max-width:100%;
    overflow-x:hidden;
    padding:10px 10px 76px;
  }
  .detail-hero{
    width:100%;
    max-width:100%;
    padding:16px;
    border-radius:14px;
  }
  .detail-hero h1{font-size:24px;line-height:1.25;word-break:break-word}
  .detail-hero nav{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .detail-hero a,.detail-hero button{width:100%;min-height:42px;padding:8px 10px;text-align:center}
  .detail-grid{
    width:100%;
    max-width:100%;
    min-width:0;
    grid-template-columns:minmax(0,1fr);
    gap:12px;
  }
  .detail-panel{
    width:100%;
    max-width:100%;
    min-width:0;
    padding:14px;
    border-radius:14px;
    overflow:hidden;
  }
  .detail-panel header{align-items:flex-start;flex-direction:column}
  .customer-form{
    grid-template-columns:minmax(0,1fr);
    gap:10px;
  }
  .customer-form label,
  .customer-form input,
  .customer-form select,
  .customer-form textarea{
    width:100%;
    max-width:100%;
    min-width:0;
  }
  .activity-panel{
    min-height:0;
    height:auto;
    max-height:none;
    padding-top:14px;
    overflow:visible;
  }
  .activity-panel header{
    position:relative;
    inset:auto;
    gap:10px;
    padding-bottom:10px;
  }
  .activity-tabs{width:100%;display:grid;grid-template-columns:1fr 1fr}
  .activity-tabs button{width:100%;padding:7px 8px}
  .header-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}
  .header-actions button{width:100%}
  .activity-content{
    width:100%;
    max-height:none;
    overflow:visible;
    padding-right:0;
  }
  .follow-row{
    grid-template-columns:68px minmax(0,1fr);
    width:100%;
    max-width:100%;
  }
  .follow-date-tile{width:68px;height:68px}
  .follow-row .danger{grid-column:1/-1}
  .follow-row textarea,
  .reminder-edit-row input,
  .reminder-edit-row textarea{
    width:100%;
    min-width:0;
  }
  .record-row,
  .deal-box{
    grid-template-columns:1fr;
    width:100%;
    max-width:100%;
    min-width:0;
  }
  .record-row > *,
  .deal-box > *{
    min-width:0;
  }
  .contract-upload{justify-content:stretch}
  .contract-upload .file-chip{width:100%}
  .modal-box{width:100%;max-height:88vh;overflow:auto;padding:16px}
  .modal-actions{display:grid;grid-template-columns:1fr 1fr}
  .floating-back{left:10px;right:10px;bottom:10px;border-radius:12px}
}
</style>


