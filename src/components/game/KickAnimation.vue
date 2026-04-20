<script setup>
defineProps({
  show:   { type: Boolean, required: true },
  name:   { type: String,  default: '' },
  isSelf: { type: Boolean, default: false },
})
</script>

<template>
  <Teleport to="body">
    <Transition name="kick">
      <div v-if="show" class="kick-overlay">
        <div class="kick-content">
          <div class="kick-icon">{{ isSelf ? '😱' : '🚪' }}</div>
          <h2 class="kick-name">{{ name }}</h2>
          <p class="kick-label">{{ isSelf ? 'ВЫ ИЗГНАНЫ' : 'ИЗГНАН ИЗ БУНКЕРА' }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.kick-overlay {
  position:fixed; inset:0; z-index:9990;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.85); backdrop-filter:blur(8px);
  pointer-events:none;
}
.kick-content { text-align:center; }
.kick-icon  { font-size:6rem; animation:kick-bounce 0.4s ease; }
.kick-name  { font-family:'Russo One',sans-serif; font-size:3rem; color:var(--color-accent); letter-spacing:3px; margin:0.5rem 0; }
.kick-label { color:var(--color-muted); font-size:1.1rem; letter-spacing:4px; text-transform:uppercase; }
@keyframes kick-bounce { 0%{transform:scale(0.3)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
.kick-enter-active { animation:kick-enter 0.35s ease; }
.kick-leave-active { animation:kick-leave 0.4s ease forwards; }
@keyframes kick-enter { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
@keyframes kick-leave { from{opacity:1} to{opacity:0;transform:scale(1.1)} }
</style>
