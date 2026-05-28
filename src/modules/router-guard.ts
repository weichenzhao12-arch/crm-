import type { AppModuleContext } from '~/types/app'
import { applyRouterGuards } from '~/app/guard'

export function installRouterGuardModule({ router }: AppModuleContext) {
  applyRouterGuards(router)
}
