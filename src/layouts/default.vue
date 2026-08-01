<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import { useAuth } from '~/composables/useAuth'
import { useTheme } from '~/composables/useTheme'

const route = useRoute()
const router = useRouter()
const admin = useAdminStore()
const crm = useCrmStore()
const { isAuthenticated, logout, user } = useAuth()
const { themeLabel, toggleTheme } = useTheme()
const mobileNavOpen = ref(false)

const isQuote = computed(() => route.path.startsWith('/quote'))
const isAdmin = computed(() => route.path.startsWith('/admin'))
const pageTitle = computed(() => String(route.meta.title || (isQuote.value ? '报价管理' : isAdmin.value ? '系统管理' : '工作台')))
const canManage = computed(() => ['owner', 'manager'].includes(admin.currentUser?.role || '') || Boolean(admin.currentUser?.permissions.manageUsers))
const pendingFollowCount = computed(() => crm.customers.reduce((count, customer) =>
  count + customer.followUps.filter(follow => follow.reminderDate && !follow.reminderDone).length, 0))

const navItems = computed(() => [
  { label: '工作台', to: '/crm', icon: 'dashboard', exact: true },
  { label: '客户管理', to: '/crm/customers', icon: 'customers' },
  { label: '今日跟进', to: '/crm/follow-ups', icon: 'clock', badge: pendingFollowCount.value ? String(pendingFollowCount.value) : '' },
  { label: '报价管理', to: '/quote', icon: 'quote' },
  { label: '产品资料', to: '/admin', icon: 'product', adminOnly: true },
  { label: '数据统计', to: '/crm/statistics', icon: 'stats' },
].filter(item => !item.adminOnly || canManage.value))

function navActive(item: { to: string, exact?: boolean }) {
  const [path, query] = item.to.split('?')
  if (query) {
    const focus = new URLSearchParams(query).get('focus')
    return route.path === path && route.query.focus === focus
  }
  if (item.exact)
    return route.path === path && !route.query.focus
  return route.path.startsWith(path || item.to)
}

