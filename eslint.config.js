import antfu from '@antfu/eslint-config'

export default antfu(
  {
    root: true,
    unocss: true,
    formatters: true,
    antislop: true,
    ignores: [
      '**/*.d.ts',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      'vendor/braces/**',
      'vendor/qs/lib/**',
      'vendor/http-compat/*/compat.cjs',
      'vendor/magicast/babel8.js',
      'vendor/unplugin-remove/index.js',
      'vendor/vite-plugin-checker/babel8.js',
    ],
  },
  {
    files: ['test/**/*.{js,ts,mjs,cjs}', 'scripts/test-*.mjs'],
    rules: {
      'test/no-import-node-test': 'off',
    },
  },
  {
    files: ['README.md'],
    rules: {
      'markdown/heading-increment': 'off',
    },
  },
)
