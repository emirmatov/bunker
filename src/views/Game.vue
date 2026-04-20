<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  doc, collection, onSnapshot, updateDoc, writeBatch, arrayUnion, Timestamp,
  setDoc, increment, serverTimestamp,
} from 'firebase/firestore'
import {
  catastrophes, professions, healths, phobias,
  inventories, largeInventories, facts, biology,
  hobbies, specialCards, shuffleArray, getRandomItem
} from '../gameData'

import Button from 'primevue/button'
import Tag    from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

import GameParticles   from '../components/game/GameParticles.vue'
import KickAnimation   from '../components/game/KickAnimation.vue'
import DeathOverlay    from '../components/game/DeathOverlay.vue'
import GameEndDialog   from '../components/game/GameEndDialog.vue'
import VotingDialog    from '../components/game/VotingDialog.vue'
import SpecialCardDialog from '../components/game/SpecialCardDialog.vue'
import PeekDialog      from '../components/game/PeekDialog.vue'
import PlayerDossier   from '../components/game/PlayerDossier.vue'
import CatastropheBlock from '../components/game/CatastropheBlock.vue'
import TurnIndicator   from '../components/game/TurnIndicator.vue'
import OthersGrid      from '../components/game/OthersGrid.vue'
import EventLog        from '../components/game/EventLog.vue'
defineOptions({ name: 'GameView' })
const route  = useRoute()
const router = useRouter()
const toast  = useToast()
const roomId = route.params.id

const room            = ref(null)
const players         = ref([])
const myUid           = ref(null)
const isAuthLoading   = ref(true)
const isSpectatorMode = ref(false)

// ─── Диалог подглядывания (только локально) ─────────────────────
const peekDialog = ref(false)
const peekInfo   = ref({ playerName: '', label: '', value: '' })

// ─── Анимация частиц при спецкарте ──────────────────────────────
const showParticles  = ref(false)
const particleOrigin = ref({ x: 0, y: 0 })
const particleItems  = ref([])

const triggerParticles = (e) => {
  const el = e?.currentTarget
  if (el) {
    const r = el.getBoundingClientRect()
    particleOrigin.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  } else {
    particleOrigin.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }
  const COLORS = ['#f87171','#a78bfa','#4ade80','#fbbf24','#60a5fa','#fb923c','#f472b6']
  particleItems.value = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2
    const dist  = 70 + Math.random() * 130
    return {
      tx:    Math.cos(angle) * dist,
      ty:    Math.sin(angle) * dist,
      size:  5 + Math.random() * 9,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.12,
      dur:   0.6 + Math.random() * 0.4,
    }
  })
  showParticles.value = true
  setTimeout(() => { showParticles.value = false }, 1200)
}

// ─── Анимация кика ──────────────────────────────────────────────
const showKickAnim   = ref(false)
const kickAnimName   = ref('')
const kickAnimIsSelf = ref(false)
let   kickAnimTimer  = null
const isPassActionPending = ref(false)
let playersLoaded = false
const knownDeadUids = new Set()

watch(players, (newPlayers) => {
  if (!playersLoaded) {
    newPlayers.forEach(p => { if (p.isAlive === false) knownDeadUids.add(p.uid) })
    playersLoaded = true
    return
  }
  newPlayers.forEach(p => {
    if (p.isAlive === false && !knownDeadUids.has(p.uid)) {
      knownDeadUids.add(p.uid)
      kickAnimName.value   = p.name
      kickAnimIsSelf.value = p.uid === myUid.value
      showKickAnim.value   = true
      clearTimeout(kickAnimTimer)
      kickAnimTimer = setTimeout(() => { showKickAnim.value = false }, 3000)
    }
  })
}, { deep: true })

// ─── Таймер хода ────────────────────────────────────────────────
const timerSeconds = ref(0)
const timerWarning = computed(() =>
  timerSeconds.value <= 10 && timerSeconds.value > 0 && (room.value?.timerDuration || 0) > 0
)
let timerInterval  = null
let isPassingTurn  = false // защита от двойного вызова passTurn по таймеру

const syncTimer = () => {
  if (!room.value?.timerDuration) { timerSeconds.value = 0; return }
  if (room.value?.timerPaused)    { return }
  const end = room.value?.turnEndTime?.toMillis?.()
  if (!end) { timerSeconds.value = room.value.timerDuration; return }
  timerSeconds.value = Math.max(0, Math.ceil((end - Date.now()) / 1000))
  if (timerSeconds.value === 0 && me.value?.isHost && room.value?.status === 'playing' && activePlayerId.value && !isPassingTurn) {
    isPassingTurn = true
    passTurn({ force: true, reason: 'timeout' }).finally(() => { isPassingTurn = false })
  }
}

const pauseTimer = async () => {
  if (!me.value?.isHost) return
  await updateDoc(doc(db, 'rooms', roomId), {
    timerPaused:    true,
    timerRemaining: timerSeconds.value,
  })
}

const resumeTimer = async () => {
  if (!me.value?.isHost) return
  const remaining = room.value?.timerRemaining ?? room.value?.timerDuration ?? 60
  await updateDoc(doc(db, 'rooms', roomId), {
    turnEndTime: Timestamp.fromDate(new Date(Date.now() + remaining * 1000)),
    timerPaused: false,
  })
}

// ─── Auth & listeners ───────────────────────────────────────────
let unsubRoom = null, unsubPlayers = null

onMounted(() => {
  timerInterval = setInterval(syncTimer, 500)
  onAuthStateChanged(auth, (user) => {
    if (user) {
      myUid.value = user.uid
      initListeners()
    } else {
      router.push({ name: 'home' })
    }
    isAuthLoading.value = false
  })
})

