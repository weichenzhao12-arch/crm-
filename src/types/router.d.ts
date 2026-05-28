import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    guestOnly?: boolean
    layout?: 'default' | 'blank' | string
  }
}

declare module 'virtual:generated-layouts' {
  import type { RouteRecordRaw } from 'vue-router'

  export function setupLayouts(routes: RouteRecordRaw[]): RouteRecordRaw[]
}

export {}
