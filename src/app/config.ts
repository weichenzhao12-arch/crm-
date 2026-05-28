import type { AppConfig } from '~/types/app'

function readEnv(name: string, fallback: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function createAppConfig(): AppConfig {
  return {
    apiBaseUrl: readEnv('VITE_API_BASE_URL', '/api'),
    appEnv: readEnv('MODE', import.meta.env.MODE),
    appTitle: readEnv('VITE_APP_TITLE', 'SolosVue3'),
  }
}
