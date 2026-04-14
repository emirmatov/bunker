<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, collection, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'
import { catastrophes, professions, healths, phobias, inventories, largeInventories, facts, biology, hobbies, specialCards, shuffleArray, getRandomItem } from '../gameData'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Panel from 'primevue/panel'
import Dialog from 'primevue/dialog'

const route = useRoute()
const router = useRouter()
const roomId = route.params.id

const room = ref(null)
const players = ref([])
const myUid = ref(null)
const isAuthLoading = ref(true)
const isSpectatorMode = ref(false) // Для наблюдения после смерти

// === ИНИЦИАЛИЗАЦИЯ ===
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      myUid.value = user.uid
      initRoomListener()
    } else {
      router.push('/')
    }
    isAuthLoading.value = false
  })
})

function initRoomListener() {
  unsubRoom = onSnapshot(doc(db, "rooms", roomId), (doc) => {
    if (!doc.exists()) return router.push('/')
    room.value = doc.data()
  })
  unsubPlayers = onSnapshot(collection(db, "rooms", roomId, "players"), (snap) => {
    players.value = snap.docs.map(d => d.data())
  })
}

const me = computed(() => players.value.find(p => p.uid === myUid.value))
const others = computed(() => players.value.filter(p => p.uid !== myUid.value))
const alivePlayers = computed(() => players.value.filter(p => p.isAlive !== false))
const alivePlayersCount = computed(() => alivePlayers.value.length)

const isVoting = computed(() => room.value?.status === 'voting')
const myVote = computed(() => room.value?.votes?.[myUid.value])
const activePlayerId = computed(() => room.value?.activePlayerId)
const isMyTurn = computed(() => activePlayerId.value === myUid.value)
const activePlayerName = computed(() => players.value.find(p => p.uid === activePlayerId.value)?.name || 'Никто')

const cardLabels = {
  profession: "💼 Профессия", biology: "🧬 Биология", health: "❤️ Здоровье", hobby: "🎨 Хобби",
  inventory: "🎒 Багаж", largeInventory: "📦 Крупный багаж", fact1: "📜 Факт 1", fact2: "📜 Факт 2",
  phobia: "😱 Фобия", special1: "⚡ Спец. действие 1", special2: "⚡ Спец. действие 2"
}
const cardOrder = ["profession", "biology", "health", "hobby", "inventory", "largeInventory", "fact1", "fact2", "phobia", "special1", "special2"]

const getCardText = (v) => (typeof v === 'object' && v !== null) ? v.text : v

let unsubRoom = null, unsubPlayers = null
onUnmounted(() => { if (unsubRoom) unsubRoom(); if (unsubPlayers) unsubPlayers() })

// === ХОДЫ И ГОЛОСОВАНИЕ ===
const startFirstTurn = async () => {
  if (!me.value?.isHost) return

  const batch = writeBatch(db)

  // Если все помечены как мертвые — принудительно воскрешаем всех для старта
  if (alivePlayersCount.value === 0) {
    players.value.forEach(p => {
      batch.update(doc(db, "rooms", roomId, "players", p.uid), { isAlive: true })
    })
    await batch.commit()
  }

  // Сортируем живых и даем ход первому
  const currentAlive = players.value.filter(p => p.isAlive !== false).sort((a,b) => a.uid.localeCompare(b.uid))

  if (currentAlive.length > 0) {
    await updateDoc(doc(db, "rooms", roomId), {
      activePlayerId: currentAlive[0].uid,
      status: 'playing'
    })
  }
}

const passTurn = async () => {
  if (!isMyTurn.value) return
  const sorted = [...alivePlayers.value].sort((a, b) => a.uid.localeCompare(b.uid))
  const idx = sorted.findIndex(p => p.uid === myUid.value)

  if (idx === sorted.length - 1) {
    // Насильное голосование по окончании круга
    await updateDoc(doc(db, "rooms", roomId), { status: 'voting', votes: {} })
  } else {
    const next = sorted[idx + 1]
    await updateDoc(doc(db, "rooms", roomId), { activePlayerId: next.uid })
  }
}


const kickPlayer = async (targetUid) => {
  if (targetUid === 'skip_vote') return // Пропуск голосования

  const p = players.value.find(x => x.uid === targetUid)
  const newCards = { ...p.cards }
  // ПОЛНОЕ ВСКРЫТИЕ ИГРОКА ПРИ ВЫЛЕТЕ
  Object.keys(newCards).forEach(k => newCards[k].isRevealed = true)

  await updateDoc(doc(db, "rooms", roomId, "players", targetUid), { isAlive: false, cards: newCards })
}

