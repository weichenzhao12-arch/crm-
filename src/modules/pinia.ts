import type { AppModuleContext } from '~/types/app'

export function installPiniaModule({ app, pinia }: AppModuleContext) {
  app.use(pinia)
}
