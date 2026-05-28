import type { App } from 'vue'
import type { Router } from 'vue-router'

function logError(scope: string, error: unknown) {
  console.error(`[${scope}]`, error)
}

export function registerGlobalErrorHandlers(app: App, router: Router) {
  app.config.errorHandler = (error) => {
    logError('app', error)
  }

  router.onError((error) => {
    logError('router', error)
  })

  window.addEventListener('error', event => logError('window', event.error ?? event.message))
  window.addEventListener('unhandledrejection', event => logError('promise', event.reason))
}