// Блокируем возможность голосовать, если игрок мертв
const voteFor = async (targetUid) => {
  if (myVote.value || me.value?.isAlive === false) return

  try {
    await updateDoc(doc(db, "rooms", roomId), { [`votes.${myUid.value}`]: targetUid })
  } catch (e) { console.error(e) }
}
// Глобальная проверка завершения игры
watch(alivePlayersCount, async (newCount) => {
  // Проверяем только если мы Хост, игра идет и количество игроков изменилось
  if (!me.value?.isHost || room.value?.status !== 'playing') return;

  const maxSeats = room.value?.bunkerSize || 2;

  if (newCount <= maxSeats && newCount > 0) {
    await updateDoc(doc(db, "rooms", roomId), {
      status: 'finished'
    });
    // Логируем финальное событие
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    await updateDoc(doc(db, "rooms", roomId), {
      logs: arrayUnion(`[${time}] 🚪 Бункер закрыт! Мест больше нет.`)
    });
  }
});
// В watch за голосами добавляем учет иммунитета
watch(() => room.value?.votes, async (newVotes) => {
  if (!me.value?.isHost || room.value?.status !== 'voting' || !newVotes) return

  // Ждем только голоса живых
  if (Object.keys(newVotes).length >= alivePlayersCount.value) {
    const tally = {}
    Object.values(newVotes).forEach(uid => tally[uid] = (tally[uid] || 0) + 1)

    let maxVotes = 0
    let kickedUid = null

    Object.entries(tally).forEach(([uid, count]) => {
      const target = players.value.find(p => p.uid === uid)
      // Если это не скип и у игрока нет иммунитета
      if (count > maxVotes && uid !== 'skip_vote' && !target?.hasImmunity) {
        maxVotes = count
        kickedUid = uid
      }
    })

    if (kickedUid) await kickPlayer(kickedUid)

    // Сброс временных эффектов (иммунитет, двойной голос)
    const batch = writeBatch(db)
    players.value.forEach(p => {
      if (p.hasImmunity || p.hasDoubleVote || p.isMuted) {
        batch.update(doc(db, "rooms", roomId, "players", p.uid), {
          hasImmunity: false, hasDoubleVote: false, isMuted: false
        })
      }
    })

    const sorted = players.value.filter(p => p.isAlive !== false).sort((a, b) => a.uid.localeCompare(b.uid))
    batch.update(doc(db, "rooms", roomId), {
      status: 'playing',
      votes: {},
      activePlayerId: sorted[0]?.uid || null
    })
    await batch.commit()
  }
}, { deep: true })

// === СПЕЦ-КАРТЫ И ВСКРЫТИЕ ===
const showSpecialDialog = ref(false)
const selectedSpecialCard = ref(null)

const playSound = (soundName) => {
  const audio = new Audio(`/${soundName}.mp3`)
  audio.play().catch(e => {})
}

const revealCard = async (key, data) => {
  if (data.isRevealed || me.value?.isAlive === false || !isMyTurn.value) return
  if (key.startsWith('special')) {
    selectedSpecialCard.value = { key, data }; showSpecialDialog.value = true
  } else {
    playSound('flip')
    await updateDoc(doc(db, "rooms", roomId, "players", myUid.value), { [`cards.${key}.isRevealed`]: true })
  }
}

