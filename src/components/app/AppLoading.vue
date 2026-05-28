<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'Loading...',
})
</script>

<template>
  <div class="flex items-center gap-3 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface-raised)] px-5 py-4 text-sm text-[var(--color-text-soft)]">
    <span class="i-carbon-circle-dash animate-spin text-base text-[var(--color-accent)]" />
    <span>{{ label }}</span>
  </div>
</template>
