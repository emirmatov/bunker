<script setup>
import Button from 'primevue/button'

defineProps({
  activePlayerId:  { type: String,  default: null },
  isMyTurn:        { type: Boolean, default: false },
  activePlayerName:{ type: String,  default: '' },
  canPassTurn:     { type: Boolean, default: false },
  isHost:          { type: Boolean, default: false },
  timerDuration:   { type: Number,  default: 0 },
  timerSeconds:    { type: Number,  default: 0 },
  timerWarning:    { type: Boolean, default: false },
  timerPaused:     { type: Boolean, default: false },
})
defineEmits(['start', 'pass', 'pause', 'resume'])
</script>

<template>
  <div class="turn-indicator" :class="isMyTurn ? 'turn-mine' : 'turn-wait'">
    <div class="turn-header">
      <p class="turn-text" :class="isMyTurn ? 'green-text' : 'muted-text'">
        {{ !activePlayerId ? '⏸ Ожидание старта…' : isMyTurn ? '🚨 ВАШ ХОД!' : `⏳ Ходит: ${activePlayerName}` }}
      </p>

      <div v-if="timerDuration > 0 && activePlayerId" class="timer-wrap">
        <div class="timer-circle" :class="{ 'timer-warn': timerWarning, 'timer-paused': timerPaused }">
          <svg viewBox="0 0 44 44" class="timer-svg">
            <circle cx="22" cy="22" r="18" class="timer-track" />
            <circle
              cx="22" cy="22" r="18"
              class="timer-progress"
              :class="{ 'timer-progress-warn': timerWarning }"
              :style="{ strokeDashoffset: 113 - (113 * Math.min(timerSeconds, timerDuration)) / timerDuration }"
            />
          </svg>
          <span class="timer-num" :class="{ 'timer-num-warn': timerWarning }">
            {{ timerPaused ? '⏸' : timerSeconds }}
          </span>
        </div>
        <button
          v-if="isHost"
          class="timer-pause-btn"
          :title="timerPaused ? 'Возобновить таймер' : 'Пауза таймера'"
          @click="timerPaused ? $emit('resume') : $emit('pause')"
        >
          {{ timerPaused ? '▶' : '⏸' }}
        </button>
      </div>
    </div>

    <div class="turn-actions">
      <Button v-if="isHost && !activePlayerId" label="Начать игру" severity="warning" size="large" icon="pi pi-play" @click="$emit('start')" />
      <Button
        v-if="canPassTurn"
        :label="isMyTurn ? 'Завершить ход' : 'Пропустить ход игрока'"
        severity="success" icon="pi pi-check" size="large"
        @click="$emit('pass')"
      />
    </div>
  </div>
</template>

<style scoped>
.turn-indicator { padding:1.25rem; border-radius:var(--radius-md); border:1px solid transparent; text-align:center; transition:all 0.3s; margin-bottom:2rem; }
.turn-mine      { background:rgba(76,175,80,0.08); border-color:var(--color-success); box-shadow:0 0 20px rgba(76,175,80,0.15); }
.turn-wait      { background:#131313; border-color:var(--color-border); }
.turn-header    { display:flex; align-items:center; justify-content:center; gap:1rem; margin-bottom:0.75rem; }
.turn-text      { font-size:1.2rem; font-weight:700; }
.green-text     { color:var(--color-success); }
.muted-text     { color:var(--color-muted); }
.turn-actions   { display:flex; justify-content:center; gap:0.75rem; }

.timer-wrap       { display:flex; align-items:center; gap:0.4rem; flex-shrink:0; }
.timer-circle     { position:relative; width:52px; height:52px; }
.timer-svg        { width:100%; height:100%; transform:rotate(-90deg); }
.timer-track      { fill:none; stroke:#2a2a2a; stroke-width:4; }
.timer-progress   { fill:none; stroke:#4ade80; stroke-width:4; stroke-dasharray:113; stroke-linecap:round; transition:stroke-dashoffset 0.8s linear, stroke 0.3s; }
.timer-progress-warn { stroke:#f87171; }
.timer-circle.timer-paused .timer-progress { stroke:#f59e0b; }
.timer-num        { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; color:#e5e7eb; }
.timer-num-warn   { color:#f87171; }
.timer-pause-btn {
  background:none; border:1px solid var(--color-border); border-radius:50%;
  width:28px; height:28px; cursor:pointer; color:var(--color-muted);
  font-size:0.7rem; display:flex; align-items:center; justify-content:center;
  transition:all 0.2s;
}
.timer-pause-btn:hover { border-color:var(--color-warn); color:var(--color-warn); }

@media (max-width: 600px) {
  .turn-indicator { padding: 0.9rem 0.75rem; margin-bottom: 1.5rem; }
  .turn-header    { flex-direction: column; gap: 0.5rem; }
  .turn-text      { font-size: 1rem; }
  .turn-actions :deep(.p-button) { font-size: 0.85rem; padding: 0.6rem 1rem; }
  .timer-circle   { width: 44px; height: 44px; }
}
</style>
