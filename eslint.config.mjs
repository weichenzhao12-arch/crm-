import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  unocss: true,
  formatters: true,
}, {
  rules: {
    'style/brace-style': ['error', '1tbs'],
  },
})
