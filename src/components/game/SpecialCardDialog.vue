<script setup>
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { getCardText } from '../../utils/game'

const props = defineProps({
  visible:      { type: Boolean, required: true },
  card:         { type: Object,  default: null },
  alivePlayers: { type: Array,   default: () => [] },
  deadPlayers:  { type: Array,   default: () => [] },
  myUid:        { type: String,  required: true },
})
const emit = defineEmits(['apply', 'update:visible'])

const close = () => emit('update:visible', false)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="'⚡ ' + getCardText(card?.data.value)"
    @update:visible="close"
  >
    <p class="hint">Выберите цель:</p>
    <template v-if="['revive','necromancy_fail'].includes(card?.data.value.id)">
      <Button v-for="p in deadPlayers" :key="p.uid" :label="p.name"
        severity="success" outlined class="w-full btn" @click="emit('apply', p.uid)" />
      <p v-if="!deadPlayers.length" class="empty">Нет изгнанных игроков</p>
    </template>
    <template v-else>
      <Button
        v-for="p in alivePlayers.filter(x => x.uid !== myUid)"
        :key="p.uid"
        :label="p.name + (p.specialShield ? ' 💊' : '')"
        severity="warning" outlined class="w-full btn"
        @click="emit('apply', p.uid)"
      />
    </template>
    <Button label="Отмена" severity="secondary" text class="w-full mt" @click="close" />
  </Dialog>
</template>

<style scoped>
.hint  { color:var(--color-muted); text-align:center; margin-bottom:0.75rem; }
.btn   { margin-bottom:0.5rem; }
.empty { color:#555; text-align:center; font-style:italic; }
.mt    { margin-top:0.5rem; }
</style>
