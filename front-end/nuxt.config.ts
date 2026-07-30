import process from 'node:process'
import { appDescription } from './src/constants/index'

export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
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
    },
  },

  colorMode: {
    classSuffix: '',
  },
  srcDir: 'src',

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: true,
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
