<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useTheme } from '~/composables/useTheme'

const route = useRoute()
const router = useRouter()
const { isAuthenticated, logout, user } = useAuth()
const { themeLabel, toggleTheme } = useTheme()
const title = computed(() => route.path.startsWith('/quote') ? '报价系统' : 'CRM 客资系统')
const subtitle = computed(() => route.path.startsWith('/quote') ? '选择产品，快速出价' : '客资分配、客户跟进、报价管理')

async function handleLogout() {
  await logout()
  await router.push('/login')
}
</script>

<template>
  <div class="app-layout min-h-screen bg-[#f3f6f9] text-[#17202a]" :class="{ 'quote-layout': route.path.startsWith('/quote') }">
    <header class="app-layout-header sticky top-0 z-20 border-b border-[#d9e1ea] bg-white/95 backdrop-blur">
      <div class="layout-bar mx-auto max-w-[1680px] flex items-center justify-between gap-4 px-8 py-4">
        <div class="layout-brand flex items-center gap-3">
          <div class="layout-icon grid size-10 place-items-center rounded-lg bg-[#1f5f8b] text-white shadow-[0_10px_24px_rgba(31,95,139,.18)]">
            <span class="i-carbon-calculator text-lg" />
          </div>
          <div>
            <p class="layout-title text-sm font-semibold tracking-wide">{{ title }}</p>
            <p class="layout-subtitle text-xs text-[#6b7785]">{{ subtitle }}</p>
          </div>
        </div>
        <div class="layout-actions flex items-center gap-2">
          <span v-if="isAuthenticated" class="hidden text-sm text-[#516174] sm:inline">{{ user?.name }}</span>
          <button class="border border-[#cfd8e3] rounded-md bg-white px-4 py-2 text-sm text-[#344255] hover:border-[#1f5f8b] hover:text-[#1f5f8b]" type="button" @click="toggleTheme">{{ themeLabel }}</button>
          <button v-if="isAuthenticated" class="rounded-md bg-[#243447] px-4 py-2 text-sm text-white" type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </header>
    <RouterView />
  </div>
</template>

<style scoped>
@media(max-width:720px){
  .layout-bar{
    padding:10px 12px!important;
    gap:10px!important;
  }
  .layout-icon{
    width:34px!important;
    height:34px!important;
    border-radius:10px!important;
  }
  .layout-title{
    font-size:13px!important;
    line-height:1.2!important;
  }
  .layout-subtitle{
    display:none!important;
  }
  .layout-actions{
    gap:6px!important;
  }
  .layout-actions button{
    min-height:34px!important;
    padding:6px 9px!important;
    font-size:12px!important;
    white-space:nowrap!important;
  }
  .quote-layout .app-layout-header{
    position:static!important;
  }
}
</style>
