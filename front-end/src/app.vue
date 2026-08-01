<script setup lang="ts">
import { appDescription, appName } from '~/constants'

useHead({
  title: appName,
  htmlAttrs: {
    lang: 'en',
  },
  link: [
    { rel: 'canonical', href: 'https://avasan.org' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
  ],
})

useSeoMeta({
  description: appDescription,
  ogDescription: appDescription,
  ogImage: 'https://avasan.org/og.png',
  ogSiteName: 'avasan.org',
  ogTitle: appName,
  ogType: 'website',
  ogUrl: 'https://avasan.org',
  twitterCard: 'summary_large_image',
  twitterDescription: appDescription,
  twitterImage: 'https://avasan.org/og.png',
  twitterTitle: appName,
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  color-scheme: light;
  --page-background: #f6f1e7;
  --page-ink: #15343b;
  --page-muted: #5b6e6d;
  --page-accent: #0f766e;
  --page-accent-strong: #095e58;
  --page-accent-soft: rgb(15 118 110 / 12%);
  --page-dot: rgb(21 52 59 / 13%);
  --page-focus: #c96832;
}

* {
  box-sizing: border-box;
}

html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

html {
  background: var(--page-background);
  color: var(--page-ink);
  font-family: 'DM Sans', sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

html.dark {
  color-scheme: dark;
  --page-background: #10282d;
  --page-ink: #f7f0e4;
  --page-muted: #b7c8c4;
  --page-accent: #6dd6c8;
  --page-accent-strong: #95e5da;
  --page-accent-soft: rgb(109 214 200 / 13%);
  --page-dot: rgb(247 240 228 / 12%);
  --page-focus: #f0a36f;
}

body {
  min-width: 20rem;
  background: var(--page-background);
}

a {
  color: inherit;
}

::selection {
  background: var(--page-accent);
  color: var(--page-background);
}
</style>
