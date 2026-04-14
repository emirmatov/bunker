<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { doc, onSnapshot, collection, updateDoc } from 'firebase/firestore'
// Импортируем нашу колоду
import { catastrophes, professions, healths, phobias, inventories, specialCards, biology, hobbies, largeInventories, facts, getRandomItem } from '../gameData'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'

const route = useRoute()
const router = useRouter()
const roomId = route.params.id

const players = ref([])
const isHost = ref(false)
let unsubscribePlayers = null
let unsubscribeRoom = null

onMounted(() => {
  const roomRef = doc(db, "rooms", roomId)
  const playersRef = collection(db, "rooms", roomId, "players")

  // 1. Слушаем статус комнаты (для перехода в игру)
  unsubscribeRoom = onSnapshot(roomRef, (snapshot) => {
    const roomData = snapshot.data()
    // Если хост поменял статус на playing — улетаем в игру!
    if (roomData?.status === 'playing') {
      router.push(`/game/${roomId}`)
    }
  })

  // 2. Слушаем список игроков
  unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
    players.value = snapshot.docs.map(doc => doc.data())
    const me = players.value.find(p => p.uid === auth.currentUser?.uid)
    if (me?.isHost) isHost.value = true
  })
})

onUnmounted(() => {
  if (unsubscribePlayers) unsubscribePlayers()
  if (unsubscribeRoom) unsubscribeRoom()
})

// Логика раздачи карт (только для Хоста)
const startGame = async () => {
  try {
    // 1. Раздаем карты каждому игроку
    for (const player of players.value) {
      const playerRef = doc(db, "rooms", roomId, "players", player.uid)

      const playerCards = {
        profession: { value: getRandomItem(professions), isRevealed: false },
        biology: { value: getRandomItem(biology), isRevealed: false },
        health: { value: getRandomItem(healths), isRevealed: false },
        hobby: { value: getRandomItem(hobbies), isRevealed: false },
        inventory: { value: getRandomItem(inventories), isRevealed: false },
        largeInventory: { value: getRandomItem(largeInventories), isRevealed: false },
        phobia: { value: getRandomItem(phobias), isRevealed: false },
        fact1: { value: getRandomItem(facts), isRevealed: false },
        fact2: { value: getRandomItem(facts), isRevealed: false },
        // И две спец-карты, которые мы добавили на прошлом шаге:
        special1: { value: getRandomItem(specialCards), isRevealed: false },
        special2: { value: getRandomItem(specialCards), isRevealed: false }
      }

      await updateDoc(playerRef, { cards: playerCards })
    }

    // 2. Выбираем катастрофу и меняем статус комнаты
    const selectedCatastrophe = getRandomItem(catastrophes)
    const roomRef = doc(db, "rooms", roomId)

    await updateDoc(roomRef, {
      status: 'playing',
      catastrophe: selectedCatastrophe,
      bunkerSize: Math.max(2, Math.floor(players.value.length / 2)) // Выживет половина
    })

  } catch (e) {
    console.error("Ошибка при раздаче карт:", e)
  }
}
</script>

<template>
  <div class="lobby-container">
    <div class="header">
      <h2>Код бункера: <Tag severity="warn" :value="roomId" class="text-2xl" /></h2>
      <p>Внутри: {{ players.length }} чел.</p>
    </div>

    <div class="players-grid">
      <Card v-for="player in players" :key="player.uid" class="player-card">
        <template #title>
          <div class="card-title">
            {{ player.name }}
            <Tag :value="player.isHost ? 'Хост' : 'Игрок'" :severity="player.isHost ? 'danger' : 'info'" />
          </div>
        </template>
      </Card>
    </div>

    <div class="actions">
      <Button v-if="isHost" label="Начать игру" severity="danger" size="large" @click="startGame" />
      <p v-else>Ожидаем хоста...</p>
    </div>
  </div>
</template>

<style scoped>
/* Стили можно оставить прежние из прошлого шага */
.lobby-container { max-width: 600px; margin: 0 auto; padding: 2rem; }
.players-grid { display: flex; flex-direction: column; gap: 0.5rem; margin: 2rem 0; }
.card-title { display: flex; justify-content: space-between; align-items: center; }
</style>
