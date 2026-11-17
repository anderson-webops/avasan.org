<script setup lang="ts">
import { computed } from 'vue'
import { useHead } from '#app'
import { useColorMode } from '#imports'

const color = useColorMode()
const toggleLabel = computed(() => color.value === 'dark'
  ? 'Switch to light theme'
  : 'Switch to dark theme')

useHead({
  meta: [
    {
      id: 'theme-color',
      name: 'theme-color',
      content: () => color.value === 'dark'
        ? '#222222'
        : '#ffffff',
    },
  ],
})

function toggleDark() {
  color.preference = color.value === 'dark'
    ? 'light'
    : 'dark'
}
</script>

<template>
  <button class="!outline-none" type="button" :aria-label="toggleLabel" @click="toggleDark">
    <div class="i-carbon-sun dark:i-carbon-moon" />
  </button>
</template>
