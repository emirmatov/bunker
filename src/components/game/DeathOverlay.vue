<script setup>
import Button from 'primevue/button'
defineProps({ show: { type: Boolean, required: true } })
defineEmits(['spectate'])
</script>

<template>
  <div v-if="show" class="death-overlay">
    <div class="death-content">
      <div class="death-icon">💀</div>
      <h2 class="death-title">ВЫ ИЗГНАНЫ</h2>
      <p class="death-sub">Бункер закрылся перед вашим носом</p>
      <Button label="НАБЛЮДАТЬ ЗА ИГРОЙ" severity="danger" outlined class="mt-btn"
        icon="pi pi-eye" @click="$emit('spectate')" />
    </div>
  </div>
</template>

<style scoped>
.death-overlay {
  position:fixed; inset:0; background:rgba(5,0,0,0.96); z-index:9999;
  display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);
}
.death-content {
  text-align:center; border:2px solid var(--color-accent);
  padding:3.5rem; border-radius:var(--radius-lg);
  background:rgba(0,0,0,0.8); box-shadow:0 0 80px rgba(229,62,62,0.2);
}
.death-icon  { font-size:5rem; margin-bottom:0.75rem; }
.death-title { font-size:2.5rem; color:var(--color-accent); letter-spacing:4px; margin-bottom:0.5rem; }
.death-sub   { color:var(--color-muted); margin-bottom:1.5rem; }
.mt-btn      { margin-top:1rem; }
</style>
