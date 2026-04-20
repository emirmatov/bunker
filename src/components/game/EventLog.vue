<script setup>
defineProps({
  logs: { type: Array, default: () => [] },
})
</script>

<template>
  <details v-if="logs.length" class="logs-panel">
    <summary>📋 Журнал событий ({{ logs.length }})</summary>
    <ul class="logs-list">
      <li v-for="(entry, i) in [...logs].reverse()" :key="i">{{ entry }}</li>
    </ul>
  </details>
</template>

<style scoped>
.logs-panel  { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:0.75rem 1rem; }
.logs-panel summary { cursor:pointer; color:var(--color-muted); font-size:0.9rem; }
.logs-list   { list-style:none; padding:0; margin-top:0.75rem; max-height:200px; overflow-y:auto; }
.logs-list li { color:#666; font-size:0.78rem; padding:0.3rem 0; border-bottom:1px solid #1a1a1a; }
.logs-list li:last-child { border-bottom:none; }
</style>
