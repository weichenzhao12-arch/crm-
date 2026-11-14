<script setup lang="ts">
import { stockStatus } from './inventory'
import type { Sample } from './inventory'

defineProps<{ rows: (Sample & { quantity: number })[], total: number, manage: boolean }>()
const emit = defineEmits<{ receive: [id: string], adjust: [sample: Sample] }>()
</script>

<template>
      <div class="sample-workspace sample-table-wrap"><table>
        <thead><tr><th>分类</th><th>型号</th><th>草高</th><th>针数</th><th>针排</th><th>背胶</th><th>密度</th><th>磅重</th><th>裁样规格</th><th>库位</th><th>数量</th><th>状态</th><th v-if="manage">操作</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.id">
          <td>{{ row.category || '其他' }}</td><td>{{ row.product }}</td><td>{{ row.height || '—' }}</td>
          <td>{{ row.needleCount || '—' }}</td><td>{{ row.needleRow || '—' }}</td><td>{{ row.backing || '—' }}</td>
          <td>{{ row.density || '—' }}</td><td>{{ row.poundWeight || '—' }}</td><td>{{ row.spec }}</td><td>{{ row.location }}</td>
          <td>{{ row.quantity }}</td><td :class="{ low: row.quantity < 5 }">{{ stockStatus(row.quantity) }}</td>
          <td v-if="manage" class="row-actions"><button type="button" @click="emit('receive', row.id)">开入库单</button><button type="button" :disabled="row.quantity === 0" @click="emit('adjust', row)">减库存</button></td>
        </tr><tr v-if="!rows.length"><td :colspan="manage ? 13 : 12">{{ total ? '没有符合条件的样品' : '暂无样品' }}</td></tr></tbody>
      </table></div>
</template>

<style scoped src="./workshop.css"></style>
