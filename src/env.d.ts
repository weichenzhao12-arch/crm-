/// <reference types="vite/client" />

declare module 'virtual:generated-layouts' {
  import type { RouteRecordRaw } from 'vue-router'

  export function setupLayouts(routes: RouteRecordRaw[]): RouteRecordRaw[]
}
