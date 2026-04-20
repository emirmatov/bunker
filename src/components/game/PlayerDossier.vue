<script setup>
import Tag from 'primevue/tag'

defineProps({
  me:          { type: Object,   required: true },
  isMyTurn:    { type: Boolean,  default: false },
  cardOrder:   { type: Array,    default: () => [] },
  cardLabels:  { type: Object,   default: () => ({}) },
  getCardText: { type: Function, required: true },
})
defineEmits(['revealCard'])
</script>

<template>
  <aside class="left-sidebar">
    <h2 class="section-title red-title">МОЁ ДОСЬЁ</h2>
    <div v-if="me.isAlive === false" class="dead-badge">💀 ВЫ МЕРТВЫ</div>

    <div v-if="me.hasImmunity || me.hasDoubleVote || me.specialShield || me.specialBlocked || me.hasNoVote || me.isMuted" class="status-badges">
      <Tag v-if="me.hasImmunity"    severity="success" value="🛡️ Иммунитет"   class="text-xs" />
      <Tag v-if="me.hasDoubleVote"  severity="warning" value="⚖️ ×2 голос"     class="text-xs" />
      <Tag v-if="me.specialShield"  severity="info"    value="💊 Щит"           class="text-xs" />
      <Tag v-if="me.specialBlocked" severity="danger"  value="🔪 Спец заблок." class="text-xs" />
      <Tag v-if="me.hasNoVote"      severity="danger"  value="🤬 Нет голоса"   class="text-xs" />
      <Tag v-if="me.isMuted"        severity="danger"  value="🤐 Заглушён"     class="text-xs" />
    </div>

    <div class="cards-grid">
      <div
        v-for="k in cardOrder"
        :key="k"
        class="flip-container"
        :class="{
          'is-flipped': me.cards?.[k]?.isRevealed,
          'is-locked':  (!isMyTurn || me.isAlive === false) && !me.cards?.[k]?.isRevealed,
          'is-special': k.startsWith('special')
        }"
        @click="$emit('revealCard', k, me.cards?.[k], $event)"
      >
        <div class="flip-inner">
          <div class="flip-front">
            <span class="card-label">{{ cardLabels[k] }}</span>
            <span class="card-value card-value-private">{{ getCardText(me.cards?.[k]?.value) ?? '???' }}</span>
            <div class="card-action-hint">
              <Tag v-if="isMyTurn && me.isAlive !== false" severity="danger"    value="Вскрыть" class="text-xs" />
              <Tag v-else                                   severity="secondary" value="🔒"      class="text-xs" />
            </div>
          </div>
          <div class="flip-back" :class="{ 'flip-back-special': k.startsWith('special') }">
            <span class="card-label">{{ cardLabels[k] }}</span>
            <span class="card-value">{{ getCardText(me.cards?.[k]?.value) }}</span>
            <Tag severity="success" value="ВСКРЫТО" class="mt-auto text-xs" />
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.left-sidebar  { position:sticky; top:1.5rem; }
.section-title { font-size:1.1rem; text-transform:uppercase; letter-spacing:1.5px; border-bottom:2px solid var(--color-border); padding-bottom:0.6rem; margin-bottom:1.25rem; }
.red-title     { color:#f87171; }
.dead-badge    { text-align:center; background:rgba(229,62,62,0.15); border:1px solid var(--color-accent); border-radius:var(--radius-sm); padding:0.4rem; color:var(--color-accent); font-size:0.85rem; font-weight:700; margin-bottom:1rem; }
.status-badges { display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.75rem; }
.cards-grid    { display:flex; flex-direction:column; gap:0.6rem; }

.flip-container { perspective:1200px; height:110px; width:100%; cursor:pointer; margin-bottom:4px; }
.flip-inner     { position:relative; width:100%; height:100%; transition:transform 0.55s cubic-bezier(0.4,0.2,0.2,1); transform-style:preserve-3d; }
.flip-container.is-flipped .flip-inner { transform:rotateY(180deg); }
.flip-front, .flip-back {
  position:absolute; inset:0; backface-visibility:hidden;
  display:flex; flex-direction:column; align-items:flex-start; justify-content:space-between;
  border-radius:12px; padding:12px 16px;
  box-shadow:0 8px 32px 0 rgba(0,0,0,0.8); backdrop-filter:blur(4px);
  border:1px solid rgba(255,255,255,0.05); transition:all 0.3s ease;
}
.flip-front { background:linear-gradient(135deg,#1a1a1a 0%,#0a0a0a 100%); border-left:4px solid #444; }
.flip-container:not(.is-locked):not(.is-flipped) .flip-front:hover { transform:translateX(5px); border-left-color:#f87171; background:linear-gradient(135deg,#222 0%,#111 100%); box-shadow:0 0 15px rgba(248,113,113,0.2); }
.flip-container.is-locked .flip-front { background:linear-gradient(145deg,#111,#0a0a0a); border:2px solid #1e1e1e; cursor:not-allowed; opacity:0.6; }
.flip-container.is-special .flip-front { border-left-color:#7c3aed; background:linear-gradient(135deg,#1e133a 0%,#0d0918 100%); }
.flip-back { background:linear-gradient(135deg,#0f2013 0%,#050505 100%); border-left:4px solid #4ade80; transform:rotateY(180deg); }
.flip-back-special { background:linear-gradient(135deg,#2d1a5e 0%,#0f0a1e 100%) !important; border-left-color:#a78bfa !important; box-shadow:0 0 20px rgba(124,58,237,0.3); }

.card-label         { font-size:0.65rem; color:#9ca3af; text-transform:uppercase; font-weight:800; letter-spacing:1.2px; margin-bottom:4px; }
.card-value         { font-weight:600; font-size:0.95rem; color:#e5e7eb; line-height:1.3; word-break:break-word; }
.card-value-private { opacity:0.7; font-style:italic; color:#aaa; user-select:none; }
.card-action-hint   { width:100%; display:flex; justify-content:flex-end; margin-top:auto; }
.mt-auto            { margin-top:auto; }
.is-locked          { filter:grayscale(0.8); opacity:0.5; cursor:not-allowed; }
.text-xs            { font-size:0.72rem; }

@media (max-width: 900px) {
  .left-sidebar  { position: static; }
  .cards-grid    { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .flip-container{ height: 100px; }
  .flip-front, .flip-back { padding: 10px 12px; }
  .card-value    { font-size: 0.85rem; }
}

@media (max-width: 480px) {
  .cards-grid    { grid-template-columns: 1fr; }
  .flip-container{ height: 90px; }
  .section-title { font-size: 0.95rem; }
  .status-badges :deep(.p-tag) { font-size: 0.65rem; }
}
</style>
