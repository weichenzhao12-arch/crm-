import type { ThemeMode } from '~/types/app'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { THEME_STORAGE_KEY } from '~/constants/app'

const defaultTheme: ThemeMode = 'light'

function applyThemeDom(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('theme-dark', theme === 'dark')
}

export const useAppStore = defineStore('app', () => {
  const theme = ref<ThemeMode>(defaultTheme)
  const themeLabel = computed(() => theme.value === 'dark' ? '切换浅色' : '切换深色')

  function setTheme(value: ThemeMode) {
    theme.value = value
    localStorage.setItem(THEME_STORAGE_KEY, value)
    applyThemeDom(value)
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function hydrateTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    setTheme(stored === 'dark' ? 'dark' : defaultTheme)
  }

  return {
    hydrateTheme,
    setTheme,
    theme,
    themeLabel,
    toggleTheme,
  }
})
