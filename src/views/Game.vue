<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  doc, collection, onSnapshot, updateDoc, writeBatch, arrayUnion, Timestamp
} from 'firebase/firestore'
import {
  catastrophes, professions, healths, phobias,
  inventories, largeInventories, facts, biology,
  hobbies, specialCards, shuffleArray, getRandomItem
} from '../gameData'

import Button from 'primevue/button'
import Tag    from 'primevue/tag'
import Panel  from 'primevue/panel'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
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
let timerInterval = null

const syncTimer = () => {
  if (!room.value?.timerDuration) { timerSeconds.value = 0; return }
  if (room.value?.timerPaused)    { return }
  const end = room.value?.turnEndTime?.toMillis?.()
  if (!end) { timerSeconds.value = room.value.timerDuration; return }
  timerSeconds.value = Math.max(0, Math.ceil((end - Date.now()) / 1000))
  if (timerSeconds.value === 0 && me.value?.isHost && room.value?.status === 'playing' && activePlayerId.value) {
    passTurn({ force: true, reason: 'timeout' })
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
  unsubRoom = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (!snap.exists()) return router.push({ name: 'home' })
    room.value = snap.data()
  })
  unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (snap) => {
    players.value = snap.docs.map(d => d.data())
  })
}

onUnmounted(() => {
  clearInterval(timerInterval)
  clearTimeout(kickAnimTimer)
  unsubRoom?.()
  unsubPlayers?.()
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

// ─── Установить таймер для нового хода ──────────────────────────
const setTurnTimer = async () => {
  const dur = room.value?.timerDuration
  if (!dur || dur === 0) return
  await updateDoc(doc(db, 'rooms', roomId), {
    turnEndTime: Timestamp.fromDate(new Date(Date.now() + dur * 1000)),
    timerPaused: false,
  })
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
    })
    await setTurnTimer()
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
    await updateDoc(doc(db, 'rooms', roomId), { activePlayerId: next.uid })
    await setTurnTimer()
  }
}

const requestTurnSkip = async () => {
  if (!isMyTurn.value) return
  await updateDoc(doc(db, 'rooms', roomId, 'players', myUid.value), {
    turnSkipRequestAt: Timestamp.now(),
  })
  toast.add({ severity: 'info', summary: '⏭️ Запрос отправлен', detail: 'Хост завершит ваш ход', life: 1800 })
}

const onPassTurnClick = async () => {
  if (isMyTurn.value && !me.value?.isHost) {
    await requestTurnSkip()
    return
  }
  await passTurn()
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

// Авто-пропуск заглушённого + установка таймера
watch(activePlayerId, async (newId) => {
  if (!me.value?.isHost || !newId) return

  // Устанавливаем таймер (если не конец раунда)
  if (room.value?.status === 'playing') await setTurnTimer()

  // Пропуск заглушённых
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
    await updateDoc(doc(db, 'rooms', roomId), { activePlayerId: next.uid })
    await setTurnTimer()
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
    status: 'playing', votes: {}, activePlayerId: sorted[0]?.uid || null,
  })
  await batch.commit()
  await setTurnTimer()
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
  })
  await batch.commit()
  await setTurnTimer()
}
</script>

