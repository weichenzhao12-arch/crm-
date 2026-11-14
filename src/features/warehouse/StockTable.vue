<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StockView } from './model'
import { warehouseFields } from './model'

const props = withDefaults(defineProps<{ stocks: StockView[], maintain?: boolean }>(), { maintain: true })
const emit = defineEmits<{ maintain: [stock: StockView] }>()
const search = ref('')
const category = ref('')
const height = ref('')
const categories = computed(() => [...new Set(props.stocks.map(stock => stock.category))].sort())
const heights = computed(() => [...new Set(props.stocks.map(stock => stock.height).filter(Boolean))].sort())
const rows = computed(() => props.stocks.filter(stock => (!category.value || stock.category === category.value)
  && (!height.value || stock.height === height.value)
  && warehouseFields.some(([key]) => stock[key].toLowerCase().includes(search.value.trim().toLowerCase()))))
</script>

<template>
  <div class="wh-tools">
    <label>搜索<input v-model="search" placeholder="货号、名称或规格"></label>
    <label>分类<select v-model="category"><option value="">全部</option><option v-for="item in categories" :key="item">{{ item }}</option></select></label>
    <label>草高<select v-model="height"><option value="">全部</option><option v-for="item in heights" :key="item">{{ item }}</option></select></label>
    <button type="button" @click="search = ''; category = ''; height = ''">重置</button>
  </div>
  <div class="wh-scroll">
    <table class="wh-table">
      <thead><tr><th v-for="[key, label] in warehouseFields" :key="key">{{ label }}</th><th>宽 × 长 (m)</th><th>可用整卷</th><th>可用零货 (m)</th><th v-if="stocks.some(stock => stock.availableRolls !== undefined)">实存 / 锁定卷数</th><th v-if="stocks.some(stock => stock.visible !== undefined)">代理商 / 操作</th></tr></thead>
      <tbody>
        <tr v-for="stock in rows" :key="stock.id">
          <td v-for="[key] in warehouseFields" :key="key">{{ stock[key] || '－' }}</td>
          <td>{{ stock.width }} × {{ stock.length }}</td><td><b>{{ stock.availableRolls ?? stock.rolls }}</b> 卷</td>
          <td><span v-for="([meters, count], i) in Object.entries(stock.availableRemnants ?? stock.remnants)" :key="meters">{{ i ? '、' : '' }}{{ meters }}m{{ count > 1 ? ` × ${count}` : '' }}</span><span v-if="!Object.keys(stock.availableRemnants ?? stock.remnants).length">－</span></td>
          <td v-if="stock.availableRolls !== undefined">{{ stock.rolls }} / {{ stock.reservedRolls ?? 0 }}</td><td v-if="stock.visible !== undefined"><button v-if="maintain" type="button" @click="emit('maintain', stock)">{{ stock.visible ? '已公开' : '未公开' }} · 维护</button><span v-else>{{ stock.visible ? '已公开' : '未公开' }}</span></td>
        </tr>
        <tr v-if="!rows.length"><td colspan="16" class="wh-empty">暂无符合条件的现货</td></tr>
      </tbody>
    </table>
  </div>
</template>
