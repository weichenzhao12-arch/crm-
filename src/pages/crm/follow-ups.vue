<route lang="json">
{
  "meta": {
    "title": "今日跟进",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'

const router = useRouter()
const crm = useCrmStore()
const admin = useAdminStore()
const { customers } = storeToRefs(crm)
const statusFilter = ref<'all' | 'overdue' | 'today' | 'upcoming'>('all')
const keyword = ref('')

onMounted(() => {
  crm.loadCloudCustomers()
  admin.loadCloudUsers()
})

const today = computed(() => new Date().toISOString().slice(0, 10))
const loginUser = computed(() => admin.currentUser)
const canViewAll = computed(() => ['owner', 'manager'].includes(loginUser.value?.role || '') || Boolean(loginUser.value?.permissions.viewAllCustomers))
const visibleCustomers = computed(() => canViewAll.value
  ? customers.value
  : customers.value.filter(customer =>
      customer.assignedToUserId === loginUser.value?.id
      || customer.owner === loginUser.value?.displayName
      || customer.owner === loginUser.value?.account))
const followItems = computed(() => visibleCustomers.value.flatMap(customer =>
  customer.followUps
    .filter(follow => follow.reminderDate && !follow.reminderDone)
    .map(follow => ({
      customer,
      follow,
      status: follow.reminderDate! < today.value ? 'overdue' : follow.reminderDate === today.value ? 'today' : 'upcoming',
    })),
).sort((a, b) => `${a.follow.reminderDate} ${a.follow.reminderTime || ''}`.localeCompare(`${b.follow.reminderDate} ${b.follow.reminderTime || ''}`)))

const counts = computed(() => ({
  all: followItems.value.length,
  overdue: followItems.value.filter(item => item.status === 'overdue').length,
  today: followItems.value.filter(item => item.status === 'today').length,
  upcoming: followItems.value.filter(item => item.status === 'upcoming').length,
}))

const visibleItems = computed(() => followItems.value.filter((item) => {
  const statusMatched = statusFilter.value === 'all' || item.status === statusFilter.value
  const text = `${item.customer.name} ${item.customer.owner} ${item.customer.phone} ${item.follow.content} ${item.follow.nextAction}`.toLowerCase()
  return statusMatched && (!keyword.value || text.includes(keyword.value.toLowerCase()))
}))

function markDone(customerId: string, followId: string) {
  const customer = customers.value.find(item => item.id === customerId)
  const follow = customer?.followUps.find(item => item.id === followId)
  if (!follow)
    return
  follow.reminderDone = true
  crm.save()
}
</script>

<template>
  <main class="follow-page">
    <header class="page-heading">
      <div><h1>今日跟进</h1><p>集中处理逾期、今日和即将到期的客户任务</p></div>
      <button @click="router.push('/crm/customers')">查看全部客户</button>
    </header>
    <section class="follow-metrics">
      <button :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'"><span>全部待办</span><b>{{ counts.all }}</b></button>
      <button :class="{ active: statusFilter === 'overdue' }" @click="statusFilter = 'overdue'"><span>已经逾期</span><b class="red">{{ counts.overdue }}</b></button>
      <button :class="{ active: statusFilter === 'today' }" @click="statusFilter = 'today'"><span>今日跟进</span><b class="amber">{{ counts.today }}</b></button>
      <button :class="{ active: statusFilter === 'upcoming' }" @click="statusFilter = 'upcoming'"><span>后续计划</span><b>{{ counts.upcoming }}</b></button>
    </section>
    <section class="follow-panel">
      <div class="follow-toolbar"><span>⌕</span><input v-model="keyword" placeholder="搜索客户、负责人或跟进内容"><small>共 {{ visibleItems.length }} 项</small></div>
      <div class="follow-list">
        <article v-for="item in visibleItems" :key="`${item.customer.id}-${item.follow.id}`">
          <time :class="item.status"><b>{{ item.follow.reminderDate }}</b><span>{{ item.follow.reminderTime || '未设置时间' }}</span></time>
          <div class="customer"><i>{{ item.customer.name.slice(0, 1) }}</i><div><b>{{ item.customer.name }}</b><span>{{ item.customer.phone || item.customer.wechat || '未填写联系方式' }} · {{ item.customer.owner || '未分配' }}</span></div></div>
          <div class="task"><b>{{ item.follow.nextAction || '联系客户' }}</b><p>{{ item.follow.content || '暂无沟通说明' }}</p></div>
          <span class="status" :class="item.status">{{ item.status === 'overdue' ? '已逾期' : item.status === 'today' ? '今天' : '计划中' }}</span>
          <div class="actions"><button @click="router.push(`/crm/customer/${item.customer.id}`)">查看客户</button><button class="done" @click="markDone(item.customer.id, item.follow.id)">标记完成</button></div>
        </article>
        <div v-if="!visibleItems.length" class="empty"><b>当前没有待跟进任务</b><span>可以进入客户详情，为下一步行动设置提醒。</span></div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.follow-page{min-height:calc(100vh - 64px);max-width:1600px;margin:auto;padding:24px 28px;background:#f5f7fa}.page-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.page-heading h1{margin:0;font-size:25px}.page-heading p{margin:7px 0 0;color:#64748b;font-size:13px}.page-heading button{height:38px;border:1px solid #d9e2ec;border-radius:9px;background:#fff;padding:0 15px;color:#344255;font-weight:800}.follow-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.follow-metrics button{position:relative;min-height:88px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:16px 18px;text-align:left}.follow-metrics button.active{border-color:#96b8ff;box-shadow:0 0 0 1px #dbe7ff}.follow-metrics span{display:block;color:#64748b;font-size:12px}.follow-metrics b{display:block;margin-top:8px;font-size:23px}.follow-metrics .red{color:#dc2626}.follow-metrics .amber{color:#d97706}.follow-panel{overflow:hidden;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(15,42,67,.035)}.follow-toolbar{display:flex;height:62px;align-items:center;gap:8px;border-bottom:1px solid #edf1f5;padding:0 16px;color:#94a3b8}.follow-toolbar input{width:min(440px,70%);height:38px;border:1px solid #dce4ec;border-radius:8px;background:#f8fafc;padding:0 12px;outline:0}.follow-toolbar small{margin-left:auto}.follow-list{padding:0 16px}.follow-list article{display:grid;min-height:84px;grid-template-columns:130px minmax(180px,1fr) minmax(220px,1.4fr) 75px 190px;align-items:center;gap:18px;border-bottom:1px solid #edf1f5}.follow-list time{display:flex;flex-direction:column;color:#526579;font-size:11px}.follow-list time b{margin-bottom:5px;font-size:12px}.follow-list time.overdue b{color:#dc2626}.follow-list time.today b{color:#d97706}.customer{display:flex;min-width:0;align-items:center;gap:10px}.customer i{display:grid;flex:0 0 36px;height:36px;place-items:center;border-radius:9px;background:#eff6ff;color:#2563eb;font-style:normal;font-weight:800}.customer b,.customer span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.customer b{font-size:13px}.customer span{margin-top:5px;color:#8998aa;font-size:10px}.task b{font-size:12px}.task p{display:-webkit-box;overflow:hidden;margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}.status{justify-self:start;border-radius:13px;background:#eef2f6;padding:6px 9px;color:#526579;font-size:10px;font-weight:800}.status.overdue{background:#feecec;color:#dc2626}.status.today{background:#fff3dd;color:#b66a06}.actions{display:flex;justify-content:flex-end;gap:7px}.actions button{height:32px;border:1px solid #dce4ec;border-radius:7px;background:#fff;padding:0 9px;color:#2563eb;font-size:11px;font-weight:800}.actions .done{border-color:#2563eb;background:#2563eb;color:#fff}.empty{display:grid;min-height:280px;place-content:center;text-align:center;color:#94a3b8}.empty b{color:#526579}.empty span{margin-top:8px;font-size:12px}@media(max-width:900px){.follow-list article{grid-template-columns:110px 1fr 1.2fr}.follow-list .status,.follow-list .actions{grid-column:3}.follow-metrics{overflow:auto;grid-template-columns:repeat(4,minmax(150px,1fr))}}@media(max-width:720px){.follow-page{min-height:calc(100vh - 56px);padding:16px 12px}.page-heading{align-items:flex-start}.follow-metrics{gap:8px}.follow-list{display:grid;gap:10px;background:#f5f7fa;padding:12px}.follow-list article{display:grid;grid-template-columns:1fr auto;gap:10px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:14px}.follow-list article>*{grid-column:1/-1}.follow-list .status{position:absolute}.actions{justify-content:flex-start}}
</style>
