<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

const online = useOnline()
</script>

<template>
  <div>
    <Logos mb-6 />
    <ClientOnly>
      <Suspense>
        <PageView v-if="online" />
        <div class="text-gray-700 dark:text-gray-300">
          You're offline
        </div>
        <template #fallback>
          <div class="text-gray-700 dark:text-gray-300" italic>
            <span animate-pulse>Loading...</span>
          </div>
        </template>
      </Suspense>
      <template #fallback>
        <div class="text-gray-700 dark:text-gray-300">
          <span animate-pulse>...</span>
        </div>
      </template>
    </ClientOnly>
    <InputEntry />
  </div>
</template>
