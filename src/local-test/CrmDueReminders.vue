<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useAuthStore } from '~/stores/auth'
import { useCrmStore } from '~/stores/crm'
import { claimDailyReminder, dueReminderGroups, reminderCustomers } from '~/features/crm/due-reminders'
import { followDay } from '~/features/crm/today-follow'

const props = defineProps<{ inline?: boolean }>()
const admin = useAdminStore()
const auth = useAuthStore()
const crm = useCrmStore()
const dialog = ref<HTMLDialogElement>()
const day = followDay()
const user = computed(() => auth.user?.id === admin.currentUser?.id ? admin.currentUser : undefined)
const groups = computed(() => dueReminderGroups(crm.cloudLoadState === 'ready' ? reminderCustomers(crm.customers, user.value) : [], day))
const count = computed(() => groups.value.reduce((total, group) => total + group.entries.length, 0))

onMounted(() => { if (!props.inline) void crm.loadCloudCustomers() })
watch([count, user, dialog], () => {
  if (!count.value || !user.value || !dialog.value?.showModal || dialog.value.open) return
  if (claimDailyReminder(localStorage, user.value.id, day)) dialog.value.showModal()
}, { flush: 'post' })
</script>

<template>
  <section v-if="inline" class="due-home" aria-labelledby="due-home-title">
    <div class="due-heading"><h2 id="due-home-title">今日待办</h2><RouterLink to="/crm/follow-ups">全部待办</RouterLink></div>
    <p v-if="crm.cloudLoadState !== 'ready'">{{ crm.cloudLoadState === 'error' ? '暂时无法读取待办' : '正在读取待办' }}</p>
    <div v-else class="due-groups">
      <section v-for="group in groups" :key="group.key">
        <h3>{{ group.key === 'today' ? '今日到期' : group.label }} <b>{{ group.entries.length }}</b></h3>
        <p v-if="!group.entries.length">暂无</p>
        <ul v-else><li v-for="{ customer, reminder } in group.entries.slice(0, 3)" :key="customer.id + ':' + reminder.id">
          <RouterLink :to="'/crm/customer/' + customer.id">{{ customer.name }}</RouterLink>
          <span>{{ reminder.reminderDate }} {{ reminder.reminderTime }} · {{ reminder.nextAction || reminder.content }}</span>
        </li></ul>
      </section>
    </div>
  </section>
  <dialog v-else ref="dialog" class="due-dialog" aria-labelledby="due-dialog-title">
    <h2 id="due-dialog-title">待办提醒</h2>
    <div class="due-groups">
      <section v-for="group in groups" :key="group.key">
        <h3>{{ group.label }} <b>{{ group.entries.length }}</b></h3>
        <p v-if="!group.entries.length">暂无</p>
        <ul v-else><li v-for="{ customer, reminder } in group.entries.slice(0, 5)" :key="customer.id + ':' + reminder.id">
          <RouterLink :to="'/crm/customer/' + customer.id" @click="dialog?.close()">{{ customer.name }}</RouterLink>
          <span>{{ reminder.reminderDate }} {{ reminder.reminderTime }} · {{ reminder.nextAction || reminder.content }}</span>
        </li></ul>
      </section>
    </div>
    <div class="due-actions">
      <button type="button" autofocus @click="dialog?.close()">稍后处理</button>
      <RouterLink to="/crm/follow-ups" @click="dialog?.close()">查看全部待办</RouterLink>
    </div>
  </dialog>
</template>

<style scoped>
.due-home,.due-dialog{color:var(--crm-text);background:var(--crm-surface);border:1px solid var(--crm-line-strong);border-radius:8px;padding:16px}
.due-dialog{width:min(680px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto}
.due-dialog::backdrop{background:#13284070}
.due-heading,.due-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.due-actions{justify-content:flex-end;margin-top:16px}
h2{font-size:18px;margin:0 0 8px}
h3{font-size:14px;margin:8px 0}
.due-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.due-groups section{border-top:1px solid var(--crm-line);min-width:0}
ul{list-style:none;margin:0;padding:0}
li{display:flex;flex-wrap:wrap;gap:4px 10px;padding:6px 0;overflow-wrap:anywhere}
a{color:var(--crm-blue-dark);font-weight:600}
button{border:1px solid var(--crm-line-strong);border-radius:6px;padding:6px 12px;background:white;color:inherit}
@media(max-width:600px){.due-groups{grid-template-columns:minmax(0,1fr)}}
@media print{.due-home,.due-dialog{display:none!important}}
</style>
