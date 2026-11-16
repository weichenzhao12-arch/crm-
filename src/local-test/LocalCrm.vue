<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{ embedded?: boolean, customerId?: string, remindersOnly?: boolean }>()
const auth = props.embedded ? useAuthStore() : undefined
const admin = props.embedded ? useAdminStore() : undefined

interface Row {
  revision: string
  value: { id: string, name: string, assignedToUserId?: string, followUps?: { id: string, nextAction?: string, reminderDate?: string, reminderTime?: string, reminderDone?: boolean }[] }
}
const token = ref('')
const account = ref('')
const name = ref('')
const rows = ref<Row[]>([])
const targets = ref<{ id: string, display_name: string }[]>([])
const queue = ref(false)
const selected = ref<string[]>([])
const target = ref('')
const busy = ref(false)
const message = ref('')
const editing = ref<Row>()
const draft = ref('')
const handoff = ref({ toUserId: 'sales-2', reason: '', progress: '', nextAction: '', dueAt: '' })
const identities = [['admin', '主账号'], ['clerk', '销售文员'], ['sales1', '销售一部'], ['sales2', '销售二部']] as const
const activeAccount = computed(() => auth?.user?.account ?? account.value)
const owner = computed(() => props.embedded ? auth?.user?.role === 'owner' : account.value === 'admin')
const canAssign = computed(() => owner.value || (props.embedded
  ? auth?.user?.role !== 'viewer' && admin?.currentUser?.permissions.assignUnclaimedCustomers === true
  : account.value === 'clerk'))
const canHandoff = computed(() => owner.value || (auth?.user?.role === 'manager'
  && admin?.currentUser?.permissions.viewAllCustomers && admin.currentUser.permissions.transferCustomers))
const canEdit = (row: Row) => owner.value || (props.embedded
  ? auth?.user?.role !== 'viewer' && row.value.assignedToUserId === auth?.user?.id
  : account.value !== 'clerk')
const handoffTargets = ref<typeof targets.value>([])
const visibleRows = computed(() => props.remindersOnly
  ? rows.value.filter(row => row.value.assignedToUserId === (auth?.user?.id || ({ admin: 'owner', sales1: 'sales-1', sales2: 'sales-2', clerk: 'clerk' } as Record<string, string>)[account.value])).map(row => ({
      ...row,
      value: { ...row.value, followUps: row.value.followUps?.filter(item => item.reminderDate && !item.reminderDone) },
    })).filter(row => row.value.followUps?.length)
  : rows.value)

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/local-crm-api/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + (auth?.token ?? token.value), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.message || String(response.status))
  return data
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch (error) { message.value = String(error instanceof Error ? error.message : error) }
  finally { busy.value = false }
}

async function load(unclaimed = queue.value) {
  const id = props.customerId
  const data = id && !unclaimed
    ? { customers: [await api<Row>('customers/' + encodeURIComponent(id))], targets: [] }
    : await api<{ customers: Row[], targets?: typeof targets.value }>(unclaimed ? 'customers/unclaimed' : 'customers')
  rows.value = data.customers
  targets.value = data.targets ?? []
  queue.value = unclaimed
  selected.value = []
  editing.value = undefined
  if (!unclaimed && canHandoff.value)
    handoffTargets.value = await api<typeof targets.value>('customers/handoff-targets')
}

watch(() => [props.customerId, props.remindersOnly], () => {
  rows.value = []
  editing.value = undefined
  if (props.embedded) void run(() => load(!props.remindersOnly && !props.customerId && canAssign.value && !owner.value))
}, { immediate: true })

function signIn(id: string) {
  return run(async () => {
    const data = await api<{ token: string, user: { displayName: string } }>('auth/login', 'POST', { account: id, password: '123456' })
    token.value = data.token
    account.value = id
    name.value = data.user.displayName
    target.value = ''
    await load(id === 'clerk')
  })
}

function assign() {
  return run(async () => {
    const customers = rows.value.filter(row => selected.value.includes(row.value.id)).map(row => ({ id: row.value.id, revision: row.revision }))
    const result = await api<{ items: { assigned: boolean }[] }>('customers/unclaimed/assign', 'POST', { toUserId: target.value, customers })
    const count = result.items.filter(item => item.assigned).length
    await load()
    message.value = `已分配 ${count} 条，跳过 ${customers.length - count} 条`
  })
}