function initListeners() {
  unsubRoom = onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) return router.push({ name: 'home' })
      room.value = snap.data()
    },
    () => router.push({ name: 'home' }),
  )
  unsubPlayers = onSnapshot(
    collection(db, 'rooms', roomId, 'players'),
    (snap) => { players.value = snap.docs.map(d => d.data()) },
    (err) => toast.add({ severity: 'error', summary: 'Ошибка соединения', detail: err.message, life: 5000 }),
  )
}

onUnmounted(() => {
  clearInterval(timerInterval)
  clearTimeout(kickAnimTimer)
  unsubRoom?.()
  unsubPlayers?.()
})

// ─── Инкремент статистики при завершении игры ───────────────
// Каждый клиент сам обновляет свой профиль — rules разрешают писать только в свой users/{uid}.
// Guard isAlreadyCounted защищает от двойного инкремента при ре-рендере.
const statsCountedFor = ref(null)  // roomId, за который уже посчитали

watch(() => room.value?.status, async (newStatus, oldStatus) => {
  if (newStatus !== 'finished' || oldStatus === 'finished') return
  if (!myUid.value) return
  if (statsCountedFor.value === roomId) return
  statsCountedFor.value = roomId

  // Инкогнито — статистику не ведём, аккаунт временный
  if (auth.currentUser?.isAnonymous) return

  const myPlayer = players.value.find(p => p.uid === myUid.value)
  if (!myPlayer) return   // зритель, не считаем

  const aliveUids = players.value.filter(p => p.isAlive !== false).map(p => p.uid)
  const iAmAlive  = aliveUids.includes(myUid.value)

  // Outcome:
  //   win       — жив к концу игры
  //   killed    — мёртв (убит спецкартой / голосованием — без разделения)
  const outcome = iAmAlive ? 'win' : 'killed'

  const patch = {
    'stats.gamesPlayed': increment(1),
    lastPlayedAt: serverTimestamp(),
  }
  if (iAmAlive) {
    patch['stats.wins']     = increment(1)
    patch['stats.survived'] = increment(1)
  } else {
    patch['stats.killed']   = increment(1)
  }

  try {
    await updateDoc(doc(db, 'users', myUid.value), patch)
    // Запись в историю игр
    await setDoc(doc(db, 'users', myUid.value, 'gameHistory', roomId), {
      roomId,
      endedAt: serverTimestamp(),
      outcome,
      playerCount: players.value.length,
      pack: room.value?.packId || 'standard',
      catastrophe: room.value?.catastrophe?.text || room.value?.catastrophe || null,
    })
  } catch (e) {
    console.warn('[stats] не удалось обновить:', e)
  }
})

// ─── Computed ───────────────────────────────────────────────────
const me             = computed(() => players.value.find(p => p.uid === myUid.value))
const others         = computed(() => players.value.filter(p => p.uid !== myUid.value))
const alivePlayers   = computed(() => players.value.filter(p => p.isAlive !== false))
const alivePlayersCount = computed(() => alivePlayers.value.length)
const deadPlayers    = computed(() => players.value.filter(p => p.isAlive === false))

const isVoting         = computed(() => room.value?.status === 'voting')
const myVote           = computed(() => room.value?.votes?.[myUid.value])
const activePlayerId   = computed(() => room.value?.activePlayerId)
const activePlayer     = computed(() => players.value.find(p => p.uid === activePlayerId.value) || null)
const isMyTurn         = computed(() => activePlayerId.value === myUid.value && me.value?.isAlive !== false)
const canPassTurn      = computed(() =>
  room.value?.status === 'playing' &&
  !!activePlayerId.value &&
  (isMyTurn.value || me.value?.isHost)
)
const activePlayerName = computed(() =>
  players.value.find(p => p.uid === activePlayerId.value)?.name || 'Никто'
)

const cardLabels = {
  profession:    '💼 Профессия',
  biology:       '🧬 Биология',
  health:        '❤️ Здоровье',
  hobby:         '🎨 Хобби',
  inventory:     '🎒 Багаж',
  largeInventory:'📦 Крупный багаж',
  fact1:         '📜 Факт 1',
  fact2:         '📜 Факт 2',
  phobia:        '😱 Фобия',
  special1:      '⚡ Спец. 1',
  special2:      '⚡ Спец. 2',
}
const cardOrder = [
  'profession','biology','health','hobby',
  'inventory','largeInventory','fact1','fact2',
  'phobia','special1','special2'
]
const nonSpecialKeys = cardOrder.filter(k => !k.startsWith('special'))

const getCardText = (v) => (typeof v === 'object' && v !== null) ? v.text : v

// ─── Лог ──────────────────────────────────────────────────────
const logEvent = async (msg) => {
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  await updateDoc(doc(db, 'rooms', roomId), {
    logs: arrayUnion(`[${time}] ${msg}`)
  })
}

// Возвращает поля таймера для вставки в updateDoc — не отдельный запрос
const timerFields = () => {
  const dur = room.value?.timerDuration
  if (!dur || dur === 0) return {}
  return {
    turnEndTime: Timestamp.fromDate(new Date(Date.now() + dur * 1000)),
    timerPaused: false,
  }
}

// ─── Ходы ─────────────────────────────────────────────────────
const startFirstTurn = async () => {
  if (!me.value?.isHost) return
  const batch = writeBatch(db)
  if (alivePlayersCount.value === 0) {
    players.value.forEach(p =>
      batch.update(doc(db, 'rooms', roomId, 'players', p.uid), { isAlive: true })
    )
    await batch.commit()
  }
  const sorted = players.value
    .filter(p => p.isAlive !== false)
    .sort((a, b) => a.uid.localeCompare(b.uid))
  if (sorted.length > 0) {
    await updateDoc(doc(db, 'rooms', roomId), {
      activePlayerId: sorted[0].uid,
      status: 'playing',
      ...timerFields(),
    })
  }
}

