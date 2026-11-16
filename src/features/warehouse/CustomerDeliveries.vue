<script setup lang="ts">
import { ref, watch } from 'vue'
import { apiFetch } from '~/api/cloud-storage'
import { orderArea, warehouseFields } from './model'
import type { Order } from './model'

const props = defineProps<{ customerId: string }>()
const orders = ref<Order[]>([])
const error = ref('')
const loading = ref(false)
const revision = ref(0)
const labels = { pending: '待出库（已锁定）', shipped: '已出库', rejected: '已退回修改', returned: '已退货', cancelled: '已撤销' }
watch([() => props.customerId, revision], async ([id], _, cleanup) => {
  let active = true
  cleanup(() => { active = false })
  orders.value = []
  error.value = ''
  loading.value = true
  try {
    const data = await apiFetch<{ orders: Order[] }>(`/api/local-warehouse/customer-orders?customerId=${encodeURIComponent(id)}`)
    if (active) orders.value = data.orders
  }
  catch (cause) { if (active) error.value = cause instanceof Error ? cause.message : '发货记录读取失败' }
  finally { if (active) loading.value = false }
}, { immediate: true })
</script>

<template>
  <section class="customer-deliveries">
    <button type="button" :disabled="loading" @click="revision++">刷新发货记录</button>
    <p v-if="loading">正在读取发货记录…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!orders.length" class="empty">暂无绑定发货记录</p>
    <article v-for="order in orders" :key="order.id" class="delivery-record">
      <header><b>{{ order.id }}</b><span>{{ labels[order.status] }}</span></header>
      <p>{{ order.date }} · 开单人：{{ order.openedBy }} · 收货名称：{{ order.receiver }}</p>
      <p>收货地址：{{ order.address || '－' }}　电话：{{ order.phone || '－' }}</p>
      <p v-if="order.reason">原因：{{ order.reason }}</p>
      <div v-for="(line, i) in order.lines" :key="i" class="delivery-record-line">
        <b>{{ line.product.code }} · {{ line.product.name }}</b>
        <p>{{ warehouseFields.filter(([key]) => !['code', 'name'].includes(key)).map(([key, label]) => `${label}：${line.product[key] || '－'}`).join(' · ') }}</p>
        <p>{{ line.width }} × {{ line.meters }}m · {{ line.count }} {{ line.kind === 'roll' ? '卷' : '段' }} · {{ orderArea(line) }}㎡<span v-if="line.price !== null"> · 单价 {{ line.price.toFixed(2) }} 元/㎡</span></p>
      </div>
      <p v-if="order.driver || order.plate">司机：{{ order.driver || '－' }}　电话：{{ order.driverPhone || '－' }}　车牌：{{ order.plate || '－' }}</p>
    </article>
  </section>
</template>

<style scoped>
.customer-deliveries { min-width: 0; }
.delivery-record { padding: 14px 0; border-bottom: 1px solid var(--crm-line); overflow-wrap: anywhere; }
.delivery-record header { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
.delivery-record p { margin: 6px 0; font-size: 13px; color: var(--crm-muted); }
.delivery-record-line { margin: 10px 0; padding-left: 10px; border-left: 2px solid var(--crm-line-strong); }
</style>
