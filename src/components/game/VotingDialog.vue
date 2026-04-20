<script setup>
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
defineProps({
  visible:      { type: Boolean, required: true },
  me:           { type: Object,  required: true },
  myUid:        { type: String,  required: true },
  alivePlayers: { type: Array,   default: () => [] },
  myVote:       { type: String,  default: null },
  votes:        { type: Object,  default: () => ({}) },
})
defineEmits(['vote'])
</script>

<template>
  <Dialog :visible="visible" modal header="🗳️ ГОЛОСОВАНИЕ" :closable="false">
    <div v-if="me.isAlive === false"  class="text-center msg">Вы мертвы — наблюдайте</div>
    <div v-else-if="me.isMuted"       class="text-center msg">🤐 Вы заглушены — не можете голосовать</div>
    <div v-else-if="me.hasNoVote"     class="text-center msg">🤬 Ваш голос не учитывается</div>
    <div v-else-if="!myVote" class="panel">
      <p class="hint">Кого НЕ возьмёте в бункер?</p>
      <Button
        v-for="p in alivePlayers.filter(x => x.uid !== myUid)"
        :key="p.uid"
        :label="p.name + (p.hasImmunity ? ' 🛡️' : '')"
        severity="danger" outlined class="w-full vote-btn"
        @click="$emit('vote', p.uid)"
      />
      <div class="divider" />
      <Button label="ВОЗДЕРЖАТЬСЯ" severity="secondary" class="w-full" @click="$emit('vote', 'skip_vote')" />
      <p class="tally">Проголосовали: {{ Object.keys(votes).length }} / {{ alivePlayers.length }}</p>
    </div>
    <div v-else class="text-center voted">✅ Голос принят. Ожидаем остальных…</div>
  </Dialog>
</template>

<style scoped>
.panel    { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem; }
.hint     { color:var(--color-muted); text-align:center; margin-bottom:0.25rem; }
.vote-btn { margin-bottom:0; }
.divider  { height:1px; background:var(--color-border); margin:0.5rem 0; }
.tally    { text-align:center; color:var(--color-muted); font-size:0.8rem; margin-top:0.5rem; }
.voted    { color:var(--color-success); font-weight:700; padding:1.5rem; font-size:1.1rem; }
.msg      { color:var(--color-muted); padding:1rem; }

@media (max-width: 600px) {
  .panel { padding: 0.25rem; gap: 0.4rem; }
  .voted { padding: 1rem; font-size: 1rem; }
}
</style>
