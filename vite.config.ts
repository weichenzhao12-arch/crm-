import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    Vue(),
    VueRouter({
      dts: 'src/types/typed-router.d.ts',
    }),
    Layouts(),
    AutoImport({
      imports: [
        'vue',
        'pinia',
        '@vueuse/core',
        VueRouterAutoImports,
      ],
      dirs: [
        'src/composables',
        'src/stores',
      ],
      dts: 'src/types/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      dts: 'src/types/components.d.ts',
    }),
    UnoCSS(),
    VueDevTools(),
  ],
})
