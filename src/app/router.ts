import { createRouter, createWebHistory } from 'vue-router'
import DefaultLayout from '~/layouts/default.vue'
import BlankLayout from '~/layouts/blank.vue'
import AdminPage from '~/pages/admin.vue'
import CatchAllPage from '~/pages/[...all].vue'
import CrmCustomerPage from '~/pages/crm/customer/[id].vue'
import CrmCustomersPage from '~/pages/crm/customers.vue'
import CrmFollowUpsPage from '~/pages/crm/follow-ups.vue'
import CrmStatisticsPage from '~/pages/crm/statistics.vue'
import CrmPage from '~/pages/crm.vue'
import DemoApiPage from '~/pages/demo-api.vue'
import HomePage from '~/pages/index.vue'
import LoginPage from '~/pages/login.vue'

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        path: '/',
        component: DefaultLayout,
        children: [
          {
            path: '',
            component: CrmPage,
            meta: { title: 'CRM', layout: 'default' },
          },
          {
            path: 'quote',
            component: HomePage,
            meta: { title: '报价系统', layout: 'default' },
          },
          {
            path: 'demo-api',
            component: DemoApiPage,
            meta: { title: 'API Demo', layout: 'default', requiresAuth: true },
          },
          {
            path: 'admin',
            component: AdminPage,
            meta: { title: '管理后台', layout: 'default' },
          },
          {
            path: 'crm',
            component: CrmPage,
            meta: { title: 'CRM', layout: 'default' },
          },
          {
            path: 'crm/customer/:id',
            component: CrmCustomerPage,
            meta: { title: '客户详情', layout: 'default' },
          },
          {
            path: 'crm/customers',
            component: CrmCustomersPage,
            meta: { title: '客户列表', layout: 'default' },
          },
          {
            path: 'crm/follow-ups',
            component: CrmFollowUpsPage,
            meta: { title: '今日跟进', layout: 'default' },
          },
          {
            path: 'crm/statistics',
            component: CrmStatisticsPage,
            meta: { title: '数据统计', layout: 'default' },
          },
        ],
      },
      {
        path: '/login',
        component: BlankLayout,
        children: [
          {
            path: '',
            component: LoginPage,
            meta: { title: 'Login', layout: 'blank', guestOnly: true },
          },
        ],
      },
      {
        path: '/:all(.*)',
        component: DefaultLayout,
        children: [
          {
            path: '',
            component: CatchAllPage,
            meta: { title: 'Not Found', layout: 'default' },
          },
        ],
      },
    ],
    scrollBehavior() {
      return { top: 0 }
    },
  })
}
