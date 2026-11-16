import { config } from '@vue/test-utils'

config.global.stubs = {
  RouterLink: {
    template: '<a><slot /></a>',
  },
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    value: () => {},
    writable: true,
  })
}
