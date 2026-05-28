import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    Vue() as any,
    VueRouter({
      dts: 'src/types/typed-router.d.ts',
    }) as any,
    Layouts() as any,
  ],
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.spec.ts'],
  },
})
