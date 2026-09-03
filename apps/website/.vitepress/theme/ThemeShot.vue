<script setup lang="ts">
defineProps<{
  light: string
  dark: string
  alt: string
  width?: number | string
  height?: number | string
}>()
</script>

<template>
  <span class="theme-shot">
    <img
      class="theme-shot-light"
      :src="light"
      :alt="alt"
      :width="width"
      :height="height"
    />
    <img
      class="theme-shot-dark"
      :src="dark"
      :alt="alt"
      :width="width"
      :height="height"
    />
  </span>
</template>
