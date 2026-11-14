<script setup lang="ts">
import { computed, ref } from 'vue'
import { shipmentStatus } from './inventory'
import type { Movement, MovementKind } from './inventory'

const props = defineProps<{ entries: Movement[], customerId?: string, documentId?: string, canIssue: boolean, canMaintain: boolean, labels: Record<MovementKind, string> }>()
const emit = defineEmits<{ print: [entry: Movement, internal?: boolean], shipment: [entry: Movement, action: 'dispatch' | 'cancel'], return: [id: string] }>()
const ledgerQuery = ref(props.documentId || '')
const ledgerDate = ref('')
const ledgerKind = ref('')
const shipment = (entry: Movement) => shipmentStatus(props.entries, entry.id)
const trackingFor = (entry: Movement) => props.entries.find(item => item.kind === 'dispatch' && item.original === entry.id)?.tracking
const ledgerRows = computed(() => [...props.entries].reverse().filter(entry =>
  (!props.customerId || entry.customerId === props.customerId)
  && (!ledgerKind.value || entry.kind === ledgerKind.value)
  && (!ledgerDate.value || entry.time.split(' ')[0] === ledgerDate.value.split('-').map(Number).join('/'))
  && [entry.id, entry.original, entry.customer, entry.reason, entry.tracking, trackingFor(entry)].join(' ').toLowerCase().includes(ledgerQuery.value.trim().toLowerCase())))
</script>

<template>
    <section class="sample-workspace">
      <h1>{{ customerId ? '客户寄样单据' : '库存流水' }}</h1>
      <div class="sample-filters">
        <label>搜索单据<input v-model="ledgerQuery" type="search" placeholder="客户、单号或快递单号"></label>
        <label>日期<input v-model="ledgerDate" type="date"></label>
        <label>类型<select v-model="ledgerKind"><option value="">全部</option><option v-for="(label, id) in labels" :key="id" :value="id">{{ label }}</option></select></label>
      </div>
      <p v-if="!ledgerRows.length" class="empty-ledger">暂无流水</p>
      <article v-for="entry in ledgerRows" :key="entry.id" class="ledger-entry">
        <div class="ledger-meta">
          <strong :data-kind="entry.kind">{{ labels[entry.kind] }}</strong>
          <time>{{ entry.time }}</time>
          <span v-if="entry.customer">{{ entry.customer }}</span>
        </div>
        <p>单号：{{ entry.id }}</p>
        <p v-if="entry.kind === 'issue'">{{ { pending: '待寄出', sent: '已寄出', cancelled: '已撤销' }[shipment(entry)] }}<span v-if="trackingFor(entry)"> · 快递单号：{{ trackingFor(entry) }}</span></p>
        <p v-if="entry.reason">{{ entry.reason }}</p>
        <ul class="ledger-lines">
          <li v-for="line in entry.lines" :key="line.sample.id"><span>{{ line.sample.product }} · {{ line.sample.spec }}</span><b>× {{ line.quantity }}</b><span v-if="entry.kind === 'pickup' && line.quantity === 0">未拿</span></li>
        </ul>
        <div class="ledger-actions">
          <button v-if="entry.lines.length && shipment(entry) !== 'cancelled'" type="button" @click="emit('print', entry, true)">打印内部单</button>
          <button v-if="entry.kind === 'issue' && shipment(entry) !== 'cancelled'" type="button" @click="emit('print', entry)">打印客户样品单</button>
          <template v-if="entry.kind === 'issue' && shipment(entry) === 'pending' && canIssue">
            <button type="button" @click="emit('shipment', entry, 'dispatch')">登记寄出</button>
            <button type="button" @click="emit('shipment', entry, 'cancel')">撤销出库</button>
          </template>
          <button v-if="entry.kind === 'issue' && shipment(entry) === 'sent' && canMaintain" type="button" @click="emit('return', entry.id)">登记退回</button>
        </div>
      </article>
    </section>
</template>

<style scoped src="./workshop.css"></style>