const passTurn = async ({ force = false, reason = null } = {}) => {
  if (room.value?.status !== 'playing' || !activePlayerId.value) return
  const amActivePlayer = activePlayerId.value === myUid.value
  const canControlTurn = amActivePlayer || me.value?.isHost
  if (!canControlTurn || (!force && !amActivePlayer)) return
  const sorted = [...alivePlayers.value].sort((a, b) => a.uid.localeCompare(b.uid))
  const idx    = sorted.findIndex(p => p.uid === activePlayerId.value)
  if (idx < 0) return
  let next = null
  for (let i = 1; i <= sorted.length; i++) {
    const candidate = sorted[(idx + i) % sorted.length]
    if (!candidate.isMuted) { next = candidate; break }
  }
const keepRoundOnTimeout = reason === 'timeout'
  const isEndOfRound =
    !next ||
    next.uid === activePlayerId.value ||
    (!keepRoundOnTimeout && idx === sorted.length - 1)

  if (reason === 'timeout') {
    const timedOutPlayer = players.value.find(p => p.uid === activePlayerId.value)
    if (timedOutPlayer) await logEvent(`⏰ Время хода ${timedOutPlayer.name} вышло — ход пропущен`)
  } else if (reason === 'player_request') {
    const requestedBy = players.value.find(p => p.uid === activePlayerId.value)
    if (requestedBy) await logEvent(`⏭️ ${requestedBy.name} завершил ход`)
  } else if (reason === 'host_skip') {
    const skippedPlayer = players.value.find(p => p.uid === activePlayerId.value)
    if (skippedPlayer) await logEvent(`🧑‍✈️ Хост пропустил ход игрока ${skippedPlayer.name}`)
  }
  if (isEndOfRound) {
    const maxSeats = room.value?.bunkerSize || 2
    if (alivePlayers.value.length <= maxSeats) {
      await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' })
      await logEvent('🔒 Бункер закрыт! Выжившие определены.')
    } else {
      await updateDoc(doc(db, 'rooms', roomId), { status: 'voting', votes: {} })
    }
  } else {
    await updateDoc(doc(db, 'rooms', roomId), { activePlayerId: next.uid, ...timerFields() })
  }
}

const requestTurnSkip = async () => {
  if (!isMyTurn.value) return
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'players', myUid.value), {
      turnSkipRequestAt: Timestamp.now(),
    })
    toast.add({ severity: 'info', summary: '⏭️ Запрос отправлен', detail: 'Хост завершит ваш ход', life: 1800 })
  } catch (e) {
    isPassActionPending.value = false
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось отправить запрос скипа', life: 2200 })
  }
}

const onPassTurnClick = async () => {
  if (isPassActionPending.value) return
  isPassActionPending.value = true

  if (isMyTurn.value && !me.value?.isHost) {
    await requestTurnSkip()
    return
  }
  try {
    if (!isMyTurn.value && me.value?.isHost) {
      await passTurn({ force: true, reason: 'host_skip' })
      return
    }
    await passTurn({ reason: 'self' })
  } finally {
    isPassActionPending.value = false
  }
}

// ─── Кик игрока ──────────────────────────────────────────────
const kickPlayer = async (targetUid) => {
  if (targetUid === 'skip_vote') return
  const p = players.value.find(x => x.uid === targetUid)
  if (!p) return
  const newCards = { ...p.cards }
  Object.keys(newCards).forEach(k => (newCards[k] = { ...newCards[k], isRevealed: true }))
  await updateDoc(doc(db, 'rooms', roomId, 'players', targetUid), {
    isAlive: false, cards: newCards
  })
  await logEvent(`🚪 ${p.name} изгнан из бункера`)
  const aliveAfterKick = players.value.filter(pl => pl.uid !== targetUid && pl.isAlive !== false)
  const maxSeats = room.value?.bunkerSize || 2
  if (aliveAfterKick.length <= maxSeats && aliveAfterKick.length > 0) {
    await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' })
    await logEvent('🔒 Бункер закрыт! Выжившие определены.')
  }
}

// ─── Голосование ─────────────────────────────────────────────
const voteFor = async (targetUid) => {
  if (myVote.value || me.value?.isAlive === false || me.value?.isMuted || me.value?.hasNoVote) return
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      [`votes.${myUid.value}`]: targetUid
    })
  } catch (e) { console.error(e) }
}

// ─── Watchers ────────────────────────────────────────────────

// Авто-пропуск заглушённого
watch(activePlayerId, async (newId) => {
  if (!me.value?.isHost || !newId) return
  if (room.value?.status !== 'playing') return
  const activePlayer = players.value.find(p => p.uid === newId)
  if (!activePlayer?.isMuted) return

  const sorted = [...alivePlayers.value].sort((a, b) => a.uid.localeCompare(b.uid))
  const idx    = sorted.findIndex(p => p.uid === newId)
  let next = null
  for (let i = 1; i <= sorted.length; i++) {
    const candidate = sorted[(idx + i) % sorted.length]
    if (!candidate.isMuted) { next = candidate; break }
  }
  await logEvent(`🤐 ${activePlayer.name} заглушён — ход пропущен`)
  if (!next || next.uid === newId || idx === sorted.length - 1) {
    await updateDoc(doc(db, 'rooms', roomId), { status: 'voting', votes: {} })
  } else {
    await updateDoc(doc(db, 'rooms', roomId), { activePlayerId: next.uid, ...timerFields() })
  }
})
watch([isMyTurn, () => room.value?.status], ([myTurn, status]) => {
  if (!myTurn || status !== 'playing') {
    isPassActionPending.value = false
  }
})

