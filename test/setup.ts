import { config } from '@vue/test-utils'

config.global.stubs = {
  RouterLink: {
    template: '<a><slot /></a>',
  },
}

Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
})
