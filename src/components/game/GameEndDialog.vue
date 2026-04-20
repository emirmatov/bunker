<script setup>
import Button from 'primevue/button'
import Tag    from 'primevue/tag'
import Dialog from 'primevue/dialog'
defineProps({
  visible: { type: Boolean, required: true },
  players: { type: Array,   default: () => [] },
  isHost:  { type: Boolean, default: false },
})
defineEmits(['restart'])
</script>

<template>
  <Dialog :visible="visible" modal header="☢️ ИГРА ОКОНЧЕНА" :closable="false">
    <div class="text-center body">
      <h2 class="title">БУНКЕР ЗАКРЫТ</h2>
      <p class="sub">В бункер прошли:</p>
      <div class="survivors">
        <Tag v-for="p in players.filter(x => x.isAlive !== false)" :key="p.uid"
          :value="p.name" severity="success" class="tag" />
      </div>
      <Button v-if="isHost" label="СЫГРАТЬ ЕЩЕ РАЗ" severity="danger" size="large"
        class="w-full" icon="pi pi-refresh" @click="$emit('restart')" />
    </div>
  </Dialog>
</template>

<style scoped>
.body      { padding:1rem; }
.title     { font-size:2rem; color:var(--color-success); margin-bottom:0.5rem; }
.sub       { color:var(--color-muted); margin-bottom:1.5rem; }
.survivors { display:flex; flex-wrap:wrap; justify-content:center; gap:0.5rem; margin-bottom:2rem; }
.tag       { font-size:1.1rem; padding:0.5rem 1rem; }
</style>