function save(transfer = false) {
  return run(async () => {
    const row = editing.value
    if (!row) return
    const path = 'customers/' + encodeURIComponent(row.value.id)
    if (transfer)
      await api(path + '/handoff', 'POST', { revision: row.revision, ...handoff.value })
    else
      await api(path, 'PATCH', { revision: row.revision, fields: { name: draft.value.trim() } })
    await load()
    message.value = transfer ? '交接完成，已创建接手提醒' : '已保存'
  })
}
</script>

<template>
  <main>
    <h1>{{ remindersOnly ? '跟进提醒' : embedded ? '客户管理' : '客资权限验收' }}</h1>
    <p>本地演示数据 · {{ auth?.user?.name || name || '请选择测试身份' }}</p>
    <nav v-if="!embedded">
      <button v-for="[id, label] in identities" :key="id" :disabled="busy" @click="signIn(id)">{{ label }}</button>
    </nav>
    <p role="status">{{ message }}</p>
    <template v-if="activeAccount">
      <nav>
        <RouterLink v-if="customerId || remindersOnly" to="/crm/customers">返回客资列表</RouterLink>
        <button v-else :disabled="busy" @click="run(() => load(false))">客资列表</button>
        <button v-if="canAssign && !customerId && !remindersOnly" :disabled="busy" @click="run(() => load(true))">待分配队列</button>
        <button :disabled="busy" @click="run(() => load())">刷新</button>
      </nav>
      <form v-if="queue" @submit.prevent="assign">
        <label>接手人 <select v-model="target" required><option value="">请选择</option><option v-for="user in targets" :key="user.id" :value="user.id">{{ user.display_name }}</option></select></label>
        <button :disabled="busy || !selected.length || selected.length > 50">分配（{{ selected.length }}）</button>
      </form>
      <table>
        <thead><tr><th v-if="queue">选择</th><th>客户</th><th>接手提醒</th><th v-if="!queue && !remindersOnly">操作</th></tr></thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.value.id">
            <td v-if="queue"><input v-model="selected" type="checkbox" :value="row.value.id" :aria-label="row.value.name"></td>
            <td>{{ row.value.name }}</td>
            <td><div v-for="item in row.value.followUps || []" :key="item.id">{{ item.reminderDate }} {{ item.reminderTime }} {{ item.nextAction }}</div></td>
            <td v-if="!queue && !remindersOnly">
              <button v-if="canEdit(row) || (canHandoff && row.value.assignedToUserId)" :disabled="busy" @click="editing = row; draft = row.value.name; handoff = { toUserId: '', reason: '', progress: '', nextAction: '', dueAt: '' }">{{ canEdit(row) ? '编辑' : '交接' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!visibleRows.length">{{ remindersOnly ? '暂无待跟进提醒' : '暂无客资' }}</p>
      <template v-if="editing">
        <form v-if="canEdit(editing)" @submit.prevent="save()">
          <label>客户名称 <input v-model="draft" required></label>
          <button :disabled="busy || !draft.trim()">保存</button>
        </form>
        <form v-if="canHandoff && editing.value.assignedToUserId" @submit.prevent="save(true)">
          <label>接手人 <select v-model="handoff.toUserId" required><option value="">请选择</option><option v-for="user in handoffTargets.filter(item => item.id !== editing?.value.assignedToUserId)" :key="user.id" :value="user.id">{{ user.display_name }}</option></select></label>
          <label>交接原因 <input v-model="handoff.reason" required></label>
          <label>当前进展 <input v-model="handoff.progress" required></label>
          <label>下一步 <input v-model="handoff.nextAction" required></label>
          <label>截止时间 <input v-model="handoff.dueAt" type="datetime-local" required></label>
          <button :disabled="busy">确认交接</button>
        </form>
      </template>
    </template>
  </main>
</template>

<style scoped>
main { max-width: 920px; margin: 32px auto; padding: 0 16px; font: 15px/1.5 system-ui, sans-serif; color: #192623; }
h1 { font-size: 26px; }
nav, form { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }
button, select, input { font: inherit; }
button { padding: 4px 12px; border: 1px solid #afbfba; border-radius: 4px; background: #eef5f1; }
table { width: 100%; border-collapse: collapse; text-align: left; }
td, th { padding: 8px; border-bottom: 1px solid #dce5e1; overflow-wrap: anywhere; }
</style>