let skipRequestInFlight = false
watch(
  () => activePlayer.value?.turnSkipRequestAt?.toMillis?.() ?? null,
  async (requestTs) => {
    if (!me.value?.isHost || !activePlayerId.value || room.value?.status !== 'playing') return
    if (!requestTs || skipRequestInFlight) return

    skipRequestInFlight = true
    try {
      const activeUid = activePlayerId.value
      await updateDoc(doc(db, 'rooms', roomId, 'players', activeUid), { turnSkipRequestAt: null })
      await passTurn({ force: true, reason: 'player_request' })
    } finally {
      skipRequestInFlight = false
    }
  }
)
// Подсчёт голосов
watch(() => room.value?.votes, async (newVotes) => {
  if (!me.value?.isHost || room.value?.status !== 'voting' || !newVotes) return
  const votingPlayers = alivePlayers.value.filter(p => !p.isMuted && !p.hasNoVote)
  if (Object.keys(newVotes).length < votingPlayers.length) return

  const tally = {}
  Object.entries(newVotes).forEach(([voterUid, targetUid]) => {
    const voter = players.value.find(p => p.uid === voterUid)
    if (voter?.hasNoVote) return
    const weight = voter?.hasDoubleVote ? 2 : 1
    let actual   = targetUid
    if (voter?.forcedVoteBy) {
      const fv = newVotes[voter.forcedVoteBy]
      if (fv && fv !== 'skip_vote') actual = fv
    }
    if (actual !== 'skip_vote') tally[actual] = (tally[actual] || 0) + weight
  })

  let maxVotes = 0, kickedUid = null
  Object.entries(tally).forEach(([uid, count]) => {
    const target = players.value.find(p => p.uid === uid)
    if (count > maxVotes && !target?.hasImmunity) { maxVotes = count; kickedUid = uid }
  })
  if (kickedUid) await kickPlayer(kickedUid)

  const batch = writeBatch(db)
  players.value.forEach(p => {
    batch.update(doc(db, 'rooms', roomId, 'players', p.uid), {
      hasImmunity: false, hasDoubleVote: false, isMuted: false,
      specialBlocked: false, hasNoVote: false, forcedVoteBy: false, specialShield: false
    })
  })
  const aliveAfterKick = players.value.filter(p => p.uid !== kickedUid && p.isAlive !== false)
  const maxSeats = room.value?.bunkerSize || 2
  if (aliveAfterKick.length <= maxSeats && aliveAfterKick.length > 0) {
    batch.update(doc(db, 'rooms', roomId), { votes: {} })
    await batch.commit()
    return
  }
  const sorted = [...aliveAfterKick].sort((a, b) => a.uid.localeCompare(b.uid))
  batch.update(doc(db, 'rooms', roomId), {
    status: 'playing', votes: {}, activePlayerId: sorted[0]?.uid || null, ...timerFields(),
  })
  await batch.commit()
}, { deep: true })

// ─── Спец-карты ──────────────────────────────────────────────
const showSpecialDialog   = ref(false)
const selectedSpecialCard = ref(null)

const playSound = (name) => {
  try {
    new Audio(`/${name}.mp3`).play()
  } catch (e) {
    console.error('[playSound]', e)
  }
}

const revealCard = async (key, data, event) => {
  if (!data || data.isRevealed || me.value?.isAlive === false || !isMyTurn.value) return
  if (key.startsWith('special')) {
    if (me.value?.specialBlocked) {
      toast.add({ severity: 'warn', summary: '🔪 Заблокировано', detail: 'Ваши спецкарты заблокированы в этом ходу!', life: 3000 })
      return
    }
    const cardType = data.value?.type
    if (cardType === 'self') {
      selectedSpecialCard.value = { key, data }
      triggerParticles(event)
      await applySpecialCard(myUid.value)
    } else if (cardType === 'all') {
      selectedSpecialCard.value = { key, data }
      triggerParticles(event)
      await applySpecialCard(null)
    } else if (cardType === 'reaction') {
      selectedSpecialCard.value = { key, data }
      triggerParticles(event)
      await applySpecialCard(myUid.value)
    } else if (cardType === 'random_player') {
      const alive = alivePlayers.value.filter(p => p.uid !== myUid.value)
      if (!alive.length) { toast.add({ severity: 'warn', summary: 'Нет цели', detail: 'Нет живых игроков', life: 3000 }); return }
      selectedSpecialCard.value = { key, data }
      triggerParticles(event)
      await applySpecialCard(alive[Math.floor(Math.random() * alive.length)].uid)
    } else {
      selectedSpecialCard.value = { key, data }
      showSpecialDialog.value = true
    }
  } else {
    playSound('flip')
    await updateDoc(doc(db, 'rooms', roomId, 'players', myUid.value), {
      [`cards.${key}.isRevealed`]: true
    })
  }
}

