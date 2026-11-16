<script setup lang="ts">
import { computed, ref } from 'vue'

export interface CustomerOption { id: string, name: string, phone?: string }
const props = defineProps<{ modelValue: string, customerId: string, options: CustomerOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string], select: [customer: CustomerOption] }>()
const dialog = ref<HTMLDialogElement>()
const query = ref('')
const selectedId = ref('')
const page = ref(0)
const matches = computed(() => {
  const search = query.value.trim().toLowerCase()
  return props.options.filter(option => `${option.name} ${option.phone || ''}`.toLowerCase().includes(search))
})
const rows = computed(() => matches.value.slice(page.value * 12, page.value * 12 + 12))
function open() {
  query.value = ''
  page.value = 0
  selectedId.value = props.customerId
  dialog.value?.showModal()
}
function confirm() {
  const customer = props.options.find(option => option.id === selectedId.value)
  if (!customer) return
  emit('select', customer)
  dialog.value?.close()
}
</script>

<template>
  <div class="wh-customer-picker">
    <label>客户 / 收货人<input :value="modelValue" autocomplete="off" placeholder="手填收货名称或选择客户" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"></label>
    <button type="button" @click="open">选择客户</button>
    <small v-if="customerId" class="wh-bound">已绑定客户</small>
    <dialog ref="dialog" class="wh-dialog wh-customer-dialog" @cancel.stop>
      <header class="wh-header"><h2>选择客户</h2><button type="button" @click="dialog?.close()">关闭客户选择</button></header>
      <label>搜索客户<input v-model="query" type="search" placeholder="客户名称或电话" @input="page = 0"></label>
      <div class="wh-scroll">
        <table class="wh-table">
          <thead><tr><th>选择</th><th>客户名称</th><th>联系电话</th></tr></thead>
          <tbody>
            <tr v-for="option in rows" :key="option.id" @click="selectedId = option.id">
              <td><input v-model="selectedId" type="radio" name="warehouse-customer" :value="option.id" :aria-label="`选择 ${option.name}（${option.phone || option.id}）`"></td>
              <td>{{ option.name }}</td><td>{{ option.phone || '－' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="3" class="wh-empty">暂无可选择客户</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="wh-actions">
        <span>共 {{ matches.length }} 位客户</span>
        <button type="button" :disabled="page === 0" @click="page--">上一页</button>
        <button type="button" :disabled="(page + 1) * 12 >= matches.length" @click="page++">下一页</button>
        <button type="button" class="wh-primary" :disabled="!options.some(option => option.id === selectedId)" @click="confirm">确认选择</button>
      </footer>
    </dialog>
  </div>
</template>
