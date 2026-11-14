import { createApp } from 'vue'
import Workshop from './Workshop.vue'

if (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
  createApp(Workshop).mount('#app')
