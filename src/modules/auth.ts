import type { AppModuleContext } from '~/types/app'
import { useAuthStore } from '~/stores/auth'

export function installAuthModule({ pinia }: AppModuleContext) {
  useAuthStore(pinia).hydrate()
}
