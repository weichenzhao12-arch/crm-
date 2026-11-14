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
import SamplesPage from '~/local-test/SamplesPage.vue'
import { crmFeaturesEnabled } from '~/features/crm/release'
import { localWarehouseEnabled } from '~/features/warehouse/release'

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        path: '/',
        component: DefaultLayout,
        children: [
          ...(localWarehouseEnabled ? [{
            path: 'warehouse',
            component: () => import('~/features/warehouse/WarehousePage.vue'),
            meta: { title: '仓库', layout: 'default' },
          }, {
            path: 'warehouse/manage',
            component: () => import('~/features/warehouse/WarehousePage.vue'),
            props: { management: true },
            meta: { title: '库存管理', layout: 'default' },
          }] : []),
          ...(crmFeaturesEnabled ? [{
            path: 'samples',
            component: SamplesPage,
            meta: { title: '样品库', layout: 'default' },
          }, {
            path: 'quote/orders',
            component: () => import('~/local-test/QuoteOrderMenu.vue'),
            meta: { title: '报价', layout: 'default' },
          }, {
            path: 'quote/b2b',
            component: () => import('~/local-test/B2BProductsPage.vue'),
            meta: { title: '普通报价', layout: 'default' },
          }] : []),
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
      ...(localWarehouseEnabled ? [{
        path: '/dealer-stock',
        component: () => import('~/features/warehouse/DealerStock.vue'),
        meta: { title: '代理商现货查询', public: true },
      }] : []),
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
