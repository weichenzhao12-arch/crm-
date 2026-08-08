<route lang="json">
{
  "meta": {
    "title": "数据统计",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { isSalesUser, useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'

const crm = useCrmStore()
const admin = useAdminStore()
const { customers } = storeToRefs(crm)
const { users } = storeToRefs(admin)

onMounted(() => {
  crm.loadCloudCustomers()
  admin.loadCloudUsers()
})

const loginUser = computed(() => admin.currentUser)
const canViewAll = computed(() => ['owner', 'manager'].includes(loginUser.value?.role || '') || Boolean(loginUser.value?.permissions.viewAllCustomers))
const visibleCustomers = computed(() => canViewAll.value
  ? customers.value
  : customers.value.filter(customer =>
      customer.assignedToUserId === loginUser.value?.id
      || customer.owner === loginUser.value?.displayName
      || customer.owner === loginUser.value?.account))
const activeCustomers = computed(() => visibleCustomers.value.filter(customer => customer.stage !== 'lost'))
const quotedCustomers = computed(() => visibleCustomers.value.filter(customer => customer.quotes.length || customer.stage === 'quoted'))
const wonCustomers = computed(() => visibleCustomers.value.filter(customer => customer.stage === 'won' || customer.quotes.some(quote => quote.isWon)))
const totalQuoteAmount = computed(() => visibleCustomers.value.flatMap(customer => customer.quotes).reduce((sum, quote) => sum + Number(quote.amount || 0), 0))
const totalDealAmount = computed(() => visibleCustomers.value.flatMap(customer => customer.quotes).reduce((sum, quote) => sum + Number(quote.dealAmount || (quote.isWon ? quote.amount : 0) || 0), 0))
const conversionRate = computed(() => visibleCustomers.value.length ? Math.round(wonCustomers.value.length / visibleCustomers.value.length * 100) : 0)

const stages = computed(() => [
  { key: 'new', label: '新线索', count: visibleCustomers.value.filter(item => item.stage === 'new').length, color: '#64748b' },
  { key: 'follow', label: '跟进中', count: visibleCustomers.value.filter(item => item.stage === 'follow').length, color: '#2563eb' },
  { key: 'quoted', label: '已报价', count: visibleCustomers.value.filter(item => item.stage === 'quoted').length, color: '#d97706' },
  { key: 'won', label: '已成交', count: wonCustomers.value.length, color: '#198754' },
  { key: 'lost', label: '已流失', count: visibleCustomers.value.filter(item => item.stage === 'lost').length, color: '#dc6262' },
])
const maxStage = computed(() => Math.max(...stages.value.map(item => item.count), 1))

const ownerRanking = computed(() => users.value.filter(user => isSalesUser(user) && (canViewAll.value || user.id === loginUser.value?.id)).map((user) => {
  const owned = visibleCustomers.value.filter(customer => customer.assignedToUserId === user.id || customer.owner === user.displayName || customer.owner === user.account)
  const deals = owned.filter(customer => customer.stage === 'won' || customer.quotes.some(quote => quote.isWon))
  const amount = owned.flatMap(customer => customer.quotes).reduce((sum, quote) => sum + Number(quote.dealAmount || (quote.isWon ? quote.amount : 0) || 0), 0)
  return { id: user.id, name: user.displayName || user.account, customers: owned.length, deals: deals.length, amount }
}).sort((a, b) => b.amount - a.amount || b.deals - a.deals))

function money(value: number) {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
</script>

<template>
  <main class="stats-page">
    <header class="page-heading"><div><h1>数据统计</h1><p>查看客户转化、报价金额和团队表现</p></div><span>数据随客户和报价记录实时更新</span></header>
    <section class="stats-metrics">
      <article><span>有效客户</span><b>{{ activeCustomers.length }}</b><small>排除已流失客户</small></article>
      <article><span>产生报价</span><b>{{ quotedCustomers.length }}</b><small>{{ money(totalQuoteAmount) }}</small></article>
      <article><span>成交客户</span><b>{{ wonCustomers.length }}</b><small>{{ money(totalDealAmount) }}</small></article>
      <article><span>客户转化率</span><b>{{ conversionRate }}%</b><small>成交客户 / 全部客户</small></article>
    </section>
    <section class="stats-grid">
      <article class="card funnel">
        <header><div><h2>客户阶段分布</h2><p>快速识别销售漏斗中的客户状态</p></div><b>{{ visibleCustomers.length }} 位客户</b></header>
        <div class="stage-list">
          <div v-for="stage in stages" :key="stage.key"><span>{{ stage.label }}</span><div><i :style="{ width: `${Math.max(stage.count / maxStage * 100, stage.count ? 8 : 0)}%`, background: stage.color }" /></div><b>{{ stage.count }}</b></div>
        </div>
      </article>
      <article class="card ranking">
        <header><div><h2>销售业绩排行</h2><p>按成交金额和成交客户排序</p></div></header>
        <div class="rank-head"><span>排名 / 负责人</span><span>客户</span><span>成交</span><span>成交金额</span></div>
        <div v-for="(owner, index) in ownerRanking" :key="owner.id" class="rank-row"><strong><i>{{ index + 1 }}</i>{{ owner.name }}</strong><span>{{ owner.customers }}</span><span>{{ owner.deals }}</span><b>{{ money(owner.amount) }}</b></div>
        <div v-if="!ownerRanking.length" class="empty">暂无销售账号数据</div>
      </article>
      <article class="card amount">
        <header><div><h2>金额概览</h2><p>报价金额与实际成交金额对比</p></div></header>
        <div class="amount-bars">
          <div><span>累计报价金额</span><b>{{ money(totalQuoteAmount) }}</b><i><em style="width:100%" /></i></div>
          <div><span>实际成交金额</span><b>{{ money(totalDealAmount) }}</b><i><em :style="{ width: `${totalQuoteAmount ? Math.min(totalDealAmount / totalQuoteAmount * 100, 100) : 0}%` }" /></i></div>
        </div>
      </article>
      <article class="card insight">
        <header><div><h2>经营提示</h2><p>根据当前数据自动给出的行动建议</p></div></header>
        <ul>
          <li><b>{{ stages.find(item => item.key === 'quoted')?.count || 0 }}</b><span>位客户处于已报价阶段，建议优先安排价格反馈跟进。</span></li>
          <li><b>{{ stages.find(item => item.key === 'follow')?.count || 0 }}</b><span>位客户正在跟进，确保每位客户都有下一步提醒。</span></li>
          <li><b>{{ conversionRate }}%</b><span>当前整体转化率，可结合客户来源进一步优化获客渠道。</span></li>
        </ul>
      </article>
    </section>
  </main>
</template>

<style scoped>
.stats-page{min-height:calc(100vh - 64px);max-width:1600px;margin:auto;padding:24px 28px;background:#f5f7fa}.page-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.page-heading h1{margin:0;font-size:25px}.page-heading p{margin:7px 0 0;color:#64748b;font-size:13px}.page-heading>span{color:#94a3b8;font-size:11px}.stats-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.stats-metrics article{min-height:100px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:17px 18px}.stats-metrics span{color:#64748b;font-size:12px}.stats-metrics b{display:block;margin:7px 0 5px;font-size:23px}.stats-metrics small{color:#94a3b8;font-size:11px}.stats-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}.card{min-height:300px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:18px;box-shadow:0 3px 12px rgba(15,42,67,.035)}.card header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid #edf1f5;padding-bottom:14px}.card h2{margin:0;font-size:16px}.card header p{margin:6px 0 0;color:#94a3b8;font-size:11px}.card header>b{color:#64748b;font-size:11px}.stage-list{display:grid;gap:19px;padding:24px 4px}.stage-list>div{display:grid;grid-template-columns:70px 1fr 35px;align-items:center;gap:12px;font-size:12px}.stage-list>div>div{height:9px;overflow:hidden;border-radius:5px;background:#edf2f7}.stage-list i{display:block;height:100%;border-radius:5px}.stage-list b{text-align:right}.rank-head,.rank-row{display:grid;grid-template-columns:1.5fr 55px 55px 110px;align-items:center;gap:8px}.rank-head{height:38px;color:#94a3b8;font-size:10px}.rank-row{min-height:52px;border-top:1px solid #edf1f5;font-size:11px}.rank-row strong{display:flex;align-items:center;gap:9px}.rank-row strong i{display:grid;width:23px;height:23px;place-items:center;border-radius:7px;background:#eff6ff;color:#2563eb;font-style:normal}.rank-row>b{text-align:right}.amount-bars{display:grid;gap:30px;padding:28px 4px}.amount-bars div{display:grid;grid-template-columns:1fr auto;gap:9px}.amount-bars span{color:#64748b;font-size:12px}.amount-bars b{font-size:15px}.amount-bars i{grid-column:1/-1;height:10px;overflow:hidden;border-radius:6px;background:#edf2f7}.amount-bars em{display:block;height:100%;border-radius:6px;background:#2563eb}.amount-bars div:nth-child(2) em{background:#198754}.insight ul{display:grid;gap:14px;margin:0;padding:20px 0;list-style:none}.insight li{display:grid;grid-template-columns:52px 1fr;align-items:center;border:1px solid #edf1f5;border-radius:9px;padding:12px}.insight li b{color:#2563eb;font-size:20px}.insight li span{color:#64748b;font-size:11px;line-height:1.5}.empty{padding:50px;text-align:center;color:#94a3b8}@media(max-width:900px){.stats-metrics{overflow:auto;grid-template-columns:repeat(4,minmax(170px,1fr))}.stats-grid{grid-template-columns:1fr}}@media(max-width:720px){.stats-page{min-height:calc(100vh - 56px);padding:16px 12px}.page-heading{align-items:flex-start}.page-heading>span{display:none}.stats-metrics{gap:8px}.card{min-height:0}.rank-head,.rank-row{grid-template-columns:1.4fr 45px 45px 95px}}
</style>
