import process from 'node:process'
import { appDescription } from './src/constants/index'

const analyticsDisabled = process.env.NODE_ENV === 'development'
  || process.env.DISABLE_ANALYTICS === 'true'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
  ],

  devtools: {
    enabled: process.env.CI !== 'true' && process.env.NUXT_A11Y_SCAN !== 'true',
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#f6f1e7' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#10282d' },
      ],
      script: analyticsDisabled
        ? []
        : [
            {
              'defer': true,
              'src': 'https://analytics.avasan.org/script.js',
              'data-website-id': '83f623f3-a19b-4062-a879-020a26fe043d',
            },
            {
              'defer': true,
              'src': 'https://analytics.jacobdanderson.net/script.js',
              'data-website-id': 'e7585305-ae9c-431e-a67f-6314e2a4d28e',
            },
          ],
    },
  },

  colorMode: {
    classSuffix: '',
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'http://localhost:3006',
    },
  },

  srcDir: 'src',

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },
})
