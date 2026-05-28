import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetTypography(),
    presetIcons({
      scale: 1.1,
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
      },
    }),
  ],
  theme: {
    colors: {
      accent: 'var(--color-accent)',
      surface: 'var(--color-surface)',
      muted: 'var(--color-muted)',
      danger: 'var(--color-danger)',
    },
    borderRadius: {
      xl: 'var(--radius-xl)',
    },
  },
  shortcuts: {
    'app-shell': 'min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] transition-colors',
    'app-panel': 'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
  },
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
