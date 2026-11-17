<script setup lang="ts">
import { definePageMeta } from '#app/composables/pages'
import { ClientOnly } from '#components'
import BackendStatus from '~/components/BackendStatus.vue'
import InputEntry from '~/components/InputEntry.vue'
import Logos from '~/components/Logos.vue'

definePageMeta({
  layout: 'home',
})
</script>

<template>
  <div>
    <Logos mb-6 />
    <ClientOnly>
      <BackendStatus />
      <template #fallback>
        <div class="text-gray-700 dark:text-gray-300">
          <span animate-pulse>...</span>
        </div>
      </template>
    </ClientOnly>
    <InputEntry />
  </div>
</template>
