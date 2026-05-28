import type { AppModuleContext } from '~/types/app'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from '~/App.vue'
import { createAppConfig } from '~/app/config'
import { registerGlobalErrorHandlers } from '~/app/error-handler'
import { createAppRouter } from '~/app/router'
import { installAuthModule } from '~/modules/auth'
import { installPiniaModule } from '~/modules/pinia'
import { installRouterGuardModule } from '~/modules/router-guard'
import { installThemeModule } from '~/modules/theme'
import '~/styles/index.css'
import 'uno.css'

export async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  const router = createAppRouter()
  const config = createAppConfig()
  const ctx: AppModuleContext = {
    app,
    config,
    pinia,
    router,
  }

  installPiniaModule(ctx)
  installAuthModule(ctx)
  installThemeModule(ctx)
  installRouterGuardModule(ctx)
  registerGlobalErrorHandlers(app, router)

  app.use(router)
  await router.isReady()
  app.mount('#app')
}
