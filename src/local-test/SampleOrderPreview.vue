<script setup lang="ts">
import type { Movement } from './inventory'

defineProps<{ preview: Movement }>()
const emit = defineEmits<{ edit: [], confirm: [entry: Movement] }>()
</script>

<template>
      <section class="issue-preview sample-workspace" :aria-label="preview.kind === 'issue' ? '寄样单预览' : '入库单预览'">
        <h2>{{ preview.kind === 'issue' ? '寄样单预览' : '入库单预览' }}</h2>
        <p v-if="preview.customer">客户或领取人：{{ preview.customer }}</p>
        <p v-if="preview.reason !== '样品出库'">备注：{{ preview.reason }}</p>
        <div class="sample-table-wrap"><table>
          <thead><tr><th>分类</th><th>型号</th><th>草高</th><th>针数</th><th>针排</th><th>背胶</th><th>密度</th><th>磅重</th><th>裁样规格</th><th>库位</th><th>份数</th></tr></thead>
          <tbody><tr v-for="line in preview.lines" :key="line.sample.id">
            <td>{{ line.sample.category || '其他' }}</td><td>{{ line.sample.product }}</td><td>{{ line.sample.height || '—' }}</td><td>{{ line.sample.needleCount || '—' }}</td><td>{{ line.sample.needleRow || '—' }}</td><td>{{ line.sample.backing || '—' }}</td><td>{{ line.sample.density || '—' }}</td><td>{{ line.sample.poundWeight || '—' }}</td><td>{{ line.sample.spec }}</td><td>{{ line.sample.location }}</td><td>{{ line.quantity }}</td>
          </tr></tbody>
        </table></div>
        <div class="preview-actions">
          <button type="button" @click="emit('edit')">返回修改</button>
          <button type="button" class="primary" @click="emit('confirm', preview)">{{ preview.kind === 'issue' ? '确认出库并打印' : '确认入库并打印' }}</button>
        </div>
      </section>
</template>

<style scoped src="./workshop.css"></style>
