<script setup lang="ts">
import type { Order } from './model'
import { computed } from 'vue'
import { lineAmount, orderArea, warehouseFields } from './model'

const props = defineProps<{ order: Order, priced: boolean }>()
const pages = computed(() => Array.from({ length: Math.max(1, Math.ceil(props.order.lines.length / 5)) }, (_, i) => props.order.lines.slice(i * 5, i * 5 + 5)))
const area = computed(() => Number(props.order.lines.reduce((sum, line) => sum + orderArea(line), 0).toFixed(6)))
const rolls = computed(() => props.order.lines.filter(line => line.kind === 'roll').reduce((sum, line) => sum + line.count, 0))
const pieces = computed(() => props.order.lines.filter(line => line.kind !== 'roll').reduce((sum, line) => sum + line.count, 0))
const amount = computed(() => props.order.lines.some(line => line.price === null) ? '未填全' : props.order.lines.reduce((sum, line) => sum + (lineAmount(line) ?? 0), 0).toFixed(2))
</script>

<template>
  <article class="wh-paper">
    <section v-for="(lines, page) in pages" :key="page" class="wh-delivery-sheet">
    <table class="wh-delivery-form">
      <colgroup><col style="width:5%"><col style="width:12%"><col style="width:15%"><col style="width:28%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:6%"><col style="width:8%"><col style="width:7%"></colgroup>
      <thead>
        <tr><th colspan="10" class="wh-delivery-title">发货单</th></tr>
        <tr class="wh-delivery-meta"><td colspan="6">送货单位：金特夫</td><td colspan="4">送货日期：{{ order.date }}</td></tr>
        <tr class="wh-delivery-meta"><td colspan="10">收货名称：{{ order.receiver }}　联系电话：{{ order.phone }}</td></tr>
        <tr class="wh-delivery-meta"><td colspan="10">收货地址：{{ order.address }}</td></tr>
        <tr><th>序号</th><th>产品货号</th><th>产品名称</th><th>产品规格</th><th>送货数量</th><th>包装方式</th><th>宽<br>(m)</th><th>长<br>(m)</th><th>面积<br>(㎡)</th><th>金额<br>(元)</th></tr>
      </thead>
      <tbody>
        <tr v-for="(line, i) in lines" :key="i" class="wh-delivery-item">
          <td>{{ page * 5 + i + 1 }}</td><td>{{ line.product.code }}</td><td>{{ line.product.name }}</td>
          <td class="wh-delivery-specs"><span v-for="[key, label] in warehouseFields.filter(([key]) => !['name', 'code'].includes(key))" :key="key">{{ label }}：{{ line.product[key] || '－' }}</span></td>
          <td>{{ line.count }}{{ line.kind === 'roll' ? ' 卷' : ' 段' }}</td><td>{{ line.packaging }}</td><td>{{ line.width }}</td><td>{{ line.meters }}</td><td>{{ orderArea(line) }}</td><td>{{ priced ? (lineAmount(line)?.toFixed(2) ?? '') : '' }}</td>
        </tr>
        <tr v-for="n in 5 - lines.length" :key="`blank-${n}`" class="wh-delivery-item"><td v-for="column in 10" :key="column">&nbsp;</td></tr>
        <tr class="wh-delivery-total"><td colspan="6">{{ page === pages.length - 1 ? `面积总计：${area} ㎡` : '下页续' }}</td><td colspan="4">{{ priced && page === pages.length - 1 ? `金额合计：${amount} 元` : '' }}</td></tr>
        <tr class="wh-delivery-total"><td colspan="10">{{ page === pages.length - 1 ? `卷数总计：${rolls} 卷　零货 / 裁切：${pieces} 段` : '' }}</td></tr>
        <tr><td colspan="10" class="wh-delivery-notice">特别提示：此单一式两联，经收货人签字确认后一联由收货人保管，一联由司机带回。</td></tr>
        <tr class="wh-delivery-sign"><td colspan="5">开单人：{{ order.openedBy }}</td><td colspan="5">签收人：</td></tr>
        <tr class="wh-delivery-sign"><td colspan="3">司机姓名：{{ order.driver }}</td><td colspan="3">电话：{{ order.driverPhone }}</td><td colspan="4">车牌号：{{ order.plate }}</td></tr>
      </tbody>
    </table>
    <div class="wh-delivery-foot"><span>单号：{{ order.id }}　{{ { pending: '未出库（库存已锁定）', rejected: '已退回', shipped: '已出库', returned: '已退货', cancelled: '已撤销' }[order.status] }}</span><span>第 {{ page + 1 }} / {{ pages.length }} 页</span></div>
    </section>
  </article>
</template>
