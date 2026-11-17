<script setup lang="ts">
import { NuxtLink } from '#components'
import DarkToggle from '~/components/DarkToggle.vue'
</script>

<template>
  <div class="text-xl text-gray-700 dark:text-gray-300" m-5 flex="~ gap3" justify-center>
    <NuxtLink i-carbon-campsite to="/" aria-label="Home" />
    <a
      i-carbon-logo-github
      href="https://github.com/antfu/vitesse-nuxt"
      aria-label="Vitesse Nuxt on GitHub"
      rel="noreferrer"
      target="_blank"
    />
    <DarkToggle />
  </div>
</template>
