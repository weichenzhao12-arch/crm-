<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="border border-[var(--color-border)] rounded-2xl border-dashed bg-[var(--color-surface-raised)] px-5 py-6 text-sm text-[var(--color-text-soft)]">
    {{ message }}
  </div>
</template>
