<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import {
  doc, onSnapshot, collection, updateDoc, deleteDoc
} from 'firebase/firestore'
import {
  catastrophes, professions, healths, phobias,
  inventories, specialCards, biology, hobbies,
  largeInventories, facts, getRandomItem
} from '../gameData'

import Button from 'primevue/button'
import Tag    from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
defineOptions({ name: 'LobbyView' })
const route  = useRoute()
const router = useRouter()
const toast  = useToast()
const roomId = route.params.id

const players      = ref([])
const isHost       = ref(false)
const starting     = ref(false)
const timerDuration = ref(0) // 0 = выкл

let unsubscribePlayers = null
let unsubscribeRoom    = null

onMounted(() => {
  const roomRef    = doc(db, 'rooms', roomId)
  const playersRef = collection(db, 'rooms', roomId, 'players')

  unsubscribeRoom = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return router.push({ name: 'home' })
    if (snap.data()?.status === 'playing')
      router.push({ name: 'game', params: { id: roomId } })
  })

  unsubscribePlayers = onSnapshot(playersRef, (snap) => {
    players.value = snap.docs.map(d => d.data())
    isHost.value  = players.value.find(p => p.uid === auth.currentUser?.uid)?.isHost ?? false
  })
})

onUnmounted(() => {
  unsubscribePlayers?.()
  unsubscribeRoom?.()
})

const MIN_PLAYERS = 2
const MAX_PLAYERS = 12

const canStart = computed(() =>
  isHost.value && players.value.length >= MIN_PLAYERS && !starting.value
)
const startTooltip = computed(() => {
  if (!isHost.value)                      return 'Только хост может начать'
  if (players.value.length < MIN_PLAYERS) return `Нужно минимум ${MIN_PLAYERS} игрока`
  return ''
})

const TIMER_OPTIONS = [
  { label: 'Выкл', value: 0 },
  { label: '30с',  value: 30 },
  { label: '60с',  value: 60 },
  { label: '90с',  value: 90 },
  { label: '2мин', value: 120 },
]

const copyCode = () => {
  navigator.clipboard.writeText(roomId).then(() => {
    toast.add({ severity: 'success', summary: 'Скопировано!', detail: `Код ${roomId}`, life: 2000 })
  })
}

// Выйти: передать хоста если нужно
const leaveRoom = async () => {
  const uid = auth.currentUser?.uid
  if (!uid) return router.push({ name: 'home' })
  try {
    if (isHost.value && players.value.length > 1) {
      const newHost = players.value.find(p => p.uid !== uid)
      if (newHost) {
        await updateDoc(doc(db, 'rooms', roomId, 'players', newHost.uid), { isHost: true })
        await updateDoc(doc(db, 'rooms', roomId), { hostId: newHost.uid })
      }
    }
    await deleteDoc(doc(db, 'rooms', roomId, 'players', uid))
  } catch (e) {
    console.error('Ошибка при выходе:', e)
  } finally {
    router.push({ name: 'home' })
  }
}

// Старт игры
const startGame = async () => {
  if (!canStart.value) return
  starting.value = true
  try {
    for (const player of players.value) {
      const playerRef   = doc(db, 'rooms', roomId, 'players', player.uid)
      const playerCards = {
        profession:    { value: getRandomItem(professions),     isRevealed: false },
        biology:       { value: getRandomItem(biology),         isRevealed: false },
        health:        { value: getRandomItem(healths),         isRevealed: false },
        hobby:         { value: getRandomItem(hobbies),         isRevealed: false },
        inventory:     { value: getRandomItem(inventories),     isRevealed: false },
        largeInventory:{ value: getRandomItem(largeInventories),isRevealed: false },
        phobia:        { value: getRandomItem(phobias),         isRevealed: false },
        fact1:         { value: getRandomItem(facts),           isRevealed: false },
        fact2:         { value: getRandomItem(facts),           isRevealed: false },
        special1:      { value: getRandomItem(specialCards),    isRevealed: false },
        special2:      { value: getRandomItem(specialCards),    isRevealed: false },
      }
      await updateDoc(playerRef, {
        cards: playerCards,
        isAlive: true,
        hasImmunity: false, hasDoubleVote: false, isMuted: false,
        specialBlocked: false, hasNoVote: false, forcedVoteBy: false, specialShield: false,
      })
    }
    await updateDoc(doc(db, 'rooms', roomId), {
      status:        'playing',
      catastrophe:   getRandomItem(catastrophes),
      bunkerSize:    Math.max(2, Math.floor(players.value.length / 2)),
      logs:          [],
      timerDuration: timerDuration.value,
      timerPaused:   false,
    })
  } catch (e) {
    console.error('Ошибка при старте игры:', e)
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось запустить игру', life: 4000 })
    starting.value = false
  }
}
</script>

