import type { Pinia } from 'pinia'
import type { App } from 'vue'
import type { Router } from 'vue-router'

export type ThemeMode = 'light' | 'dark'

export interface AppConfig {
  apiBaseUrl: string
  appEnv: string
  appTitle: string
}

export interface AppModuleContext {
  app: App
  config: AppConfig
  pinia: Pinia
  router: Router
}

export interface UserModule {
  install: (ctx: AppModuleContext) => void | Promise<void>
}
