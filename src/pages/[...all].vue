<route lang="json">
{
  "meta": {
    "title": "Not Found",
    "layout": "blank"
  }
}
</route>

<script setup lang="ts">
import AppCard from '~/components/app/AppCard.vue'
</script>

<template>
  <main class="mx-auto max-w-xl min-h-screen flex items-center px-6 py-16">
    <AppCard class="w-full p-8 text-center space-y-5">
      <p class="text-sm text-[var(--color-text-muted)] tracking-[0.3em] uppercase">
        404
      </p>
      <h1 class="text-3xl font-semibold">
        Route not found
      </h1>
      <p class="text-sm text-[var(--color-text-soft)] leading-6">
        This file is here on purpose so file-based routing has a fallback example.
      </p>
      <RouterLink class="inline-flex justify-center rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm text-white font-medium" to="/">
        Back home
      </RouterLink>
    </AppCard>
  </main>
</template>
