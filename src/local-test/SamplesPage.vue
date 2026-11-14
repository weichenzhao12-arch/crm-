<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import { customerControls } from '~/features/crm/customer-controls'
import { samplePermissions } from './permissions'
import Workshop from './Workshop.vue'

const route = useRoute()
const admin = useAdminStore()
const crm = useCrmStore()
const access = computed(() => samplePermissions(admin.currentUser))
const customerOptions = computed(() => {
  const user = admin.currentUser
  if (!user || crm.cloudLoadState !== 'ready') return []
  const names = [user.displayName, user.account, user.id].map(value => value.trim()).filter(Boolean)
  const all = customerControls(user).viewAll
  return crm.customers.filter(row => all || row.assignedToUserId === user.id
    || (!row.assignedToUserId && names.includes(String(row.owner || '').trim())))
    .map(row => ({ id: row.id, name: row.name }))
})
const customer = computed(() => customerOptions.value.find(row => row.id === route.query.customer))
watch(() => route.query.customer, () => {
  if (crm.cloudLoadState !== 'ready') void crm.loadCloudCustomers()
}, { immediate: true })
</script>

<template>
  <p v-if="route.query.customer && (crm.cloudLoadState !== 'ready' || !customer)">当前客户尚未加载或不可访问。</p>
  <Workshop v-else-if="access.issue || access.maintain"
    :key="`${route.query.customer || ''}:${route.query.view || ''}:${route.query.document || ''}`"
    embedded shared :can-issue="access.issue" :can-maintain="access.maintain"
    :operator-name="admin.currentUser?.displayName || admin.currentUser?.account"
    :customer-id="customer?.id" :customer-name="customer?.name" :customer-options="customerOptions" :show-documents="route.query.view === 'ledger'" :document-id="typeof route.query.document === 'string' ? route.query.document : undefined" />
  <p v-else>当前账号没有样品出库或库存维护权限。</p>
</template>