// === ПОЛНАЯ ЛОГИКА ВСЕХ СПЕЦ-КАРТ ===
// === ПОЛНАЯ РЕАЛИЗАЦИЯ ВСЕХ СПЕЦ-КАРТ ===
const applySpecialCard = async (targetUid) => {
  showSpecialDialog.value = false
  playSound('flip')
  const target = players.value.find(p => p.uid === targetUid)
  const cardId = selectedSpecialCard.value.data.value.id
  const batch = writeBatch(db)

  try {
    // 1. Убийство: вскрываем всё и ставим статус смерти
    if (cardId === 'kill') {
      const targetCards = { ...target.cards }
      Object.keys(targetCards).forEach(k => targetCards[k].isRevealed = true)
      batch.update(doc(db, "rooms", roomId, "players", targetUid), {
        isAlive: false,
        cards: targetCards
      })
    }
    // 2. Воскрешение
    else if (cardId === 'revive') {
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { isAlive: true })
    }
    // 3. Кража багажа (обычный + крупный)
    else if (cardId === 'steal_luggage') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), {
        'cards.inventory': target.cards.inventory,
        'cards.largeInventory': target.cards.largeInventory
      })
      batch.update(doc(db, "rooms", roomId, "players", targetUid), {
        'cards.inventory': me.value.cards.inventory,
        'cards.largeInventory': me.value.cards.largeInventory
      })
    }
    // 4. Обмен здоровьем
    else if (cardId === 'swap_health') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), { 'cards.health': target.cards.health })
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { 'cards.health': me.value.cards.health })
    }
    // 5. Обмен ролями (профессиями)
    else if (cardId === 'swap_role') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), { 'cards.profession': target.cards.profession })
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { 'cards.profession': me.value.cards.profession })
    }
    // 6. Обмен фобиями
    else if (cardId === 'swap_phobia') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), { 'cards.phobia': target.cards.phobia })
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { 'cards.phobia': me.value.cards.phobia })
    }
    // 7. Иммунитет и Щит изгнания
    else if (cardId === 'immunity' || cardId === 'exile_shield') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), { hasImmunity: true })
    }
    // 8. Глас народа (вскрыть здоровье всем)
    else if (cardId === 'force_reveal') {
      players.value.forEach(p => {
        batch.update(doc(db, "rooms", roomId, "players", p.uid), { 'cards.health.isRevealed': true })
      })
    }
    // 9. Подглядеть (вскрыть случайную карту у цели)
    else if (cardId === 'check_card') {
      const hidden = cardOrder.filter(k => !target.cards[k].isRevealed)
      if (hidden.length > 0) {
        const randomKey = hidden[Math.floor(Math.random() * hidden.length)]
        batch.update(doc(db, "rooms", roomId, "players", targetUid), { [`cards.${randomKey}.isRevealed`]: true })
      }
    }
    // 10. Двойной голос
    else if (cardId === 'double_vote') {
      batch.update(doc(db, "rooms", roomId, "players", myUid.value), { hasDoubleVote: true })
    }
    // 11. Отравление (пропуск хода) или Кляп
    else if (cardId === 'bad_food' || cardId === 'mute') {
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { isMuted: true })
    }
    // 12. Вскрыть профессию
    else if (cardId === 'reveal_prof') {
      batch.update(doc(db, "rooms", roomId, "players", targetUid), { 'cards.profession.isRevealed': true })
    }

    // Вскрываем саму использованную спецкарту
    batch.update(doc(db, "rooms", roomId, "players", myUid.value), { [`cards.${selectedSpecialCard.value.key}.isRevealed`]: true })

    await batch.commit()
  } catch(e) { console.error(e) }
}

// === РЕСТАРТ ===
const restartGame = async () => {
  if (!me.value?.isHost) return
  const batch = writeBatch(db)

  const deckProfessions = shuffleArray(professions)
  const deckBiology = shuffleArray(biology)
  const deckHealths = shuffleArray(healths)
  const deckHobbies = shuffleArray(hobbies)
  const deckInventories = shuffleArray(inventories)
  const deckLargeInventories = shuffleArray(largeInventories)
  const deckPhobias = shuffleArray(phobias)
  const deckFacts = shuffleArray(facts)
  const deckSpecials = shuffleArray(specialCards)

  let factIndex = 0
  let specialIndex = 0

  for (let i = 0; i < players.value.length; i++) {
    const p = players.value[i]
    const newCards = {
      profession: { value: deckProfessions[i], isRevealed: false },
      biology: { value: deckBiology[i], isRevealed: false },
      health: { value: deckHealths[i], isRevealed: false },
      hobby: { value: deckHobbies[i], isRevealed: false },
      inventory: { value: deckInventories[i], isRevealed: false },
      largeInventory: { value: deckLargeInventories[i], isRevealed: false },
      phobia: { value: deckPhobias[i], isRevealed: false },
      fact1: { value: deckFacts[factIndex++], isRevealed: false },
      fact2: { value: deckFacts[factIndex++], isRevealed: false },
      special1: { value: deckSpecials[specialIndex++], isRevealed: false },
      special2: { value: deckSpecials[specialIndex++], isRevealed: false }
    }
    batch.update(doc(db, "rooms", roomId, "players", p.uid), { isAlive: true, cards: newCards })
  }

  const sorted = [...players.value].sort((a,b) => a.uid.localeCompare(b.uid))
  batch.update(doc(db, "rooms", roomId), {
    status: 'playing',
    votes: {},
    logs: [`[СИСТЕМА] Хост перезапустил игру!`],
    catastrophe: getRandomItem(catastrophes),
    activePlayerId: sorted[0].uid
  })

  await batch.commit()
}
</script>

