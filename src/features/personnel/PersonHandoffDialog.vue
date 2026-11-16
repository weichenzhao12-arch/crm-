<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '~/api/cloud-storage'
import { useAuthStore } from '~/stores/auth'
import { pendingMutation } from '~/features/warehouse/mutation'
import './personnel.css'

type Mode = 'department' | 'leave' | 'handoff'
interface Person { id: string, name: string, departmentId: string, revision: string, enabled: boolean }
interface Preview {
  source: Person, targets: Person[], departments: { id: string, name: string }[],
  customers: { id: string, name: string, revision: string, reminders: number }[],
  ordersRevision: string, openOrders: { id: string, customerId: string, receiver: string, status: string, suggestedTargetId?: string }[],
}
const props = defineProps<{ sourceId: string, mode: Mode, nextDepartmentId?: string, initialCustomerIds?: string[], initialTargetId?: string }>()
const emit = defineEmits<{ close: [], completed: [] }>()
const auth = useAuthStore()
const dialog = ref<HTMLDialogElement>()
const data = ref<Preview | null>(null)
const error = ref('')
const loading = ref(false)
const busy = ref(false)
const step = ref<'edit' | 'review'>('edit')
const policy = ref(props.mode === 'department' ? 'retain' : 'transfer')
const departmentId = ref(props.nextDepartmentId || '')
const reason = ref('')
const search = ref('')
const selected = ref<string[]>([])
const targets = ref<string[]>(props.initialTargetId ? [props.initialTargetId] : [])
const distribution = ref<'single' | 'even' | 'counts' | 'manual'>('single')
const counts = ref<Record<string, number>>({})
const manual = ref<Record<string, string>>({})
const orderTarget = ref('')
const prepared = ref<Record<string, unknown> | null>(null)
let requestKey = crypto.randomUUID()
const filteredCustomers = computed(() => data.value?.customers.filter(customer => customer.name.toLowerCase().includes(search.value.trim().toLowerCase())) || [])
const transfers = computed(() => data.value?.customers.filter(customer => selected.value.includes(customer.id)) || [])
const allocation = computed(() => {
  const result: Record<string, string> = {}
  if (policy.value === 'retain') return result
  const slots = distribution.value === 'counts'
    ? targets.value.flatMap(id => Array.from({ length: Number.isInteger(counts.value[id]) && counts.value[id]! > 0 ? Math.min(counts.value[id]!, 5000) : 0 }, () => id)) : targets.value
  transfers.value.forEach((customer, i) => { result[customer.id] = distribution.value === 'manual' ? manual.value[customer.id] || '' : distribution.value === 'counts' ? slots[i] || '' : distribution.value === 'even' ? slots[i % slots.length] || '' : slots[0] || '' })
  return result
})
const summary = computed(() => data.value?.targets.map(target => ({ ...target, count: Object.values(allocation.value).filter(id => id === target.id).length })).filter(target => target.count) || [])
const validation = computed(() => {
  if (!data.value) return '请先读取人员资料'
  if (!reason.value.trim()) return '请填写交接原因'
  if (props.mode === 'leave' && transfers.value.length !== data.value.customers.length) return '离职交接必须包含全部客资'
  if (props.mode === 'handoff' && !transfers.value.length) return '请选择交接客资'
  if (props.mode === 'department' && policy.value === 'transfer' && data.value.customers.length && !transfers.value.length) return '请选择交接客资，或改为客户继续跟随本人'
  if (policy.value === 'transfer' && transfers.value.length) {
    if (distribution.value === 'single' && targets.value.length !== 1) return '单人分配请选择一位接手人'
    if (distribution.value === 'counts' && targets.value.some(id => !Number.isInteger(counts.value[id]) || counts.value[id]! < 0 || counts.value[id]! > 5000)) return '接手数量必须为0至5000的整数'
    if (distribution.value === 'counts' && targets.value.reduce((sum, id) => sum + (counts.value[id] || 0), 0) !== transfers.value.length) return '分配数量合计必须等于所选客资数量'
    if (transfers.value.some(customer => !data.value!.targets.some(target => target.id === allocation.value[customer.id]))) return '请为每位客户选择接手人'
  }
  if (props.mode === 'leave' && data.value.openOrders.some(order => !allocation.value[order.customerId] && !order.suggestedTargetId) && !orderTarget.value) return '请指定其他未完成单据的接手人'
  return ''
})
async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch<Preview>(`/api/local-personnel/?sourceId=${encodeURIComponent(props.sourceId)}&mode=${props.mode}`)
    selected.value = props.initialCustomerIds ? data.value.customers.filter(customer => props.initialCustomerIds!.includes(customer.id)).map(customer => customer.id) : data.value.customers.map(customer => customer.id)
    if (props.nextDepartmentId === undefined) departmentId.value = data.value.source.departmentId
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '读取失败' }
  finally { loading.value = false }
}
function toggleTarget(id: string, checked: boolean) {
  targets.value = checked ? distribution.value === 'single' ? [id] : [...new Set([...targets.value, id])] : targets.value.filter(item => item !== id)
}
function preview() {
  error.value = validation.value
  if (error.value || !data.value) return
  prepared.value = {
    mode: props.mode, sourceId: props.sourceId, sourceRevision: data.value.source.revision,
    ordersRevision: data.value.ordersRevision, departmentId: departmentId.value, reason: reason.value.trim(),
    assignments: policy.value === 'retain' ? [] : transfers.value.map(customer => ({ id: customer.id, revision: customer.revision, toUserId: allocation.value[customer.id], targetRevision: data.value!.targets.find(target => target.id === allocation.value[customer.id])!.revision })),
    orderTargetId: orderTarget.value, orderTargetRevision: data.value.targets.find(target => target.id === orderTarget.value)?.revision || '',
  }
  requestKey = crypto.randomUUID()
  step.value = 'review'
}
async function submit() {
  if (busy.value || !prepared.value) return
  busy.value = true
  error.value = ''
  try {
    const attempt = await pendingMutation(auth.user?.id || '', 'personnel-handoff', prepared.value, requestKey)
    await apiFetch('/api/local-personnel/', { method: 'POST', body: JSON.stringify(prepared.value), headers: { 'Idempotency-Key': attempt.key } })
    attempt.resolved()
    dialog.value?.close()
    emit('completed')
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '交接失败' }
  finally { busy.value = false }
}
onMounted(() => { dialog.value?.showModal(); void load() })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ph-dialog" @cancel.prevent="!busy && emit('close')">
      <header><h2>{{ { department: '调部门与客户交接', leave: '离职交接', handoff: '批量客户交接' }[mode] }}</h2><button :disabled="busy" @click="emit('close')">关闭</button></header>
      <p v-if="loading">正在读取交接资料…</p><p v-if="error" class="ph-error" role="alert">{{ error }}</p>
      <template v-if="data">
        <p><b>{{ data.source.name }}</b> · {{ data.departments.find(item => item.id === data!.source.departmentId)?.name || '未分部门' }} · 客资 {{ data.customers.length }} 位 · 未完成单据 {{ data.openOrders.length }} 张</p>
        <template v-if="step === 'edit'">
          <div class="ph-fields"><label v-if="mode === 'department'">调入部门<select v-model="departmentId"><option value="">未分部门</option><option v-for="department in data.departments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label><label v-if="mode === 'department'">客户处理<select v-model="policy"><option value="retain">客户继续跟随本人</option><option value="transfer">交接部分或全部客户</option></select></label><label>交接原因<input v-model.trim="reason" maxlength="1000" required></label></div>
          <template v-if="policy === 'transfer'">
            <div class="ph-fields"><label>分配方式<select v-model="distribution"><option value="single">全部交给一人</option><option value="even">多人平均分配</option><option value="counts">按人数额分配</option><option value="manual">逐条指定</option></select></label><label>搜索客资<input v-model="search" type="search"></label><button @click="selected = data.customers.map(customer => customer.id)">全选客资</button><button @click="selected = []">清空选择</button></div>
            <div v-if="distribution !== 'manual'" class="ph-targets"><label v-for="target in data.targets" :key="target.id"><input :checked="targets.includes(target.id)" type="checkbox" @change="toggleTarget(target.id, ($event.target as HTMLInputElement).checked)">{{ target.name }}<input v-if="distribution === 'counts' && targets.includes(target.id)" v-model.number="counts[target.id]" :aria-label="`${target.name} 接手数量`" type="number" min="0" max="5000" step="1"></label></div>
            <div class="ph-scroll"><table><thead><tr><th>选择</th><th>客户名称</th><th>未完成提醒</th><th>接手人</th></tr></thead><tbody><tr v-for="customer in filteredCustomers" :key="customer.id"><td><input v-model="selected" :value="customer.id" type="checkbox" :aria-label="`交接 ${customer.name}`"></td><td>{{ customer.name }}</td><td>{{ customer.reminders }}</td><td><select v-if="distribution === 'manual'" v-model="manual[customer.id]" :aria-label="`${customer.name} 接手人`"><option value="">请选择</option><option v-for="target in data.targets" :key="target.id" :value="target.id">{{ target.name }}</option></select><span v-else>{{ data.targets.find(target => target.id === allocation[customer.id])?.name || '未分配' }}</span></td></tr><tr v-if="!filteredCustomers.length"><td colspan="4">暂无客资</td></tr></tbody></table></div>
          </template>
          <label v-if="mode === 'leave' && data.openOrders.some(order => !allocation[order.customerId] && !order.suggestedTargetId)" class="ph-order-target">其他未完成单据接手人<select v-model="orderTarget"><option value="">请选择</option><option v-for="target in data.targets" :key="target.id" :value="target.id">{{ target.name }}</option></select></label>
          <footer><button :disabled="loading || busy" @click="load">重新读取</button><button class="ph-primary" @click="preview">预览交接</button></footer>
        </template>
        <template v-else>
          <h3>交接预览</h3>
          <p v-if="mode === 'department'">调入：{{ data.departments.find(item => item.id === departmentId)?.name || '未分部门' }}</p>
          <p v-if="policy === 'retain'">客户仍由 {{ data.source.name }} 负责</p>
          <p v-for="target in summary" :key="target.id">{{ target.name }}：{{ target.count }} 位客户</p>
          <p v-for="order in data.openOrders.filter(order => allocation[order.customerId] || mode === 'leave')" :key="order.id">未完成单据 {{ order.id }}：{{ data.targets.find(target => target.id === (allocation[order.customerId] || order.suggestedTargetId || orderTarget))?.name || '未分配' }}</p>
          <p v-if="mode === 'leave'">账号处理：停用账号并撤销登录会话，保留历史记录</p>
          <p>原因：{{ reason }}</p><p>客户提醒：保留并跟随客户归属　库存锁定：不变</p>
          <footer><button :disabled="busy" @click="step = 'edit'">返回修改</button><button class="ph-primary" :disabled="busy" @click="submit">确认交接</button></footer>
        </template>
      </template>
    </dialog>
  </Teleport>
</template>
