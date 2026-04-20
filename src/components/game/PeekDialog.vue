<script setup>
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

defineProps({
  visible:    { type: Boolean, required: true },
  playerName: { type: String,  default: '' },
  label:      { type: String,  default: '' },
  value:      { type: String,  default: '' },
})
defineEmits(['update:visible'])
</script>

<template>
  <Dialog :visible="visible" modal header="👁️ Секретный просмотр" @update:visible="$emit('update:visible', $event)">
    <div class="peek-body">
      <p class="peek-player">Карта игрока <strong>{{ playerName }}</strong></p>
      <div class="peek-card">
        <span class="card-label">{{ label }}</span>
        <span class="card-value">{{ value }}</span>
      </div>
      <p class="peek-note">Только ты видишь эту карту. Она остаётся скрытой для всех.</p>
      <Button label="Понял, закрыть" severity="success" class="w-full close-btn" @click="$emit('update:visible', false)" />
    </div>
  </Dialog>
</template>

<style scoped>
.peek-body   { padding:0.5rem; }
.peek-player { color:var(--color-muted); margin-bottom:0.75rem; text-align:center; }
.peek-card   { background:var(--color-surface-2); border:1px solid var(--color-accent); border-radius:var(--radius-md); padding:1.25rem; display:flex; flex-direction:column; gap:0.5rem; }
.card-label  { font-size:0.65rem; color:#9ca3af; text-transform:uppercase; font-weight:800; letter-spacing:1.2px; }
.card-value  { font-weight:600; font-size:1rem; color:#e5e7eb; }
.peek-note   { color:#555; font-size:0.75rem; text-align:center; margin-top:0.75rem; }
.close-btn   { margin-top:1rem; }
.w-full      { width:100%; }
</style>
