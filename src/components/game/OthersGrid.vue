<script setup>
import { useRouter } from 'vue-router'
import Tag   from 'primevue/tag'
import Panel from 'primevue/panel'

defineProps({
  players:       { type: Array,  default: () => [] },
  activePlayerId:{ type: String, default: null },
  cardOrder:     { type: Array,  default: () => [] },
  cardLabels:    { type: Object, default: () => ({}) },
  getCardText:   { type: Function, required: true },
})

const router = useRouter()
const openProfile = (p) => {
  if (p.isAnonymous) return  // инкогнито профиля не имеет
  router.push({ name: 'profile', params: { uid: p.uid } })
}
</script>

<template>
  <div class="others-grid">
    <Panel
      v-for="p in players"
      :key="p.uid"
      :header="p.name + (p.isMuted ? ' 🤐' : '') + (p.hasImmunity ? ' 🛡️' : '') + (p.specialShield ? ' 💊' : '') + (p.hasNoVote ? ' 🤬' : '')"
      toggleable class="player-panel"
      :class="{ 'panel-dead': p.isAlive === false, 'panel-active': p.uid === activePlayerId }"
    >
      <template #icons>
        <button
          v-if="!p.isAnonymous"
          class="profile-link-btn"
          v-tooltip.top="'Открыть профиль'"
          @click="openProfile(p)"
        >👤</button>
        <Tag v-if="p.isAlive === false"           severity="danger"  value="МЁРТВ"   class="mr-2" />
        <Tag v-else-if="p.uid === activePlayerId"  severity="success" value="ЕГО ХОД" class="mr-2" />
      </template>
      <ul class="revealed-list">
        <li v-for="k in cardOrder" :key="k" class="info-row">
          <span class="info-label">{{ cardLabels[k] }}</span>
          <span v-if="p.cards?.[k]?.isRevealed" class="info-value">{{ getCardText(p.cards[k].value) }}</span>
          <span v-else class="info-hidden">Скрыто</span>
        </li>
      </ul>
    </Panel>
  </div>
</template>

<style scoped>
.others-grid  { display:flex; flex-wrap:wrap; gap:1.25rem; align-items:flex-start; margin-bottom:2rem; }
.player-panel { width:300px; flex-shrink:0; }
.panel-dead   { opacity:0.45; filter:grayscale(1); }
.panel-active :deep(.p-panel-header) { border-left:4px solid var(--color-success); }
.revealed-list { list-style:none; padding:0; margin:0; }
.info-row      { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1a1a1a; padding:0.45rem 0; }
.info-row:last-child { border-bottom:none; }
.info-label    { color:#777; font-size:0.8rem; flex-shrink:0; margin-right:0.5rem; }
.info-value    { color:var(--color-success); font-weight:600; text-align:right; max-width:60%; font-size:0.85rem; word-break:break-word; }
.info-hidden   { color:#333; font-style:italic; font-size:0.8rem; }
.mr-2          { margin-right:0.5rem; }
.profile-link-btn {
  background: none; border: 1px solid transparent;
  font-size: 1rem; cursor: pointer;
  padding: 0.15rem 0.4rem; margin-right: 0.35rem;
  border-radius: 4px; color: var(--color-muted);
  transition: all 0.15s;
}
.profile-link-btn:hover { color: var(--color-accent); border-color: var(--color-accent); }

@media (max-width: 900px) {
  .others-grid  { gap: 0.75rem; margin-bottom: 1.5rem; }
  .player-panel { width: 100%; }
}
@media (max-width: 600px) {
  .info-row    { padding: 0.35rem 0; }
  .info-label  { font-size: 0.75rem; }
  .info-value  { font-size: 0.8rem; }
}
</style>
