import { storeToRefs } from 'pinia'
import { useAppStore } from '~/stores/app'

export function useTheme() {
  const app = useAppStore()
  const { theme, themeLabel } = storeToRefs(app)

  return {
    theme,
    themeLabel,
    toggleTheme: app.toggleTheme,
  }
}