// ─── Применить спецкарту ─────────────────────────────────────
const applySpecialCard = async (targetUid) => {
  showSpecialDialog.value = false
  playSound('flip')

  const target = targetUid ? players.value.find(p => p.uid === targetUid) : null
  const cardId = selectedSpecialCard.value.data.value.id
  const batch  = writeBatch(db)

  try {
    // Щит (shizo_pills) блокирует входящую спецкарту
    if (targetUid && targetUid !== myUid.value && target?.specialShield) {
      await logEvent(`💊 Щит ${target.name} отразил спецкарту ${me.value.name}!`)
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { specialShield: false })
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), {
        [`cards.${selectedSpecialCard.value.key}.isRevealed`]: true
      })
      await batch.commit()
      return
    }

    if (cardId === 'kill') {
      const tc = { ...target.cards }
      Object.keys(tc).forEach(k => (tc[k] = { ...tc[k], isRevealed: true }))
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { isAlive: false, cards: tc })
      await logEvent(`🔫 ${me.value.name} убил ${target.name}`)
      const alive = alivePlayers.value.filter(p => p.uid !== targetUid)
      if (alive.length <= (room.value?.bunkerSize || 2) && alive.length > 0)
        batch.update(doc(db, 'rooms', roomId), { status: 'finished' })

    } else if (cardId === 'heal') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.health': { value: 'Полностью здоров', isRevealed: true }
      })
      await logEvent(`❤️ ${me.value.name} вылечил ${target.name}`)

    } else if (cardId === 'revive') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { isAlive: true })
      await logEvent(`👼 ${me.value.name} воскресил ${target.name}`)

    } else if (cardId === 'steal_luggage') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), {
        'cards.inventory': target.cards.inventory, 'cards.largeInventory': target.cards.largeInventory,
      })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.inventory': me.value.cards.inventory, 'cards.largeInventory': me.value.cards.largeInventory,
      })
      await logEvent(`🎒 ${me.value.name} украл багаж у ${target.name}`)

    } else if (cardId === 'swap_health') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.health': target.cards.health })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.health': me.value.cards.health })
      await logEvent(`💉 ${me.value.name} обменялся здоровьем с ${target.name}`)

    } else if (cardId === 'swap_role') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.profession': target.cards.profession })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.profession': me.value.cards.profession })
      await logEvent(`🎭 ${me.value.name} обменялся профессией с ${target.name}`)

    } else if (cardId === 'swap_phobia') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.phobia': target.cards.phobia })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.phobia': me.value.cards.phobia })
      await logEvent(`😱 ${me.value.name} обменялся фобией с ${target.name}`)

    } else if (cardId === 'immunity' || cardId === 'exile_shield') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { hasImmunity: true })
      await logEvent(`🛡️ ${me.value.name} получил иммунитет`)

    } else if (cardId === 'force_reveal') {
      players.value.forEach(p =>
        batch.update(doc(db, 'rooms', roomId, 'players', p.uid), { 'cards.health.isRevealed': true })
      )
      await logEvent(`📢 ${me.value.name} вскрыл здоровье всех`)

    } else if (cardId === 'check_card') {
      const hidden = cardOrder.filter(k => !target.cards?.[k]?.isRevealed)
      if (hidden.length > 0) {
        const rk = hidden[Math.floor(Math.random() * hidden.length)]
        peekInfo.value = { playerName: target.name, label: cardLabels[rk], value: getCardText(target.cards[rk].value) }
        peekDialog.value = true
        await logEvent(`👁️ ${me.value.name} подглядел карту у ${target.name}`)
      } else {
        toast.add({ severity: 'info', summary: '👁️', detail: `У ${target.name} нет скрытых карт`, life: 3000 })
      }

    } else if (cardId === 'double_vote') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { hasDoubleVote: true })
      await logEvent(`⚖️ ${me.value.name} получил двойной голос`)

    } else if (cardId === 'reveal_prof') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.profession.isRevealed': true })
      await logEvent(`💼 ${me.value.name} вскрыл профессию ${target.name}`)

    } else if (cardId === 'change_catastrophe') {
      batch.update(doc(db, 'rooms', roomId), { catastrophe: getRandomItem(catastrophes) })
      await logEvent(`🌀 ${me.value.name} сменил катастрофу`)

    } else if (cardId === 'bunker_plus') {
      const ns = (room.value?.bunkerSize || 2) + 1
      batch.update(doc(db, 'rooms', roomId), { bunkerSize: ns })
      await logEvent(`🏗️ ${me.value.name} расширил бункер до ${ns} мест`)

    } else if (cardId === 'bunker_minus') {
      const ns = Math.max(1, (room.value?.bunkerSize || 2) - 1)
      batch.update(doc(db, 'rooms', roomId), { bunkerSize: ns })
      await logEvent(`🏚️ ${me.value.name} уменьшил бункер до ${ns} мест`)

    } else if (cardId === 'random_health_all') {
      players.value.forEach(p =>
        batch.update(doc(db, 'rooms', roomId, 'players', p.uid), {
          'cards.health': { value: getRandomItem(healths), isRevealed: true }
        })
      )
      await logEvent(`☢️ ${me.value.name} — радиационный выброс!`)

    } else if (cardId === 'spy_dossier') {
      const hidden = cardOrder.filter(k => !target.cards[k]?.isRevealed)
      const toReveal = shuffleArray(hidden).slice(0, 3)
      toReveal.forEach(k =>
        batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { [`cards.${k}.isRevealed`]: true })
      )
      await logEvent(`🕵️ ${me.value.name} вскрыл ${toReveal.length} карт у ${target.name}`)

    } else if (cardId === 'identity_theft') {
      const mp = {}, tp = {}
      nonSpecialKeys.forEach(k => { mp[`cards.${k}`] = target.cards[k]; tp[`cards.${k}`] = me.value.cards[k] })
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), mp)
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), tp)
      await logEvent(`🎭 ${me.value.name} украл личность ${target.name}`)

    } else if (cardId === 'reboot_cards') {
      const patch = {}
      nonSpecialKeys.forEach(k => { if (me.value.cards[k]?.isRevealed) patch[`cards.${k}.isRevealed`] = false })
      if (Object.keys(patch).length > 0)
        batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), patch)
      await logEvent(`♻️ ${me.value.name} скрыл свои вскрытые карты`)

    } else if (cardId === 'kick_host') {
      const candidates = alivePlayers.value.filter(p => p.uid !== myUid.value)
      if (candidates.length > 0) {
        const nh = candidates[Math.floor(Math.random() * candidates.length)]
        batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { isHost: false })
        batch.update(doc(db, 'rooms', roomId, 'players', nh.uid), { isHost: true })
        batch.update(doc(db, 'rooms', roomId), { hostId: nh.uid })
        await logEvent(`👑 Переворот! Новый хост: ${nh.name}`)
      }

    } else if (cardId === 'golden_shower') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.inventory': { value: '67 галлонов мочи', isRevealed: true }
      })
      await logEvent(`💦 ${me.value.name} окатил ${target.name}`)

    } else if (cardId === 'twitter_cancel') {
      const animeWords = ['аниме', 'анимешник', 'гуро', 'anime', '2d']
      const f1 = (target.cards.fact1?.value || '').toString().toLowerCase()
      const f2 = (target.cards.fact2?.value || '').toString().toLowerCase()
      if (animeWords.some(w => f1.includes(w) || f2.includes(w))) {
        const tc = { ...target.cards }
        Object.keys(tc).forEach(k => (tc[k] = { ...tc[k], isRevealed: true }))
        batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { isAlive: false, cards: tc })
        await logEvent(`❌ ${me.value.name} отменил ${target.name} за аниме-факт!`)
        const alive = alivePlayers.value.filter(p => p.uid !== targetUid)
        if (alive.length <= (room.value?.bunkerSize || 2) && alive.length > 0)
          batch.update(doc(db, 'rooms', roomId), { status: 'finished' })
      } else {
        await logEvent(`❌ Кэнселлинг провалился — у ${target.name} нет аниме-фактов`)
      }

    } else if (cardId === 'gacha_addiction') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.inventory': { value: 'Всё потрачено на гачу', isRevealed: true },
        'cards.largeInventory': { value: 'Всё потрачено на гачу', isRevealed: true },
        'cards.health': { value: getRandomItem(healths), isRevealed: true }
      })
      await logEvent(`🎰 ${me.value.name} подсадил ${target.name} на гачу!`)

    } else if (cardId === 'anal_probing') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.fact2.isRevealed': true, 'cards.health.isRevealed': true
      })
      await logEvent(`👽 ${me.value.name} провёл зондирование ${target.name}`)

    } else if (cardId === 'cum_tribute') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.largeInventory': target.cards.largeInventory })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.largeInventory': { value: 'Отдано в качестве трибьюта', isRevealed: true }
      })
      await logEvent(`🥛 ${me.value.name} принял трибьют от ${target.name}`)

    } else if (cardId === 'abort_mission') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { specialBlocked: true })
      await logEvent(`🔪 ${me.value.name} заблокировал спецкарты ${target.name}`)

    } else if (cardId === 'mommy_issues') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { forcedVoteBy: myUid.value })
      await logEvent(`🤱 ${me.value.name} взял под контроль голос ${target.name}`)

    } else if (cardId === 'cringe_attack') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.fact1.isRevealed': true })
      await logEvent(`😬 Кринж-атака! ${target.name} обязан зачитать карты мерзким голосом`)

    } else if (cardId === 'goida') {
      const wasVoting = room.value?.status === 'voting'
      if (wasVoting) {
        const sorted = [...alivePlayers.value].sort((a, b) => a.uid.localeCompare(b.uid))
        batch.update(doc(db, 'rooms', roomId), { status: 'playing', votes: {}, activePlayerId: sorted[0]?.uid || null })
      }
      alivePlayers.value.forEach(p =>
        batch.update(doc(db, 'rooms', roomId, 'players', p.uid), {
          'cards.inventory': { value: 'ГОЙДА! (Изъято)', isRevealed: true }
        })
      )
      await logEvent(`🇷🇺 ГОЙДА! ${me.value.name}${wasVoting ? ' отменил голосование!' : '!'} Инвентарь всех изъят`)

    } else if (cardId === 'sugar_daddy') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), {
        'cards.inventory': target.cards.inventory, 'cards.largeInventory': target.cards.largeInventory,
      })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.inventory': { value: 'Продано шугар-дэдди', isRevealed: true },
        'cards.largeInventory': { value: 'Продано шугар-дэдди', isRevealed: true },
        hasImmunity: true
      })
      await logEvent(`💸 ${me.value.name} купил инвентарь у ${target.name} за иммунитет`)

    } else if (cardId === 'onlyfans_promo') {
      const patch = {}
      cardOrder.forEach(k => { patch[`cards.${k}.isRevealed`] = true })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), patch)
      await logEvent(`📸 ${me.value.name} слил онлифанс ${target.name}! Всё вскрыто`)

    } else if (cardId === 'dota_rage') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { hasNoVote: true })
      await logEvent(`🤬 ${me.value.name} оскорбил мать ${target.name} — голос не учитывается!`)

    } else if (cardId === 'russian_roulette') {
      const loserId = Math.random() < 0.5 ? myUid.value : targetUid
      const loser   = players.value.find(p => p.uid === loserId)
      const lc = { ...loser.cards }
      Object.keys(lc).forEach(k => (lc[k] = { ...lc[k], isRevealed: true }))
      batch.update(doc(db, 'rooms', roomId, 'players', loserId), { isAlive: false, cards: lc })
      await logEvent(`🔫 Русская рулетка! Погиб: ${loser.name}`)
      const alive = alivePlayers.value.filter(p => p.uid !== loserId)
      if (alive.length <= (room.value?.bunkerSize || 2) && alive.length > 0)
        batch.update(doc(db, 'rooms', roomId), { status: 'finished' })

    } else if (cardId === 'gay_radar') {
      const gayWords = ['гей','би','лесби','пансекс','полисекс','полиамор','аромантик']
      players.value.forEach(p => {
        const bio = (p.cards?.biology?.value || '').toString().toLowerCase()
        if (gayWords.some(w => bio.includes(w)))
          batch.update(doc(db, 'rooms', roomId, 'players', p.uid), { 'cards.biology.isRevealed': true })
      })
      await logEvent(`🌈 ${me.value.name} включил гей-радар!`)

    } else if (cardId === 'bunker_orgy') {
      const alive = [...alivePlayers.value]
      if (alive.length > 1) {
        const rk    = nonSpecialKeys[Math.floor(Math.random() * nonSpecialKeys.length)]
        const cards = alive.map(p => p.cards[rk])
        alive.forEach((p, i) =>
          batch.update(doc(db, 'rooms', roomId, 'players', p.uid), { [`cards.${rk}`]: cards[(i + 1) % alive.length] })
        )
        await logEvent(`🔞 Оргия в бункере! Все обменялись: ${cardLabels[rk]}`)
      }

    } else if (cardId === 'shizo_pills') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { specialShield: true })
      await logEvent(`💊 ${me.value.name} принял таблетки — следующая спецкарта отразится`)

    } else if (cardId === 'snitch') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.inventory': { value: 'Украдено крысой', isRevealed: true },
        'cards.largeInventory.isRevealed': true,
      })
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.inventory': target.cards.inventory })
      await logEvent(`🐀 ${me.value.name} — крыса! Украл инвентарь у ${target.name}`)

    } else if (cardId === 'forced_transition') {
      const bio   = (target.cards.biology?.value || '').toString()
      const lower = bio.toLowerCase()
      let newBio  = bio
      if (lower.includes('мужчина') || lower.includes('парень') || lower.includes('мальчик'))
        newBio = bio.replace(/мужчина/gi,'Женщина').replace(/парень/gi,'Девушка').replace(/мальчик/gi,'Девочка')
      else if (lower.includes('женщина') || lower.includes('девушка') || lower.includes('девочка'))
        newBio = bio.replace(/женщина/gi,'Мужчина').replace(/девушка/gi,'Парень').replace(/девочка/gi,'Мальчик')
      else newBio = bio + ' [пол изменён]'
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.biology': { value: newBio, isRevealed: true }
      })
      await logEvent(`🏳️‍⚧️ ${me.value.name} сменил пол ${target.name}`)

    } else if (cardId === 'gaslighting') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.health': { value: getRandomItem(healths), isRevealed: true }
      })
      await logEvent(`🕯️ ${me.value.name} газлайтил ${target.name}`)

    } else if (cardId === 'tiktok_trend') {
      players.value.forEach(p =>
        batch.update(doc(db, 'rooms', roomId, 'players', p.uid), { 'cards.fact1.isRevealed': true })
      )
      await logEvent(`📱 ТикТок тренд от ${me.value.name}! Факт 1 вскрыт у всех`)

    } else if (cardId === 'swatting') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.largeInventory': { value: 'Изъято спецназом при обыске', isRevealed: true }
      })
      await logEvent(`🚔 Сваттинг! Спецназ обыскал ${target.name}`)

    } else if (cardId === 'divorce') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.largeInventory': target.cards.largeInventory })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        'cards.largeInventory': { value: 'Отдано по алиментам', isRevealed: true }
      })
      await logEvent(`💔 ${me.value.name} забрал крупный багаж у ${target.name} по алиментам`)

    } else if (cardId === 'necromancy_fail') {
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), {
        isAlive: true,
        'cards.health':         { value: '1 ХП (ЗОМБИ)', isRevealed: true },
        'cards.inventory':      { value: 'Ничего (сгнило)', isRevealed: true },
        'cards.largeInventory': { value: 'Ничего (сгнило)', isRevealed: true },
      })
      await logEvent(`🧟 ${me.value.name} поднял ${target.name} зомби с 1 ХП!`)

    } else if (cardId === 'hypnosis') {
      batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), { 'cards.profession': target.cards.profession })
      batch.update(doc(db, 'rooms', roomId, 'players', targetUid), { 'cards.profession': me.value.cards.profession })
      await logEvent(`🌀 ${me.value.name} загипнотизировал ${target.name} и поменялся профессией`)

    } else if (cardId === 'brown_note') {
      alivePlayers.value.forEach(p =>
        batch.update(doc(db, 'rooms', roomId, 'players', p.uid), {
          'cards.inventory': { value: 'Использовано как туалетная бумага', isRevealed: true }
        })
      )
      await logEvent(`🎵 Коричневая нота от ${me.value.name}! Весь инвентарь испорчен`)
    }

    batch.update(doc(db, 'rooms', roomId, 'players', myUid.value), {
      [`cards.${selectedSpecialCard.value.key}.isRevealed`]: true
    })
    await batch.commit()
  } catch (e) {
    console.error('[applySpecialCard]', e)
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось применить карту', life: 3000 })
  }
}

