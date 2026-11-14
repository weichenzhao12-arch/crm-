<script setup lang="ts">
import type { Movement, MovementKind } from './inventory'

defineProps<{ printed?: Movement, internalPrint: boolean, labels: Record<MovementKind, string>, draft?: boolean }>()
</script>

<template>
  <div class="print">
    <template v-if="printed">
      <h1>{{ draft ? '样品单' : printed.kind === 'issue' ? '样品出库单' : labels[printed.kind] + '单' }}</h1>
      <p>名称：{{ printed.customer || '—' }}</p>
      <table class="print-table">
        <thead><tr><th>分类</th><th>型号</th><th>草高</th><th>针数</th><th>针排</th><th>背胶</th><th>密度</th><th>磅重</th><th>裁样规格</th><th v-if="internalPrint">库位</th><th>份数</th></tr></thead>
        <tbody><tr v-for="line in printed.lines" :key="line.sample.id">
          <td>{{ line.sample.category || '其他' }}</td><td>{{ line.sample.product }}</td><td>{{ line.sample.height || '—' }}</td>
          <td>{{ line.sample.needleCount || '—' }}</td><td>{{ line.sample.needleRow || '—' }}</td><td>{{ line.sample.backing || '—' }}</td>
          <td>{{ line.sample.density || '—' }}</td><td>{{ line.sample.poundWeight || '—' }}</td><td>{{ line.sample.spec }}</td>
          <td v-if="internalPrint">{{ line.sample.location }}</td><td>{{ line.quantity }}</td>
        </tr></tbody>
      </table>
      <p class="print-operator">开单人：{{ printed.openedBy || '________' }}</p>
    </template>
  </div>
</template>

<style scoped src="./workshop.css"></style>
<style scoped>
@media print{
  .print{font-size:9pt;line-height:1.35}
  .print h1{margin:0 0 6px;font-size:14pt}
  .print p{margin:4px 0}
  .print-table :is(th,td){padding:3px}
  .print .print-operator{margin-top:10px;break-before:avoid}
}
</style>
