import antfu from '@antfu/eslint-config'

export default antfu(
  {
    root: true,
    unocss: true,
    formatters: true,
    ignores: ['**/*.d.ts', '**/dist/**', '**/.nuxt/**', '**/.output/**'],
  },
  {
    files: ['README.md'],
    rules: {
      'markdown/heading-increment': 'off',
    },
  },
  {
    files: ['test/**/*.test.mjs'],
    rules: {
      'test/no-import-node-test': 'off',
    },
  },
)
