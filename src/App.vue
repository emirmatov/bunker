<script setup>
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import AppHeader from './components/layout/AppHeader.vue'
import AppFooter from './components/layout/AppFooter.vue'

const route = useRoute()
// На /game и /lobby прячем хедер+футер — там полноэкранный интерфейс
const hideChrome = computed(() => !!route.meta?.hideChrome)
</script>

<template>
  <Toast position="top-center" :breakpoints="{ '640px': { width: '90vw' } }" />
  <div class="app-shell">
    <AppHeader v-if="!hideChrome" />
    <main class="app-main">
      <RouterView />
    </main>
    <AppFooter v-if="!hideChrome" />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Russo+One&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --color-bg:         #0f0f0f;
  --color-surface:    #1a1a1a;
  --color-surface-2:  #242424;
  --color-border:     #2e2e2e;
  --color-text:       #e8e8e8;
  --color-muted:      #888;
  --color-accent:     #e53e3e;
  --color-accent-dim: rgba(229, 62, 62, 0.15);
  --color-success:    #4caf50;
  --color-warn:       #f59e0b;
  --radius-sm:        6px;
  --radius-md:        12px;
  --radius-lg:        20px;
  --shadow-card:      0 4px 24px rgba(0, 0, 0, 0.6);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar        { width: 6px; }
::-webkit-scrollbar-track  { background: var(--color-surface); }
::-webkit-scrollbar-thumb  { background: #444; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #666; }

h1, h2, h3 { font-family: 'Russo One', sans-serif; letter-spacing: 0.5px; }

.w-full      { width: 100%; }
.text-center { text-align: center; }

.app-shell { display: flex; flex-direction: column; min-height: 100vh; }
.app-main  { flex: 1; }
</style>