<template>
  <!-- Загрузка -->
  <div v-if="isAuthLoading || !room || !me || !me.cards" class="loading-screen">
    <h2 class="pulse-text">⚡ ПОДКЛЮЧЕНИЕ К БУНКЕРУ...</h2>
  </div>

  <div v-else class="game-wrapper">

    <!-- ══ Частицы ══ -->
    <Teleport to="body">
      <div v-if="showParticles" class="particles-root" aria-hidden="true">
        <span
          v-for="(p, i) in particleItems"
          :key="i"
          class="particle"
          :style="{
            left: particleOrigin.x + 'px',
            top:  particleOrigin.y + 'px',
            width:  p.size + 'px',
            height: p.size + 'px',
            background: p.color,
            '--tx': p.tx + 'px',
            '--ty': p.ty + 'px',
            animationDuration: p.dur + 's',
            animationDelay: p.delay + 's',
          }"
        />
      </div>
    </Teleport>

    <!-- ══ Анимация кика ══ -->
    <Teleport to="body">
      <Transition name="kick">
        <div v-if="showKickAnim" class="kick-overlay">
          <div class="kick-content">
            <div class="kick-icon">{{ kickAnimIsSelf ? '😱' : '🚪' }}</div>
            <h2 class="kick-name">{{ kickAnimName }}</h2>
            <p class="kick-label">{{ kickAnimIsSelf ? 'ВЫ ИЗГНАНЫ' : 'ИЗГНАН ИЗ БУНКЕРА' }}</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ══ Оверлей смерти (ты умер) ══ -->
    <div
      v-if="me.isAlive === false && !isSpectatorMode && room.status !== 'finished'"
      class="death-overlay"
    >
      <div class="death-content">
        <div class="death-icon">💀</div>
        <h2 class="death-title">ВЫ ИЗГНАНЫ</h2>
        <p class="death-sub">Бункер закрылся перед вашим носом</p>
        <Button label="НАБЛЮДАТЬ ЗА ИГРОЙ" severity="danger" outlined class="mt-btn"
          icon="pi pi-eye" @click="isSpectatorMode = true" />
      </div>
    </div>

    <!-- ══ Диалог: игра окончена ══ -->
    <Dialog :visible="room.status === 'finished'" modal header="☢️ ИГРА ОКОНЧЕНА" :closable="false">
      <div class="text-center end-dialog-body">
        <h2 class="end-title">БУНКЕР ЗАКРЫТ</h2>
        <p class="end-sub">В бункер прошли:</p>
        <div class="survivors-wrap">
          <Tag v-for="p in players.filter(x => x.isAlive !== false)" :key="p.uid"
            :value="p.name" severity="success" class="survivor-tag" />
        </div>
        <Button v-if="me.isHost" label="СЫГРАТЬ ЕЩЕ РАЗ" severity="danger" size="large"
          class="w-full" icon="pi pi-refresh" @click="restartGame" />
      </div>
    </Dialog>

    <!-- ══ Диалог: голосование ══ -->
    <Dialog :visible="isVoting" modal header="🗳️ ГОЛОСОВАНИЕ" :closable="false">
      <div v-if="me.isAlive === false" class="text-center muted-msg">Вы мертвы — наблюдайте</div>
      <div v-else-if="me.isMuted"      class="text-center muted-msg">🤐 Вы заглушены — не можете голосовать</div>
      <div v-else-if="me.hasNoVote"    class="text-center muted-msg">🤬 Ваш голос не учитывается (Дота-рейдж)</div>
      <div v-else-if="!myVote" class="vote-panel">
        <p class="vote-hint">Кого НЕ возьмёте в бункер?</p>
        <Button
          v-for="p in alivePlayers.filter(x => x.uid !== myUid)"
          :key="p.uid"
          :label="p.name + (p.hasImmunity ? ' 🛡️' : '')"
          severity="danger" outlined class="w-full vote-btn"
          @click="voteFor(p.uid)"
        />
        <div class="vote-divider" />
        <Button label="ВОЗДЕРЖАТЬСЯ" severity="secondary" class="w-full" @click="voteFor('skip_vote')" />
        <p class="vote-tally">
          Проголосовали: {{ Object.keys(room.votes || {}).length }} / {{ alivePlayers.length }}
        </p>
      </div>
      <div v-else class="text-center voted-msg">✅ Голос принят. Ожидаем остальных…</div>
    </Dialog>

    <!-- ══ Диалог: выбор цели для спецкарты ══ -->
    <Dialog v-model:visible="showSpecialDialog" modal
      :header="'⚡ ' + getCardText(selectedSpecialCard?.data.value)">
      <p class="spec-hint">Выберите цель:</p>
      <template v-if="['revive','necromancy_fail'].includes(selectedSpecialCard?.data.value.id)">
        <Button v-for="p in deadPlayers" :key="p.uid" :label="p.name"
          severity="success" outlined class="w-full spec-btn" @click="applySpecialCard(p.uid)" />
        <p v-if="!deadPlayers.length" class="spec-empty">Нет изгнанных игроков</p>
      </template>
      <template v-else>
        <Button
          v-for="p in alivePlayers.filter(x => x.uid !== myUid)"
          :key="p.uid"
          :label="p.name + (p.specialShield ? ' 💊' : '')"
          severity="warning" outlined class="w-full spec-btn"
          @click="applySpecialCard(p.uid)"
        />
      </template>
      <Button label="Отмена" severity="secondary" text class="w-full mt-2"
        @click="showSpecialDialog = false; selectedSpecialCard = null" />
    </Dialog>

    <!-- ══ Диалог: тайный просмотр (check_card) ══ -->
    <Dialog v-model:visible="peekDialog" modal header="👁️ Секретный просмотр">
      <div class="peek-body">
        <p class="peek-player">Карта игрока <strong>{{ peekInfo.playerName }}</strong></p>
        <div class="peek-card">
          <span class="card-label">{{ peekInfo.label }}</span>
          <span class="card-value" style="font-size:1rem; margin-top:0.5rem">{{ peekInfo.value }}</span>
        </div>
        <p class="peek-note">Только ты видишь эту карту. Она остаётся скрытой для всех.</p>
        <Button label="Понял, закрыть" severity="success" class="w-full" style="margin-top:1rem" @click="peekDialog = false" />
      </div>
    </Dialog>

    <!-- ══ ИГРОВОЕ ПОЛЕ ══ -->
    <div class="game-board" :class="{ 'spectator-dim': me.isAlive === false && !isSpectatorMode }">

      <!-- Левая панель: Моё досьё -->
      <aside class="left-sidebar">
        <h2 class="section-title red-title">МОЁ ДОСЬЁ</h2>
        <div v-if="me.isAlive === false" class="dead-badge">💀 ВЫ МЕРТВЫ</div>

        <!-- Статусы -->
        <div v-if="me.hasImmunity || me.hasDoubleVote || me.specialShield || me.specialBlocked || me.hasNoVote || me.isMuted" class="status-badges">
          <Tag v-if="me.hasImmunity"    severity="success" value="🛡️ Иммунитет"    class="text-xs" />
          <Tag v-if="me.hasDoubleVote"  severity="warning" value="⚖️ ×2 голос"      class="text-xs" />
          <Tag v-if="me.specialShield"  severity="info"    value="💊 Щит"            class="text-xs" />
          <Tag v-if="me.specialBlocked" severity="danger"  value="🔪 Спец заблок."  class="text-xs" />
          <Tag v-if="me.hasNoVote"      severity="danger"  value="🤬 Нет голоса"    class="text-xs" />
          <Tag v-if="me.isMuted"        severity="danger"  value="🤐 Заглушён"      class="text-xs" />
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
            @click="revealCard(k, me.cards?.[k], $event)"
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

      <!-- Главная колонка -->
      <main class="main-column">

        <!-- Катастрофа -->
        <section class="catastrophe-block">
          <h1 class="catastrophe-name">{{ room.catastrophe?.name }}</h1>
          <p class="catastrophe-desc">{{ room.catastrophe?.description }}</p>
          <div class="bunker-stats">
            <Tag severity="warning" :value="`ВМЕСТИМОСТЬ: ${room.bunkerSize || 2}`" class="stat-tag" />
            <Tag severity="info"    :value="`ЖИВЫХ: ${alivePlayersCount}`"           class="stat-tag" />
          </div>
        </section>

        <!-- Индикатор хода + таймер -->
        <div class="turn-indicator" :class="isMyTurn ? 'turn-mine' : 'turn-wait'">
          <div class="turn-header">
            <p class="turn-text" :class="isMyTurn ? 'green-text' : 'muted-text'">
              {{ !activePlayerId ? '⏸ Ожидание старта…' : isMyTurn ? '🚨 ВАШ ХОД!' : `⏳ Ходит: ${activePlayerName}` }}
            </p>

            <!-- Таймер -->
            <div v-if="room.timerDuration > 0 && activePlayerId" class="timer-wrap">
              <div
                class="timer-circle"
                :class="{
                  'timer-warn':   timerWarning,
                  'timer-paused': room.timerPaused
                }"
              >
                <svg viewBox="0 0 44 44" class="timer-svg">
                  <circle cx="22" cy="22" r="18" class="timer-track" />
                  <circle
                    cx="22" cy="22" r="18"
                    class="timer-progress"
                    :class="{ 'timer-progress-warn': timerWarning }"
                    :style="{
                      strokeDashoffset: 113 - (113 * Math.min(timerSeconds, room.timerDuration)) / room.timerDuration
                    }"
                  />
                </svg>
                <span class="timer-num" :class="{ 'timer-num-warn': timerWarning }">
                  {{ room.timerPaused ? '⏸' : timerSeconds }}
                </span>
              </div>
              <!-- Пауза/возобновление для хоста -->
              <button
                v-if="me.isHost"
                class="timer-pause-btn"
                :title="room.timerPaused ? 'Возобновить таймер' : 'Пауза таймера'"
                @click="room.timerPaused ? resumeTimer() : pauseTimer()"
              >
                {{ room.timerPaused ? '▶' : '⏸' }}
              </button>
            </div>
          </div>

          <div class="turn-actions">
            <Button v-if="me.isHost && !activePlayerId" label="Начать игру" severity="warning" size="large" icon="pi pi-play" @click="startFirstTurn" />
            <Button
              v-if="canPassTurn"
              :label="isMyTurn ? 'Завершить ход' : 'Пропустить ход игрока'"
              severity="success"
              icon="pi pi-check"
              size="large"
              @click="onPassTurnClick"
            />
          </div>
        </div>

        <!-- Другие игроки -->
        <h2 class="section-title blue-title">ДРУГИЕ ВЫЖИВШИЕ</h2>
        <div class="others-grid">
          <Panel
            v-for="p in others"
            :key="p.uid"
            :header="p.name + (p.isMuted ? ' 🤐' : '') + (p.hasImmunity ? ' 🛡️' : '') + (p.specialShield ? ' 💊' : '') + (p.hasNoVote ? ' 🤬' : '')"
            toggleable class="player-panel"
            :class="{ 'panel-dead': p.isAlive === false, 'panel-active': p.uid === activePlayerId }"
          >
            <template #icons>
              <Tag v-if="p.isAlive === false"          severity="danger"  value="МЁРТВ"   class="mr-2" />
              <Tag v-else-if="p.uid === activePlayerId" severity="success" value="ЕГО ХОД" class="mr-2" />
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

        <!-- Лог -->
        <details v-if="room.logs?.length" class="logs-panel">
          <summary>📋 Журнал событий ({{ room.logs.length }})</summary>
          <ul class="logs-list">
            <li v-for="(entry, i) in [...(room.logs || [])].reverse()" :key="i">{{ entry }}</li>
          </ul>
        </details>

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