<template>
  <div v-if="isAuthLoading || !room || !me" class="loading-screen">
    <h2 class="animate-pulse text-red-500 font-bold tracking-widest">ПОДКЛЮЧЕНИЕ К БУНКЕРУ...</h2>
  </div>

  <div v-else class="game-wrapper">
    <div v-if="me.isAlive === false && !isSpectatorMode && room.status !== 'finished'" class="death-overlay">
      <div class="death-content">
        <h1 class="text-6xl mb-4">💀</h1>
        <h2 class="text-4xl font-black text-red-500 tracking-widest uppercase">ВЫ ИЗГНАНЫ</h2>
        <Button label="НАБЛЮДАТЬ ЗА ИГРОЙ" class="mt-6 p-button-outlined p-button-danger" @click="isSpectatorMode = true" />
      </div>
    </div>

    <Dialog :visible="room.status === 'finished'" modal header="ИГРА ОКОНЧЕНА" :closable="false" class="w-full max-w-lg">
      <div class="text-center p-4">
        <h1 class="text-4xl font-bold text-green-500 mb-6 uppercase">БУНКЕР ЗАКРЫТ</h1>
        <div class="flex flex-wrap justify-center gap-2 mb-8">
          <Tag v-for="p in players.filter(x => x.isAlive !== false)" :key="p.uid" :value="p.name" severity="success" class="text-xl py-2 px-4" />
        </div>
        <Button v-if="me.isHost" label="СЫГРАТЬ ЕЩЕ РАЗ" severity="danger" size="large" class="w-full" @click="restartGame" />
      </div>
    </Dialog>

    <Dialog :visible="isVoting" modal header="ВРЕМЯ ГОЛОСОВАНИЯ" :closable="false" class="w-full max-w-sm">
      <div v-if="!myVote" class="p-2">
        <p class="mb-6 text-center text-gray-300">Кого вы не возьмете в бункер?</p>
        <Button v-for="p in alivePlayers" :key="p.uid" :label="p.name" severity="danger" outlined class="w-full mb-3" @click="voteFor(p.uid)" />
        <div class="border-t border-gray-700 my-4"></div>
        <Button label="ПРОПУСТИТЬ ГОЛОСОВАНИЕ" severity="secondary" class="w-full" @click="voteFor('skip_vote')" />
      </div>
      <div v-else class="text-center p-6 text-green-400 font-bold text-xl animate-pulse">Голос принят. Ожидаем остальных...</div>
    </Dialog>

    <Dialog v-model:visible="showSpecialDialog" modal header="Применение Спец-Карты" class="w-full max-w-sm">
      <p class="mb-6 text-yellow-400 italic text-center font-bold">"{{ getCardText(selectedSpecialCard?.data.value) }}"</p>
      <template v-if="selectedSpecialCard?.data.value.id === 'revive'">
        <Button v-for="p in players.filter(x => x.isAlive === false)" :key="p.uid" :label="p.name" severity="success" outlined class="w-full mb-2" @click="applySpecialCard(p.uid)" />
      </template>
      <template v-else>
        <Button v-for="p in alivePlayers" :key="p.uid" :label="p.name" severity="warning" outlined class="w-full mb-3" @click="applySpecialCard(p.uid)" />
      </template>
    </Dialog>

    <div class="game-board" :class="{ 'opacity-50 pointer-events-none': me.isAlive === false && !isSpectatorMode }">

      <div class="sidebar-column left-sidebar">
        <h2 class="section-title text-center text-red-400" style="margin-top: 0;">Мое досье</h2>
        <div v-if="me.isAlive === false" class="text-center mb-4 text-red-500 font-bold">ВЫ МЕРТВЫ (НАБЛЮДАТЕЛЬ)</div>
        <div class="cards-grid">
          <div v-for="k in cardOrder" :key="k" class="flip-container" :class="{'is-flipped': me.cards[k]?.isRevealed, 'is-locked': (!isMyTurn || me.isAlive === false) && !me.cards[k]?.isRevealed}" @click="revealCard(k, me.cards[k])">
            <div class="flip-inner">
              <div class="flip-front">
                <span class="card-label">{{ cardLabels[k] }}</span>
                <span class="card-value">{{ getCardText(me.cards[k].value) }}</span>
                <div class="mt-auto pt-2">
                  <Tag v-if="isMyTurn && me.isAlive !== false" severity="danger" value="Вскрыть" class="text-xs" />
                  <Tag v-else severity="secondary" value="🔒 Заблокировано" class="text-xs" />
                </div>
              </div>
              <div class="flip-back">
                <span class="card-label text-green-300">{{ cardLabels[k] }}</span>
                <span class="card-value text-white">{{ getCardText(me.cards[k].value) }}</span>
                <Tag severity="success" value="ВСКРЫТО" class="mt-auto text-xs" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="main-column right-sidebar">
        <div class="header-section mb-10 text-center">
          <h1 class="text-red-500 text-4xl font-black mb-3 drop-shadow-md uppercase">{{ room.catastrophe?.name }}</h1>
          <p class="max-w-2xl mx-auto text-gray-400 mb-6">{{ room.catastrophe?.description }}</p>

          <div class="bunker-stats flex justify-center gap-4 mb-8">
            <Tag severity="warning" class="text-lg px-4 py-2" :value="`ВМЕСТИМОСТЬ: ${room.bunkerSize || 2}`" />
            <Tag severity="info" class="text-lg px-4 py-2" :value="`ЖИВЫХ: ${alivePlayersCount}`" />
          </div>

          <div class="turn-indicator mx-auto" :class="isMyTurn && me.isAlive !== false ? 'my-turn-glow' : 'wait-turn'">
            <h2 class="text-xl font-bold mb-3" :class="isMyTurn && me.isAlive !== false ? 'text-green-400' : 'text-gray-400'">
              {{ !activePlayerId ? 'Ожидание старта...' : (isMyTurn && me.isAlive !== false ? '🚨 ВАШ ХОД!' : `⏳ Ходит: ${activePlayerName}`) }}
            </h2>
            <div class="flex justify-center gap-3">
                <Button v-if="me.isHost && !activePlayerId" label="Начать игру" severity="warning" size="large" @click="startFirstTurn" />
                <Button v-if="isMyTurn && me.isAlive !== false" label="Завершить ход" severity="success" icon="pi pi-check" size="large" @click="passTurn" />
            </div>
          </div>
        </div>

        <h2 class="section-title text-center text-blue-400">Другие выжившие</h2>
        <div class="others-grid">
          <Panel v-for="p in others" :key="p.uid" :header="p.name" toggleable class="player-panel" :class="{'is-dead-panel': p.isAlive === false, 'active-player-panel': p.uid === activePlayerId}">
            <template #icons v-if="p.isAlive === false"><Tag severity="danger" value="МЕРТВ" class="mr-2" /></template>
            <ul class="revealed-list">
              <li v-for="k in cardOrder" :key="k" class="info-row">
                <span class="info-label">{{ cardLabels[k] }}</span>
                <span v-if="p.cards[k].isRevealed" class="info-value">{{ getCardText(p.cards[k].value) }}</span>
                <span v-else class="info-hidden">Скрыто</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.loading-screen { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; }
