<script setup>
import Tag from 'primevue/tag'

defineProps({
  name:             { type: String, default: '' },
  description:      { type: String, default: '' },
  bunkerSize:       { type: Number, default: 2 },
  aliveCount:       { type: Number, default: 0 },
})
</script>

<template>
  <section class="catastrophe-block">
    <h1 class="catastrophe-name">{{ name }}</h1>
    <p class="catastrophe-desc">{{ description }}</p>
    <div class="bunker-stats">
      <Tag severity="warning" :value="`ВМЕСТИМОСТЬ: ${bunkerSize}`" class="stat-tag" />
      <Tag severity="info"    :value="`ЖИВЫХ: ${aliveCount}`"       class="stat-tag" />
    </div>
  </section>
</template>

<style scoped>
.catastrophe-block { text-align:center; margin-bottom:2rem; }
.catastrophe-name  { font-size:clamp(1.8rem,4vw,2.8rem); color:var(--color-accent); text-shadow:0 0 25px rgba(229,62,62,0.35); margin-bottom:0.5rem; }
.catastrophe-desc  { color:#9ca3af; max-width:600px; margin:0 auto 1.5rem; }
.bunker-stats      { display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap; }
.stat-tag          { font-size:1rem; }

@media (max-width: 600px) {
  .catastrophe-block { margin-bottom: 1.25rem; }
  .catastrophe-desc  { font-size: 0.85rem; padding: 0 0.5rem; }
  .bunker-stats      { gap: 0.4rem; }
  .stat-tag          { font-size: 0.8rem; }
}
</style>