/* ── Частицы ── */
.particles-root { position:fixed; inset:0; pointer-events:none; z-index:10000; overflow:visible; }
.particle {
  position:absolute;
  border-radius:50%;
  transform:translate(-50%,-50%);
  animation:particle-fly var(--dur, 0.8s) ease-out forwards;
  will-change:transform,opacity;
}
@keyframes particle-fly {
  0%   { transform: translate(-50%,-50%) scale(1); opacity:1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity:0; }
}

/* ── Анимация кика ── */
.kick-overlay {
  position:fixed; inset:0; z-index:9990;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.85); backdrop-filter:blur(8px);
  pointer-events:none;
}
.kick-content { text-align:center; }
.kick-icon    { font-size:6rem; animation:kick-bounce 0.4s ease; }
.kick-name    { font-family:'Russo One',sans-serif; font-size:3rem; color:var(--color-accent); letter-spacing:3px; margin:0.5rem 0; }
.kick-label   { color:var(--color-muted); font-size:1.1rem; letter-spacing:4px; text-transform:uppercase; }
@keyframes kick-bounce { 0%{transform:scale(0.3)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
.kick-enter-active { animation: kick-enter 0.35s ease; }
.kick-leave-active { animation: kick-leave 0.4s ease forwards; }
@keyframes kick-enter { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }
@keyframes kick-leave { from { opacity:1; } to { opacity:0; transform:scale(1.1); } }

/* ── Смерть ── */
.death-overlay {
  position:fixed; inset:0; background:rgba(5,0,0,0.96); z-index:9999;
  display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);
}
.death-content { text-align:center; border:2px solid var(--color-accent); padding:3.5rem; border-radius:var(--radius-lg); background:rgba(0,0,0,0.8); box-shadow:0 0 80px rgba(229,62,62,0.2); }
.death-icon    { font-size:5rem; margin-bottom:0.75rem; }
.death-title   { font-size:2.5rem; color:var(--color-accent); letter-spacing:4px; margin-bottom:0.5rem; }
.death-sub     { color:var(--color-muted); margin-bottom:1.5rem; }
.mt-btn        { margin-top:1rem; }

/* ── Диалоги ── */
.end-dialog-body { padding:1rem; }
.end-title       { font-size:2rem; color:var(--color-success); margin-bottom:0.5rem; }
.end-sub         { color:var(--color-muted); margin-bottom:1.5rem; }
.survivors-wrap  { display:flex; flex-wrap:wrap; justify-content:center; gap:0.5rem; margin-bottom:2rem; }
.survivor-tag    { font-size:1.1rem; padding:0.5rem 1rem; }

.vote-panel   { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem; }
.vote-hint    { color:var(--color-muted); text-align:center; margin-bottom:0.25rem; }
.vote-btn     { margin-bottom:0; }
.vote-divider { height:1px; background:var(--color-border); margin:0.5rem 0; }
.vote-tally   { text-align:center; color:var(--color-muted); font-size:0.8rem; margin-top:0.5rem; }
.voted-msg    { color:var(--color-success); font-weight:700; padding:1.5rem; font-size:1.1rem; }
.muted-msg    { color:var(--color-muted); padding:1rem; text-align:center; }

.spec-hint  { color:var(--color-muted); text-align:center; margin-bottom:0.75rem; }
.spec-btn   { margin-bottom:0.5rem; }
.spec-empty { color:#555; text-align:center; font-style:italic; }
.mt-2       { margin-top:0.5rem; }

.peek-body   { padding:0.5rem; }
.peek-player { color:var(--color-muted); margin-bottom:0.75rem; text-align:center; }
.peek-card   { background:var(--color-surface-2); border:1px solid var(--color-accent); border-radius:var(--radius-md); padding:1.25rem; display:flex; flex-direction:column; gap:0.5rem; }
.peek-note   { color:#555; font-size:0.75rem; text-align:center; margin-top:0.75rem; }

/* ── Левая панель ── */
.left-sidebar  { position:sticky; top:1.5rem; }
.section-title { font-size:1.1rem; text-transform:uppercase; letter-spacing:1.5px; border-bottom:2px solid var(--color-border); padding-bottom:0.6rem; margin-bottom:1.25rem; }
.red-title     { color:#f87171; }
.blue-title    { color:#60a5fa; }
.dead-badge    { text-align:center; background:rgba(229,62,62,0.15); border:1px solid var(--color-accent); border-radius:var(--radius-sm); padding:0.4rem; color:var(--color-accent); font-size:0.85rem; font-weight:700; margin-bottom:1rem; }
.status-badges { display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.75rem; }
.cards-grid    { display:flex; flex-direction:column; gap:0.6rem; }

/* Flip cards */
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

/* ── Главная колонка ── */
.catastrophe-block { text-align:center; margin-bottom:2rem; }
.catastrophe-name  { font-size:clamp(1.8rem,4vw,2.8rem); color:var(--color-accent); text-shadow:0 0 25px rgba(229,62,62,0.35); margin-bottom:0.5rem; }
.catastrophe-desc  { color:#9ca3af; max-width:600px; margin:0 auto 1.5rem; }
.bunker-stats      { display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap; }
.stat-tag          { font-size:1rem; }

/* Таймер */
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
.timer-circle.timer-warn .timer-circle { animation:timer-pulse 0.6s ease-in-out infinite; }
.timer-circle.timer-paused .timer-progress { stroke:#f59e0b; }
.timer-num        { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; color:#e5e7eb; }
.timer-num-warn   { color:#f87171; }
@keyframes timer-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
.timer-pause-btn {
  background:none; border:1px solid var(--color-border); border-radius:50%;
  width:28px; height:28px; cursor:pointer; color:var(--color-muted);
  font-size:0.7rem; display:flex; align-items:center; justify-content:center;
  transition:all 0.2s;
}
.timer-pause-btn:hover { border-color:var(--color-warn); color:var(--color-warn); }

/* ── Другие игроки ── */
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

/* ── Лог ── */
.logs-panel  { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:0.75rem 1rem; }
.logs-panel summary { cursor:pointer; color:var(--color-muted); font-size:0.9rem; }
.logs-list   { list-style:none; padding:0; margin-top:0.75rem; max-height:200px; overflow-y:auto; }
.logs-list li { color:#666; font-size:0.78rem; padding:0.3rem 0; border-bottom:1px solid #1a1a1a; }
.logs-list li:last-child { border-bottom:none; }

/* ── Утилиты ── */
.mr-2        { margin-right:0.5rem; }
.text-xs     { font-size:0.72rem; }
.w-full      { width:100%; }
.text-center { text-align:center; }

@media (max-width:900px) {
  .game-board   { grid-template-columns:1fr; gap:2rem; }
  .left-sidebar { position:static; }
  .bunker-stats { flex-direction:column; align-items:center; }
  .player-panel { width:100%; }
}
</style>