// ─── Рестарт ─────────────────────────────────────────────────
const restartGame = async () => {
  if (!me.value?.isHost) return
  const batch  = writeBatch(db)
  const deckP  = shuffleArray(professions)
  const deckB  = shuffleArray(biology)
  const deckH  = shuffleArray(healths)
  const deckHo = shuffleArray(hobbies)
  const deckI  = shuffleArray(inventories)
  const deckLI = shuffleArray(largeInventories)
  const deckPh = shuffleArray(phobias)
  const deckF  = shuffleArray(facts)
  const deckSp = shuffleArray(specialCards)
  let fi = 0, si = 0
  players.value.forEach((p, i) => {
    batch.update(doc(db, 'rooms', roomId, 'players', p.uid), {
      isAlive: true,
      hasImmunity: false, hasDoubleVote: false, isMuted: false,
      specialBlocked: false, hasNoVote: false, forcedVoteBy: false, specialShield: false,
      turnSkipRequestAt: null,
      cards: {
        profession:    { value: deckP[i],    isRevealed: false },
        biology:       { value: deckB[i],    isRevealed: false },
        health:        { value: deckH[i],    isRevealed: false },
        hobby:         { value: deckHo[i],   isRevealed: false },
        inventory:     { value: deckI[i],    isRevealed: false },
        largeInventory:{ value: deckLI[i],   isRevealed: false },
        phobia:        { value: deckPh[i],   isRevealed: false },
        fact1:         { value: deckF[fi++], isRevealed: false },
        fact2:         { value: deckF[fi++], isRevealed: false },
        special1:      { value: deckSp[si++],isRevealed: false },
        special2:      { value: deckSp[si++],isRevealed: false },
      }
    })
  })
  const sorted = [...players.value].sort((a, b) => a.uid.localeCompare(b.uid))
  batch.update(doc(db, 'rooms', roomId), {
    status: 'playing', votes: {},
    logs: ['[СИСТЕМА] Хост перезапустил игру!'],
    catastrophe: getRandomItem(catastrophes),
    activePlayerId: sorted[0].uid,
    bunkerSize: Math.max(2, Math.floor(players.value.length / 2)),
    timerPaused: false,
    ...timerFields(),
  })
  await batch.commit()
}
</script>