<template>
  <div class="lobby-wrapper">

    <!-- Заголовок -->
    <div class="lobby-header">
      <div>
        <h1>☢️ Зал ожидания</h1>
        <p class="sub">Дождитесь всех игроков и нажмите «Начать»</p>
      </div>
      <Button label="Выйти" severity="secondary" icon="pi pi-sign-out" size="small" outlined @click="leaveRoom" />
    </div>

    <!-- Код комнаты -->
    <div class="code-card" @click="copyCode" v-tooltip.bottom="'Нажмите, чтобы скопировать'">
      <span class="code-label">КОД БУНКЕРА</span>
      <span class="code-value">{{ roomId }}</span>
      <span class="code-hint"><i class="pi pi-copy" /> Скопировать</span>
    </div>

    <!-- Счётчик -->
    <div class="player-count">
      <Tag :value="`${players.length} / ${MAX_PLAYERS} игроков`"
        :severity="players.length >= MIN_PLAYERS ? 'success' : 'warn'" />
      <span v-if="players.length < MIN_PLAYERS" class="need-more">
        Нужно ещё {{ MIN_PLAYERS - players.length }}
      </span>
    </div>

    <!-- Список игроков -->
    <div class="players-list">
      <div
        v-for="player in players" :key="player.uid"
        class="player-row"
        :class="{ 'is-me': player.uid === auth.currentUser?.uid }"
      >
        <span class="player-avatar">{{ player.name[0].toUpperCase() }}</span>
        <span class="player-name">{{ player.name }}</span>
        <Tag :value="player.isHost ? '👑 Хост' : '🧍 Игрок'"
          :severity="player.isHost ? 'danger' : 'secondary'" class="player-tag" />
      </div>
    </div>

    <!-- Настройки хоста -->
    <div v-if="isHost" class="host-settings">
      <div class="settings-label">⚙️ Настройки игры</div>

      <!-- Таймер хода -->
      <div class="setting-row">
        <span class="setting-name">⏱ Таймер хода</span>
        <div class="timer-options">
          <button
            v-for="opt in TIMER_OPTIONS" :key="opt.value"
            class="timer-opt-btn"
            :class="{ active: timerDuration === opt.value }"
            @click="timerDuration = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Действия -->
    <div class="lobby-actions">
      <template v-if="isHost">
        <Button
          label="Начать игру" severity="danger" size="large" icon="pi pi-play" class="w-full"
          :loading="starting" :disabled="!canStart" @click="startGame"
        />
        <p v-if="startTooltip" class="action-hint">{{ startTooltip }}</p>
      </template>
      <div v-else class="waiting-msg">
        <i class="pi pi-spin pi-spinner" style="font-size:1.2rem" />
        Ожидаем хоста…
      </div>
    </div>

  </div>
</template>

<style scoped>
.lobby-wrapper {
  max-width: 520px; margin: 0 auto; padding: 2rem 1.5rem;
  min-height: 100vh; display: flex; flex-direction: column; gap: 1.5rem;
}

.lobby-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
.lobby-header h1  { font-size:1.6rem; color:var(--color-accent); }
.lobby-header .sub { color:var(--color-muted); font-size:0.85rem; margin-top:0.25rem; }

.code-card {
  background:var(--color-surface); border:1px dashed var(--color-border);
  border-radius:var(--radius-md); padding:1.25rem 1.5rem;
  display:flex; flex-direction:column; align-items:center; gap:0.4rem;
  cursor:pointer; transition:border-color 0.2s, background 0.2s; user-select:none;
}
.code-card:hover { border-color:var(--color-warn); background:rgba(245,158,11,0.05); }
.code-label { font-size:0.75rem; color:var(--color-muted); text-transform:uppercase; letter-spacing:2px; }
.code-value { font-family:'Russo One',sans-serif; font-size:2.5rem; color:var(--color-warn); letter-spacing:8px; text-shadow:0 0 20px rgba(245,158,11,0.4); }
.code-hint  { font-size:0.75rem; color:#555; }

.player-count { display:flex; align-items:center; gap:0.75rem; }
.need-more    { color:var(--color-warn); font-size:0.85rem; }

.players-list { display:flex; flex-direction:column; gap:0.5rem; }
.player-row {
  background:var(--color-surface); border:1px solid var(--color-border);
  border-radius:var(--radius-sm); padding:0.75rem 1rem;
  display:flex; align-items:center; gap:0.75rem; transition:border-color 0.2s;
}
.player-row:hover { border-color:#444; }
.player-row.is-me { border-color:var(--color-accent); background:var(--color-accent-dim); }
.player-avatar {
  width:36px; height:36px; border-radius:50%;
  background:var(--color-accent-dim); border:1px solid var(--color-accent);
  color:var(--color-accent); font-weight:700; font-size:1rem;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.player-name { flex:1; font-weight:600; }
.player-tag  { flex-shrink:0; }

/* Настройки хоста */
.host-settings {
  background:var(--color-surface); border:1px solid var(--color-border);
  border-radius:var(--radius-md); padding:1rem 1.25rem; display:flex; flex-direction:column; gap:0.75rem;
}
.settings-label { font-size:0.8rem; color:var(--color-muted); text-transform:uppercase; letter-spacing:1px; }
.setting-row    { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
.setting-name   { font-size:0.9rem; color:var(--color-text); flex-shrink:0; }

.timer-options  { display:flex; gap:0.35rem; }
.timer-opt-btn {
  background:#1a1a1a; border:1px solid var(--color-border); border-radius:var(--radius-sm);
  color:var(--color-muted); font-size:0.8rem; padding:0.3rem 0.6rem; cursor:pointer;
  transition:all 0.18s;
}
.timer-opt-btn:hover { border-color:#555; color:var(--color-text); }
.timer-opt-btn.active { background:var(--color-accent-dim); border-color:var(--color-accent); color:var(--color-accent); font-weight:700; }

.lobby-actions { margin-top:auto; display:flex; flex-direction:column; gap:0.5rem; }
.action-hint   { text-align:center; color:var(--color-warn); font-size:0.8rem; }
.waiting-msg   { display:flex; align-items:center; justify-content:center; gap:0.75rem; color:var(--color-muted); font-size:1rem; padding:1rem; }
</style>