.game-wrapper { max-width: 96vw; margin: 0 auto; padding: 1.5rem; min-height: 100vh; }
.game-board { display: grid; grid-template-columns: 300px 1fr; gap: 4rem; align-items: start; }
.section-title { font-size: 1.4rem; border-bottom: 2px solid #333; padding-bottom: 0.8rem; margin-bottom: 1.5rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }

.others-grid { display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start; }
.player-panel { width: 320px; flex-grow: 0; flex-shrink: 0; }

.cards-grid { display: flex; flex-direction: column; gap: 0.9rem; }
.flip-container { perspective: 1000px; height: 110px; width: 100%; }
.flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1); transform-style: preserve-3d; }
.flip-container.is-flipped .flip-inner { transform: rotateY(180deg); }

.flip-front, .flip-back { position: absolute; inset: 0; backface-visibility: hidden; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; border-radius: 8px; padding: 0.8rem; text-align: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
.flip-front { background: linear-gradient(145deg, #222, #111); border: 2px dashed #555; }
.flip-container:not(.is-locked) .flip-front:hover { border-color: #f44336; background: linear-gradient(145deg, #332020, #1a1a1a); transform: translateY(-2px); transition: all 0.2s; }
.flip-container.is-locked .flip-front { background: linear-gradient(145deg, #111, #080808); border: 2px solid #222; cursor: not-allowed; opacity: 0.7; }
.flip-back { background: linear-gradient(145deg, #1b5e20, #0a2e0a); transform: rotateY(180deg); border: 2px solid #4caf50; }

.card-label { font-size: 0.75rem; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
.card-value { font-weight: bold; font-size: 1.1rem; color: #fff; line-height: 1.2; margin-top: 4px; }

.active-player-panel { border-left: 4px solid #4caf50 !important; box-shadow: -4px 0 15px rgba(76, 175, 80, 0.1); }
.is-dead-panel { opacity: 0.5; filter: grayscale(100%); }

.revealed-list { list-style: none; padding: 0; margin: 0; }
.info-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding: 0.5rem 0; }
.info-row:last-child { border-bottom: none; }
.info-label { color: #888; font-size: 0.85rem; }
.info-value { color: #4caf50; font-weight: bold; text-align: right; max-width: 65%; font-size: 0.95rem; }
.info-hidden { color: #444; font-style: italic; font-size: 0.85rem; }

.death-overlay { position: fixed; inset: 0; background: rgba(10,0,0,0.95); z-index: 9999; display: flex; align-items: center; justify-content: center; text-align: center; backdrop-filter: blur(8px); }
.death-content { border: 2px solid #ff2a2a; padding: 4rem; border-radius: 16px; box-shadow: 0 0 60px rgba(255,0,0,0.2); background: rgba(0,0,0,0.8); }

.turn-indicator { padding: 1.5rem; border-radius: 12px; display: inline-block; min-width: 300px; transition: all 0.3s ease; border: 1px solid transparent; }
.my-turn-glow { background: rgba(76, 175, 80, 0.1); border-color: #4caf50; box-shadow: 0 0 20px rgba(76, 175, 80, 0.2), inset 0 0 10px rgba(76, 175, 80, 0.1); }
.wait-turn { background: #151515; border-color: #333; }

@media (max-width: 900px) {
  .game-board { grid-template-columns: 1fr; gap: 2rem;}
  .bunker-stats { flex-direction: column; align-items: center; }
}

.flex { display: flex; } .flex-wrap { flex-wrap: wrap; } .justify-center { justify-content: center; } .gap-2 { gap: 0.5rem; } .gap-3 { gap: 0.75rem; } .gap-4 { gap: 1rem; }
.mt-auto { margin-top: auto; } .pt-2 { padding-top: 0.5rem; } .mb-2 { margin-bottom: 0.5rem; } .mb-3 { margin-bottom: 0.75rem; } .mb-4 { margin-bottom: 1rem; } .mb-6 { margin-bottom: 1.5rem; } .mb-8 { margin-bottom: 2rem; } .mb-10 { margin-bottom: 2.5rem; }
.p-2 { padding: 0.5rem; } .p-4 { padding: 1rem; } .p-6 { padding: 1.5rem; } .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; } .px-4 { padding-left: 1rem; padding-right: 1rem; }
.w-full { width: 100%; } .max-w-sm { max-width: 24rem; } .max-w-lg { max-width: 32rem; } .max-w-2xl { max-width: 42rem; } .mx-auto { margin-left: auto; margin-right: auto; }
.text-center { text-align: center; } .text-xs { font-size: 0.75rem; } .text-lg { font-size: 1.125rem; } .text-xl { font-size: 1.25rem; } .text-3xl { font-size: 1.875rem; } .text-4xl { font-size: 2.25rem; } .text-6xl { font-size: 3.75rem; }
.font-bold { font-weight: 700; } .font-black { font-weight: 900; } .italic { font-style: italic; } .uppercase { text-transform: uppercase; } .tracking-widest { letter-spacing: 0.1em; }
.text-white { color: #ffffff; } .text-gray-300 { color: #d1d5db; } .text-gray-400 { color: #9ca3af; } .text-red-400 { color: #f87171; } .text-red-500 { color: #ef4444; } .text-green-300 { color: #86efac; } .text-green-400 { color: #4ade80; } .text-green-500 { color: #22c55e; } .text-yellow-400 { color: #facc15; } .text-blue-400 { color: #60a5fa; }
.pointer-events-none { pointer-events: none; } .opacity-50 { opacity: 0.5; }
.drop-shadow-md { filter: drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06)); }
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
</style>