<template>
  <!-- Загрузка -->
  <div v-if="isAuthLoading || !room || !me || !me.cards" class="loading-screen">
    <h2 class="pulse-text">⚡ ПОДКЛЮЧЕНИЕ К БУНКЕРУ...</h2>
  </div>

  <div v-else class="game-wrapper">

    <GameParticles :show="showParticles" :particles="particleItems" :origin="particleOrigin" />
    <KickAnimation :show="showKickAnim" :name="kickAnimName" :is-self="kickAnimIsSelf" />
    <DeathOverlay
      :show="me.isAlive === false && !isSpectatorMode && room.status !== 'finished'"
      @spectate="isSpectatorMode = true"
    />
    <GameEndDialog
      :visible="room.status === 'finished'"
      :players="players"
      :is-host="!!me.isHost"
      @restart="restartGame"
    />
    <VotingDialog
      :visible="isVoting"
      :me="me"
      :my-uid="myUid"
      :alive-players="alivePlayers"
      :my-vote="myVote"
      :votes="room.votes || {}"
      @vote="voteFor"
    />
    <SpecialCardDialog
      v-model:visible="showSpecialDialog"
      :card="selectedSpecialCard"
      :alive-players="alivePlayers"
      :dead-players="deadPlayers"
      :my-uid="myUid"
      @apply="applySpecialCard"
    />
    <PeekDialog
      v-model:visible="peekDialog"
      :player-name="peekInfo.playerName"
      :label="peekInfo.label"
      :value="peekInfo.value"
    />

    <!-- ══ ИГРОВОЕ ПОЛЕ ══ -->
    <div class="game-board" :class="{ 'spectator-dim': me.isAlive === false && !isSpectatorMode }">

      <PlayerDossier
        :me="me"
        :is-my-turn="isMyTurn"
        :card-order="cardOrder"
        :card-labels="cardLabels"
        :get-card-text="getCardText"
        @reveal-card="revealCard"
      />

      <main class="main-column">
        <CatastropheBlock
          :name="room.catastrophe?.name"
          :description="room.catastrophe?.description"
          :bunker-size="room.bunkerSize || 2"
          :alive-count="alivePlayersCount"
        />
        <TurnIndicator
          :active-player-id="activePlayerId"
          :is-my-turn="isMyTurn"
          :active-player-name="activePlayerName"
          :can-pass-turn="canPassTurn"
          :is-host="!!me.isHost"
          :timer-duration="room.timerDuration || 0"
          :timer-seconds="timerSeconds"
          :timer-warning="timerWarning"
          :timer-paused="!!room.timerPaused"
          @start="startFirstTurn"
          @pass="onPassTurnClick"
          @pause="pauseTimer"
          @resume="resumeTimer"
        />

        <h2 class="section-title blue-title">ДРУГИЕ ВЫЖИВШИЕ</h2>
        <OthersGrid
          :players="others"
          :active-player-id="activePlayerId"
          :card-order="cardOrder"
          :card-labels="cardLabels"
          :get-card-text="getCardText"
        />

        <EventLog :logs="room.logs || []" />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.loading-screen { display:flex; align-items:center; justify-content:center; height:100vh; background:#050505; }
.pulse-text { color:var(--color-accent); font-family:'Russo One',sans-serif; letter-spacing:3px; animation:pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.game-wrapper  { max-width:96vw; margin:0 auto; padding:1.5rem; min-height:100vh; }
.game-board    { display:grid; grid-template-columns:300px 1fr; gap:3rem; align-items:start; }
.spectator-dim { opacity:0.4; pointer-events:none; }

.section-title { font-size:1.1rem; text-transform:uppercase; letter-spacing:1.5px; border-bottom:2px solid var(--color-border); padding-bottom:0.6rem; margin-bottom:1.25rem; }
.blue-title    { color:#60a5fa; }

@media (max-width: 900px) {
  .game-wrapper { padding: 1rem 0.75rem; max-width: 100vw; }
  .game-board   { grid-template-columns: 1fr; gap: 1.5rem; }
}

@media (max-width: 600px) {
  .game-wrapper  { padding: 0.75rem 0.5rem; }
  .section-title { font-size: 0.95rem; margin-bottom: 1rem; letter-spacing: 1px; }
}
</style>
