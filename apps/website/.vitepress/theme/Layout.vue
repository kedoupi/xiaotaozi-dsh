<script setup lang="ts">
import { onMounted } from 'vue'
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme

onMounted(() => {
  try {
    const a = new URLSearchParams(location.search).get('appearance')
    if (a !== 'light' && a !== 'dark') return
    localStorage.setItem('vitepress-theme-appearance', a)
    document.documentElement.classList.toggle('dark', a === 'dark')
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <Layout>
    <template #layout-top>
      <!--
        THESIS: The product is one command opening a real workbench. Refuse the default VitePress hero+emoji-card homepage.
        OWN-WORLD: Dual zinc stages (dark OLED / light paper), invert CTAs, cool blue links only, Bricolage Grotesque display, product screenshots in window chrome.
        STORY: Visitor sees the UI, believes xtz start is enough, copies an installer.
        FIRST VIEWPORT: Oversized headline, two pills, then the Models screenshot in a window. Primary action is Install, anchored to #install.
        FORM: User-pinned competitor canon — grok-app.com cinematic product site. Seed: user-pinned-grok-app.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
      -->
    </template>
  </Layout>
</template>
