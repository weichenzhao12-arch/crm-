<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import { apiFetch, CloudApiError } from '~/api/cloud-storage'
import type { StockView, warehouseAccess } from './model'
import { pendingMutation } from './mutation'
import { previewStockRows, readStockFile, sheetColumns } from './stock-sheet'
import type { StockImportRow } from './stock-sheet'
import { planStockImport } from './stock-import'

const props = defineProps<{ stocks: StockView[], access: ReturnType<typeof warehouseAccess>, actor: string }>()
const emit = defineEmits<{ reload: [] }>()
const dialog = ref<HTMLDialogElement>()
const rows = ref<StockImportRow[]>([])
const lines = ref<number[]>([])
const reason = ref('')
const error = ref('')
const busy = ref(false)
const done = ref(false)
const filename = ref('')
let fallback = ''
function excelError(text: string) {
  return text.replace(/^(?:第\s*(\d+)\s*行[：:]|Row (\d+):)/, (_, chinese, english) => `第 ${lines.value[Number(chinese || english) - 1] ?? (chinese || english)} 行：`)
}
const preview = computed(() => previewStockRows(rows.value, props.stocks, props.access, lines.value))
const batchError = computed(() => {
  if (!rows.value.length) return ''
  try {
    planStockImport(props.stocks.map(stock => ({ ...toRaw(stock), visible: Boolean(stock.visible), remnants: { ...stock.remnants } })), toRaw(rows.value), props.access)
    return ''
  }
  catch (cause) {
    const text = cause instanceof Error ? cause.message : '整批校验失败'
    return excelError(text)
  }
})
const valid = computed(() => rows.value.length && !batchError.value && preview.value.every(item => !item.error))
const writableColumns = sheetColumns.filter(([key]) => !['rolls', 'remnants', 'availableRolls', 'availableRemnants', 'reservedRolls', 'reservedRemnants', 'physicalArea', 'availableArea'].includes(key))
function open() { dialog.value?.showModal() }
defineExpose({ open })
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  busy.value = true; error.value = ''; rows.value = []; done.value = false; reason.value = ''
  try {
    const result = await readStockFile(file)
    rows.value = result.rows; lines.value = result.lineNumbers; filename.value = file.name; fallback = crypto.randomUUID()
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '文件读取失败' }
  finally { busy.value = false; input.value = '' }
}
async function confirm() {
  if (busy.value || done.value || !valid.value || !reason.value.trim() || !props.access.importStock) return
  busy.value = true; error.value = ''
  try {
    const body = { rows: rows.value, reason: reason.value.trim() }
    if (new TextEncoder().encode(JSON.stringify(body)).length > 1024 * 1024) throw new Error('入库数据不能超过1MB')
    const attempt = await pendingMutation(props.actor, 'import', body, fallback)
    await apiFetch('/api/local-warehouse/import', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: JSON.stringify(body) })
    attempt.resolved(); done.value = true; emit('reload')
  }
  catch (cause) {
    error.value = excelError(cause instanceof Error ? cause.message : '入库失败')
    if (cause instanceof CloudApiError && cause.status === 409) error.value += '；库存已刷新，文件保留，请核对后重试。'
    emit('reload')
  }
  finally { busy.value = false }
}
function cell(row: StockImportRow, key: string) {
  const value = row[key as keyof StockImportRow]
  if (key === 'receiveRemnants') return row.receiveRemnants.map(part => `${part.meters}×${part.count}`).join('; ')
  if (key === 'visible') return value === undefined ? '' : value ? '是' : '否'
  return value ?? ''
}
</script>

<template>
  <dialog ref="dialog" class="wh-dialog sheet-dialog" @cancel.prevent="!busy && dialog?.close()">
    <header class="wh-header"><h2>表格入库预览</h2><button type="button" :disabled="busy" @click="dialog?.close()">关闭</button></header>
    <label v-if="access.importStock">入库文件<input type="file" accept=".xlsx,.xls,.csv" :disabled="busy" @change="upload"></label>
    <p v-if="error" role="alert" class="wh-error">{{ error }}</p>
    <p v-if="batchError" role="alert" class="wh-error">{{ batchError }}</p>
    <p v-if="done" role="status" class="wh-notice">入库成功</p>
    <template v-if="rows.length">
      <p>{{ filename }} · {{ rows.length }} 行</p>
      <p>仅追加本次入库数量，库存快照不导入。相同完整规格合并入库，请核对全部行。</p>
      <div class="wh-scroll"><table class="wh-table"><thead><tr><th>行号</th><th>处理</th><th v-for="[key, label] in writableColumns" :key="key">{{ label }}</th><th>校验</th></tr></thead><tbody>
        <tr v-for="item in preview" :key="item.line"><td>{{ item.line }}</td><td>{{ item.action }}</td><td v-for="[key] in writableColumns" :key="key">{{ cell(item.row, key) }}</td><td :class="{ 'wh-error': item.error }">{{ item.error || '通过' }}</td></tr>
      </tbody></table></div>
      <form @submit.prevent="confirm"><label>入库原因<input v-model="reason" required maxlength="300" :disabled="busy || done"></label><footer class="wh-actions"><button type="button" :disabled="busy" @click="emit('reload')">刷新库存</button><button v-if="access.importStock" class="wh-primary" :disabled="busy || done || !valid || !reason.trim()">{{ busy ? '处理中' : done ? '已完成入库' : '确认整批入库' }}</button></footer></form>
    </template>
  </dialog>
</template>

<style scoped>
.sheet-dialog { width: min(1500px, 96vw); max-width: 96vw; }
.sheet-dialog .wh-scroll { max-height: 55vh; overflow: auto; }
.sheet-dialog th, .sheet-dialog td { white-space: nowrap; max-width: 360px; overflow-wrap: anywhere; }
.sheet-dialog p { overflow-wrap: anywhere; }
</style>
