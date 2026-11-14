<script setup lang="ts">
import { computed, ref } from 'vue'
import { filterSamples, sampleCategories } from './inventory'
import type { Sample } from './inventory'
import { matchesSpecifications, sampleFilterOptions } from './sample-specifications'
import type { SpecificationFilters } from './sample-specifications'

const props = defineProps<{ stockRows: (Sample & { quantity: number })[], picked: string[], kind: 'issue' | 'receipt' }>()
const emit = defineEmits<{ pick: [id: string, checked: boolean], create: [] }>()
const filterOptions = sampleFilterOptions(() => props.stockRows)
const issueSearch = ref('')
const issueCategory = ref('')
const issueSpecifications = ref<SpecificationFilters>({})
const issueRows = computed(() => filterSamples(props.stockRows, { category: issueCategory.value, stock: '', keyword: issueSearch.value })
  .filter(row => matchesSpecifications(row, issueSpecifications.value)))
</script>

<template>
          <div class="draft-lines sample-workspace">
          <div class="sample-filters rows-filters">
            <label>搜索样品<input v-model="issueSearch" type="search" placeholder="型号、规格或库位"></label>
            <label>分类<select v-model="issueCategory"><option value="">全部</option><option v-for="category in sampleCategories" :key="category">{{ category }}</option></select></label>
            <label v-for="{ field, label, values } in filterOptions" :key="field">{{ label }}<select v-model="issueSpecifications[field]"><option :value="undefined">全部</option><option v-for="value in values" :key="value">{{ value }}</option></select></label>
            <button type="button" @click="issueSearch = ''; issueCategory = ''; issueSpecifications = {}">清除筛选</button>
            <button v-if="kind === 'receipt'" type="button" @click="emit('create')">建档并加入本单</button>
            <span aria-live="polite">已选 {{ picked.length }} 款</span>
          </div>
          <div class="sample-table-wrap"><table>
            <thead><tr><th>选择</th><th>分类</th><th>型号</th><th>草高</th><th>针数</th><th>针排</th><th>背胶</th><th>密度</th><th>磅重</th><th>裁样规格</th><th>库位</th><th>库存</th></tr></thead>
            <tbody><tr v-for="row in issueRows" :key="row.id">
              <td><input type="checkbox" :checked="picked.includes(row.id)" :disabled="kind === 'issue' && row.quantity <= 1 && !picked.includes(row.id)" :aria-label="`勾选 ${row.product} ${row.spec} ${row.location}`" @change="emit('pick', row.id, ($event.target as HTMLInputElement).checked)"></td>
              <td>{{ row.category || '其他' }}</td><td>{{ row.product }}</td><td>{{ row.height || '—' }}</td>
              <td>{{ row.needleCount || '—' }}</td><td>{{ row.needleRow || '—' }}</td><td>{{ row.backing || '—' }}</td><td>{{ row.density || '—' }}</td><td>{{ row.poundWeight || '—' }}</td><td>{{ row.spec }}</td><td>{{ row.location }}</td>
              <td>{{ row.quantity }}<small v-if="kind === 'issue' && row.quantity <= 1"> · 禁止出库</small></td>
            </tr><tr v-if="!issueRows.length"><td colspan="12">没有符合条件的样品</td></tr></tbody>
          </table></div>
          </div>
</template>

<style scoped src="./workshop.css"></style>
