import type { AppModuleContext } from '~/types/app'
import { useAppStore } from '~/stores/app'

export function installThemeModule({ pinia }: AppModuleContext) {
  useAppStore(pinia).hydrateTheme()
}