async function handleLogout() {
  await logout()
  await router.push('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'nav-open': mobileNavOpen }">
    <button v-if="mobileNavOpen" class="nav-backdrop" aria-label="关闭导航" @click="mobileNavOpen = false" />
    <aside class="app-sidebar">
      <RouterLink class="brand" to="/crm" @click="mobileNavOpen = false">
        <span class="brand-mark">▦</span>
        <b>客资 CRM</b>
      </RouterLink>
      <p class="nav-label">业务管理</p>
      <nav class="main-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          :class="{ active: navActive(item) }"
          :to="item.to"
          @click="mobileNavOpen = false"
        >
          <span class="nav-icon" :data-icon="item.icon" />
          <span>{{ item.label }}</span>
          <small v-if="item.badge">{{ item.badge }}</small>
        </RouterLink>
      </nav>
      <nav class="sidebar-foot">
        <RouterLink to="/admin" @click="mobileNavOpen = false"><span class="nav-icon" data-icon="trash" /><span>回收站</span></RouterLink>
        <RouterLink v-if="canManage" to="/admin" @click="mobileNavOpen = false"><span class="nav-icon" data-icon="settings" /><span>系统管理</span></RouterLink>
      </nav>
    </aside>

    <section class="app-content">
      <header class="app-topbar">
        <button class="mobile-menu" aria-label="打开导航" @click="mobileNavOpen = true">☰</button>
        <div class="breadcrumb"><span>CRM</span><i>/</i><b>{{ pageTitle }}</b></div>
        <div class="global-search"><span>⌕</span><input aria-label="全局搜索" placeholder="搜索客户、电话、报价编号"></div>
        <div class="top-actions">
          <button class="icon-button" :title="themeLabel" @click="toggleTheme">◐</button>
          <button class="notification" title="待办提醒">♧<i /></button>
          <span class="avatar">{{ user?.name?.slice(0, 1) || '用' }}</span>
          <span class="user-name"><b>{{ user?.name || '当前用户' }}</b><small>{{ user?.role === 'owner' ? '系统所有者' : user?.role === 'manager' ? '销售主管' : '销售人员' }}</small></span>
          <button v-if="isAuthenticated" class="logout" @click="handleLogout">退出</button>
        </div>
      </header>
      <RouterView />
    </section>
  </div>
</template>

<style scoped>
.app-shell{min-height:100vh;background:#f5f7fa;color:#172033}.app-sidebar{position:fixed;inset:0 auto 0 0;z-index:40;display:flex;width:220px;flex-direction:column;background:#102a43;color:#c9d6e2;box-shadow:4px 0 18px rgba(15,42,67,.08)}.brand{display:flex;height:64px;align-items:center;gap:11px;border-bottom:1px solid rgba(255,255,255,.09);padding:0 24px;color:#fff;text-decoration:none;font-size:18px}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:#2563eb;box-shadow:0 7px 18px rgba(37,99,235,.35)}.nav-label{margin:0;padding:22px 26px 8px;color:#718aa1;font-size:11px;font-weight:700;letter-spacing:.13em}.main-nav,.sidebar-foot{display:grid;gap:5px;padding:0 14px}.main-nav a,.sidebar-foot a{display:flex;height:42px;align-items:center;gap:12px;border-radius:9px;padding:0 12px;color:#b9cad8;text-decoration:none;font-size:14px}.main-nav a:hover,.sidebar-foot a:hover{background:rgba(255,255,255,.06)}.main-nav a.active{background:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.25)}.main-nav small{margin-left:auto;display:grid;min-width:22px;height:20px;place-items:center;border-radius:10px;background:#f59e0b;color:#fff;font-size:11px}.sidebar-foot{margin-top:auto;border-top:1px solid rgba(255,255,255,.09);padding-top:12px;padding-bottom:18px}.nav-icon{width:18px;text-align:center}.nav-icon:before{content:"•";font-size:20px}.nav-icon[data-icon="dashboard"]:before{content:"▦"}.nav-icon[data-icon="customers"]:before{content:"♙"}.nav-icon[data-icon="clock"]:before{content:"◷"}.nav-icon[data-icon="quote"]:before{content:"▤"}.nav-icon[data-icon="product"]:before{content:"◇"}.nav-icon[data-icon="stats"]:before{content:"▥"}.nav-icon[data-icon="trash"]:before{content:"♲"}.nav-icon[data-icon="settings"]:before{content:"⚙"}.app-content{min-width:0;margin-left:220px}.app-topbar{position:sticky;top:0;z-index:30;display:grid;height:64px;grid-template-columns:1fr minmax(280px,540px) 1fr;align-items:center;border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.97);padding:0 28px;backdrop-filter:blur(12px)}.breadcrumb{display:flex;align-items:center;gap:9px;color:#94a3b8;font-size:13px}.breadcrumb i{font-style:normal}.breadcrumb b{color:#354359}.global-search{display:flex;height:38px;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:0 12px;color:#94a3b8}.global-search input{width:100%;border:0;outline:0;background:transparent;color:#334155;font-size:13px}.top-actions{justify-self:end;display:flex;align-items:center;gap:9px}.top-actions button{cursor:pointer}.icon-button,.notification{position:relative;display:grid;width:35px;height:35px;place-items:center;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#59697c}.notification i{position:absolute;right:7px;top:6px;width:7px;height:7px;border:2px solid #fff;border-radius:50%;background:#ef4444}.avatar{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:#dbeafe;color:#2563eb;font-weight:800}.user-name{font-size:12px}.user-name small{display:block;margin-top:2px;color:#94a3b8}.logout{border:0;background:transparent;color:#64748b;font-size:12px}.mobile-menu,.nav-backdrop{display:none}
@media(max-width:980px){.app-sidebar{width:72px}.brand{justify-content:center;padding:0}.brand b,.nav-label,.main-nav a span:not(.nav-icon),.sidebar-foot a span:not(.nav-icon),.main-nav small{display:none}.main-nav a,.sidebar-foot a{justify-content:center;padding:0}.app-content{margin-left:72px}.app-topbar{grid-template-columns:1fr minmax(250px,1.2fr) 1fr}.user-name,.logout{display:none}}
@media(max-width:720px){.app-sidebar{transform:translateX(-100%);width:220px;transition:transform .2s}.nav-open .app-sidebar{transform:none}.app-content{margin-left:0}.nav-backdrop{position:fixed;inset:0;z-index:35;display:block;border:0;background:rgba(15,23,42,.42)}.brand b,.nav-label,.main-nav a span:not(.nav-icon),.sidebar-foot a span:not(.nav-icon),.main-nav small{display:initial}.main-nav a,.sidebar-foot a{justify-content:flex-start;padding:0 12px}.app-topbar{grid-template-columns:auto 1fr auto;height:56px;padding:0 12px}.mobile-menu{display:grid;width:34px;height:34px;place-items:center;border:1px solid #e2e8f0;border-radius:8px;background:#fff}.global-search{display:none}.breadcrumb{padding-left:10px}.icon-button,.user-name,.logout{display:none}}
</style>
