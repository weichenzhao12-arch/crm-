<script setup lang="ts">
import { onMounted, ref } from 'vue'
import StockTable from './StockTable.vue'
import type { StockView } from './model'
import './warehouse.css'

const password = ref('')
const stocks = ref<StockView[] | null>(null)
const error = ref('')
const busy = ref(false)
const endpoint = '/api/local-warehouse/dealer'

async function request(method: 'GET' | 'POST' | 'DELETE') {
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(endpoint, method === 'POST'
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password.value }) }
      : { method })
    const data = await response.json()
    if (method === 'GET' && response.status === 401) { stocks.value = null; return }
    if (!response.ok) throw new Error(data.message)
    if (method === 'GET') stocks.value = data.stocks
    if (method === 'DELETE') stocks.value = null
    if (method === 'POST') { password.value = ''; await request('GET') }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '查询失败' }
  finally { busy.value = false }
}
onMounted(() => request('GET'))
</script>

<template>
  <main class="wh-page wh-dealer">
    <header class="wh-header"><div><p class="wh-brand">金特夫 · KING TURF</p><h1>代理商现货查询</h1></div><div v-if="stocks" class="wh-actions"><button :disabled="busy" @click="request('GET')">刷新库存</button><button :disabled="busy" @click="request('DELETE')">退出</button></div></header>
    <p v-if="error" class="wh-error" role="alert">{{ error }}</p>
    <StockTable v-if="stocks" :stocks="stocks" />
    <form v-else class="wh-tools wh-password" @submit.prevent="request('POST')"><label>查询密码<input v-model="password" type="password" autocomplete="current-password" required></label><button class="wh-primary" :disabled="busy">查看库存</button></form>
  </main>
</template>
