<script setup lang="ts">
import type { AdminUser, Department } from '../../stores/admin'
import type { CustomerScope } from './scope'

const props = defineProps<{ user: AdminUser, departments: Department[], authorized: boolean }>()
const emit = defineEmits<{ save: [] }>()
function changeScope(event: Event) {
  if (!props.authorized) return
  const value = (event.target as HTMLSelectElement).value as CustomerScope
  if (!['own', 'team', 'all'].includes(value)) return
  props.user.permissions.customerScope = value
  props.user.permissions.viewAllCustomers = value === 'all'
  emit('save')
}
function changeDepartments(event: Event) {
  if (!props.authorized || props.user.permissions.position !== 'director') return
  props.user.permissions.managedDepartmentIds = Array.from((event.target as HTMLSelectElement).selectedOptions, option => option.value)
  emit('save')
}
</script>

<template>
  <div v-if="authorized" class="scope-fields">
    <label>客户范围<select aria-label="客户范围" :value="user.permissions.viewAllCustomers ? 'all' : user.permissions.customerScope || 'own'" @change="changeScope"><option value="own">本人</option><option value="team" :disabled="!['supervisor', 'director'].includes(user.permissions.position || '')">团队</option><option value="all">全部</option></select></label>
    <label v-if="user.permissions.position === 'director'">管理部门<select aria-label="管理部门" multiple :value="user.permissions.managedDepartmentIds || []" @change="changeDepartments"><option v-for="department in departments" :key="department.id" :value="department.id" :disabled="!department.enabled">{{ department.name }}{{ department.enabled ? '' : '（已停用）' }}</option></select></label>
  </div>
</template>

<style scoped>
.scope-fields{display:flex;gap:12px;flex-wrap:wrap}.scope-fields label{display:grid;gap:6px;min-width:140px;max-width:100%;font-size:13px}.scope-fields select{max-width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:4px}.scope-fields select[multiple]{min-height:88px}
</style>
